// Fills every table with example data through the running API.
//
//   npm run db:seed            add the example data (refuses if it is already there)
//   npm run db:seed -- --reset remove the old example data first, then add it again
//   npm run db:seed -- --remove remove the example data only
//
// Example companies use emails like demo.<name>@example.com. Example students
// use AIUB student emails (<AIUB ID>@student.aiub.edu) with the IDs listed in
// STUDENTS below. Every example account has the password Demo1234.
// Real accounts are never touched.
import 'dotenv/config';
import { deflateSync } from 'node:zlib';
import pg from 'pg';

const BASE = process.env.SEED_API_URL ?? `http://localhost:${process.env.PORT ?? 3000}/api`;
const PASSWORD = 'Demo1234';
const args = process.argv.slice(2);

// ---------- helpers ----------

function db() {
  return new pg.Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'aiub_job_fair',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
}

async function sql(text, params = []) {
  const c = db();
  await c.connect();
  try {
    return await c.query(text, params);
  } finally {
    await c.end();
  }
}

async function call(method, path, { token, json, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    body = new FormData();
    for (const [k, v] of Object.entries(form)) {
      if (v instanceof Blob) body.append(k, v, k === 'file' ? 'upload' : undefined);
      else body.append(k, v);
    }
  }
  const res = await fetch(BASE + path, { method, headers, body });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data?.message ?? data)}`);
  }
  return data;
}

/** A one-page PDF with a few lines of text. */
function makePdf(lines) {
  const esc = (s) => s.replace(/[\\()]/g, (m) => '\\' + m);
  const content =
    'BT /F1 20 Tf 60 780 Td (' + esc(lines[0]) + ') Tj /F1 12 Tf ' +
    lines.slice(1).map((l) => `0 -22 Td (${esc(l)}) Tj`).join(' ') +
    ' ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([Buffer.from(out)], { type: 'application/pdf' });
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** A 128x128 PNG: a coloured square with a lighter circle, as a simple logo or avatar. */
function makePng([r, g, b]) {
  const size = 128;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - 64, y - 64);
      const light = d < 40 ? 0.55 : d < 46 ? 0.25 : 0;
      row[1 + x * 3] = r + (255 - r) * light;
      row[2 + x * 3] = g + (255 - g) * light;
      row[3 + x * 3] = b + (255 - b) * light;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return new Blob([png], { type: 'image/png' });
}

const email = (name) => `demo.${name}@example.com`;
const studentEmail = (aiubId) => `${aiubId}@student.aiub.edu`;

/** WHERE clause matching every example account (companies and students). */
function demoUsers() {
  return {
    where: "email LIKE 'demo.%@example.com' OR email = ANY($1)",
    params: [STUDENTS.map((s) => studentEmail(s.aiubId))],
  };
}

// ---------- remove ----------

async function removeDemo() {
  // Profiles, jobs, applications, drops and criteria go with ON DELETE CASCADE.
  const { where, params } = demoUsers();
  const { rowCount } = await sql(`DELETE FROM users WHERE ${where}`, params);
  console.log(`Removed ${rowCount} example accounts and everything that belonged to them.`);
}

// ---------- data ----------

const COMPANIES = [
  {
    key: 'nexus', booth: 'A-01', color: [0, 51, 102],
    companyName: 'Nexus Softworks Ltd.', websiteUrl: 'https://nexus-softworks.example.com',
    industryType: 'Information Technology / Software', hrName: 'Farhana Kabir', hrMobileNumber: '01711000101',
    about: 'Nexus Softworks builds banking, healthcare and logistics software for clients in Bangladesh and abroad. Around 300 engineers work from our Dhaka office.',
    hasOngoingHiring: true,
  },
  {
    key: 'deshitel', booth: 'A-02', color: [196, 30, 58],
    companyName: 'Deshi Telecom Ltd.', websiteUrl: 'https://deshitel.example.com',
    industryType: 'Telecommunications', hrName: 'Tanvir Hasan', hrMobileNumber: '01811000202',
    about: 'Deshi Telecom runs mobile and fibre networks across all 8 divisions and serves more than 20 million customers.',
    hasOngoingHiring: true,
  },
  {
    key: 'padma', booth: 'B-05', color: [13, 148, 136],
    companyName: 'Padma Digital Finance', websiteUrl: 'https://padmafinance.example.com',
    industryType: 'FinTech / Digital Banking', hrName: 'Nusrat Jahan', hrMobileNumber: '01911000303',
    about: 'Padma Digital Finance offers mobile wallets, micro-loans and merchant payments to small businesses.',
    hasOngoingHiring: true,
  },
  {
    key: 'meghna', booth: 'B-07', color: [217, 119, 6],
    companyName: 'Meghna Consumer Goods', websiteUrl: 'https://meghnagoods.example.com',
    industryType: 'Manufacturing & FMCG', hrName: 'Rezaul Karim', hrMobileNumber: '01611000404',
    about: 'Meghna Consumer Goods makes food and home care products sold in 60,000 shops nationwide. We are collecting CVs for our 2027 trainee programme.',
    hasOngoingHiring: false,
  },
  {
    key: 'karnaphuli', booth: 'C-03', color: [30, 64, 175],
    companyName: 'Karnaphuli Bank PLC', websiteUrl: 'https://karnaphulibank.example.com',
    industryType: 'Commercial Banking & Finance', hrName: 'Shahida Akter', hrMobileNumber: '01511000505',
    about: 'Karnaphuli Bank has 140 branches and a growing digital banking team.',
    hasOngoingHiring: true,
  },
  {
    key: 'shopnil', booth: null, color: [124, 58, 237],
    companyName: 'Shopnil Shop Ltd.', websiteUrl: 'https://shopnil.example.com',
    industryType: 'E-Commerce & Retail', hrName: 'Imran Hossain', hrMobileNumber: '01311000606',
    about: 'Online marketplace for fashion and electronics. Booth to be announced.',
    hasOngoingHiring: true,
  },
  {
    key: 'quickstaff', booth: null, color: [100, 116, 139],
    companyName: 'QuickStaff Agency', websiteUrl: null,
    industryType: 'Consulting & Data Analytics', hrName: 'Kamal Uddin', hrMobileNumber: '01411000707',
    about: 'Recruitment agency.',
    hasOngoingHiring: true,
  },
];

const JOBS = [
  {
    key: 'backend', company: 'nexus', positionName: 'Junior Backend Developer', location: 'dhaka', workplace: 'office',
    educationRequirement: 'BSc in CSE, SE or a related subject', additionalRequirements: 'Good written English',
    responsibilities: 'Build and maintain REST APIs\nWrite unit tests\nReview code with senior engineers',
    skillsAndExpertise: 'TypeScript, Node.js, NestJS, PostgreSQL, Git', employmentStatus: 'full_time',
    salaryNegotiable: false, salaryAmount: '40,000 - 55,000 BDT', compensationAndBenefits: '2 festival bonuses, lunch, health insurance',
    deadline: '2026-12-31',
    questions: [
      { text: 'Why do you want to join Nexus Softworks?' },
      { text: 'How many years have you worked with TypeScript?', type: 'single_choice', options: ['Less than 1', '1-2', '3 or more'] },
      { text: 'Link to a project you are proud of (GitHub or live site)', isRequired: false },
    ],
  },
  {
    key: 'frontend-intern', company: 'nexus', positionName: 'Frontend Developer Intern', location: 'anywhere_in_bangladesh', workplace: 'remote',
    educationRequirement: 'Final-year BSc student in CSE', additionalRequirements: null,
    responsibilities: 'Build React screens from Figma designs\nFix UI bugs',
    skillsAndExpertise: 'React, TypeScript, Tailwind CSS', employmentStatus: 'internship',
    salaryNegotiable: false, salaryAmount: '15,000 BDT per month', compensationAndBenefits: null, deadline: '2026-12-15',
    questions: [{ text: 'Can you work 20 hours a week?', type: 'single_choice', options: ['Yes', 'No'] }],
  },
  {
    key: 'qa', company: 'nexus', positionName: 'QA Engineer', location: 'dhaka', workplace: 'office',
    educationRequirement: 'BSc in CSE', additionalRequirements: null,
    responsibilities: 'Write test plans, run manual and automated tests', skillsAndExpertise: 'Selenium, Postman, SQL',
    employmentStatus: 'full_time', salaryNegotiable: true, salaryAmount: null, compensationAndBenefits: null,
    deadline: '2026-12-20', questions: [], closeAfterApplying: true,
  },
  {
    key: 'network', company: 'deshitel', positionName: 'Network Engineer Trainee', location: 'chattogram', workplace: 'office',
    educationRequirement: 'BSc in EEE or ETE', additionalRequirements: 'Willing to travel to tower sites',
    responsibilities: 'Monitor the radio network\nSupport field engineers\nPrepare daily network reports',
    skillsAndExpertise: 'Networking basics, Linux, Excel', employmentStatus: 'full_time',
    salaryNegotiable: false, salaryAmount: '35,000 BDT', compensationAndBenefits: 'Transport, mobile allowance', deadline: '2026-12-10',
    questions: [{ text: 'Do you have a CCNA certificate?', type: 'single_choice', options: ['Yes', 'No', 'In progress'] }],
  },
  {
    key: 'cx', company: 'deshitel', positionName: 'Customer Experience Executive', location: 'dhaka', workplace: 'online',
    educationRequirement: 'Any bachelor degree', additionalRequirements: 'Fluent Bangla and English',
    responsibilities: 'Answer customer chats and calls, solve billing issues', skillsAndExpertise: 'Communication, patience, MS Office',
    employmentStatus: 'contractual', salaryNegotiable: false, salaryAmount: '25,000 BDT', compensationAndBenefits: null, deadline: '2026-11-30',
    questions: [],
  },
  {
    key: 'analyst', company: 'padma', positionName: 'Data Analyst', location: 'dhaka', workplace: 'online',
    educationRequirement: 'BSc in CSE, Statistics or Economics', additionalRequirements: null,
    responsibilities: 'Build dashboards on loan and payment data\nFind fraud patterns with the risk team',
    skillsAndExpertise: 'SQL, Python, Power BI', employmentStatus: 'full_time',
    salaryNegotiable: true, salaryAmount: null, compensationAndBenefits: 'Hybrid work, yearly bonus', deadline: '2026-12-31',
    questions: [
      { text: 'Describe a dataset you analysed and what you found.' },
      { text: 'Which tool do you use most?', type: 'single_choice', options: ['Excel', 'Python', 'R', 'Power BI'] },
    ],
  },
  {
    key: 'pm-intern', company: 'padma', positionName: 'Product Management Intern', location: 'dhaka', workplace: 'office',
    educationRequirement: 'BBA or BSc student', additionalRequirements: null,
    responsibilities: 'Talk to merchants, write user stories, help run app releases', skillsAndExpertise: 'Communication, Figma, Jira',
    employmentStatus: 'internship', salaryNegotiable: false, salaryAmount: '12,000 BDT per month', compensationAndBenefits: null, deadline: '2026-12-05',
    questions: [{ text: 'Which app do you think has the best product design, and why?' }],
  },
  {
    key: 'mto', company: 'karnaphuli', positionName: 'Management Trainee Officer', location: 'anywhere_in_bangladesh', workplace: 'office',
    educationRequirement: 'Bachelor or Master in any subject, CGPA 3.0 or above', additionalRequirements: 'Age 28 or below',
    responsibilities: 'Rotate through branch banking, credit and digital banking for one year', skillsAndExpertise: 'Communication, analysis, MS Excel',
    employmentStatus: 'full_time', salaryNegotiable: false, salaryAmount: '50,000 BDT', compensationAndBenefits: 'Provident fund, 4 bonuses, staff loan', deadline: '2026-12-20',
    questions: [
      { text: 'Are you willing to work at any branch in Bangladesh?', type: 'single_choice', options: ['Yes', 'No'] },
      { text: 'Why banking?' },
    ],
  },
  {
    key: 'shopnil-job', company: 'shopnil', positionName: 'Marketing Executive', location: 'dhaka', workplace: 'office',
    educationRequirement: 'BBA in Marketing', additionalRequirements: null, responsibilities: 'Run social media campaigns',
    skillsAndExpertise: 'Facebook Ads, Canva', employmentStatus: 'full_time', salaryNegotiable: true, salaryAmount: null,
    compensationAndBenefits: null, deadline: '2026-12-31', questions: [],
  },
];

const STUDENTS = [
  {
    key: 'tahsin', name: 'Tahsin Ahmed', aiubId: '21-45101-1', mobileNumber: '01712345001', gender: 'male',
    preferredJobType: 'full_time', studyLevel: 'graduated', preferredIndustryTypes: ['Information Technology / Software', 'FinTech / Digital Banking'],
    seminarParticipation: true, address: 'House 12, Road 5, Kuril, Dhaka', picture: [37, 99, 235],
    linkedinUrl: 'https://www.linkedin.com/in/tahsin-ahmed-demo', githubUrl: 'https://github.com/tahsin-demo', portfolioUrl: 'https://tahsin.example.com',
    extracurricularActivities: 'General Secretary, AIUB Computer Club (2024)\nFinalist, National Hackathon 2025',
    educations: [
      { level: 'bsc', institutionName: 'American International University-Bangladesh', cgpa: 3.82, subject: 'Computer Science and Engineering', passingYear: 2026 },
      { level: 'hsc', institutionName: 'Notre Dame College', cgpa: 5, subject: 'Science', passingYear: 2021 },
      { level: 'ssc', institutionName: 'Motijheel Govt. Boys High School', cgpa: 5, subject: 'Science', passingYear: 2019 },
    ],
    experiences: [
      { companyName: 'Nexus Softworks Ltd.', industryType: 'Software', jobType: 'internship', designation: 'Software Engineer Intern', startDate: '2025-06-01', endDate: '2025-09-30', responsibilities: 'Built REST APIs with NestJS and wrote tests' },
    ],
    references: [
      { name: 'Dr. Karim Ahmed', designation: 'Professor', organization: 'AIUB', email: 'karim.ahmed@example.org', mobile: '01912345601', relation: 'academic' },
    ],
  },
  {
    key: 'nusrat', name: 'Nusrat Jahan Mim', aiubId: '22-47890-2', mobileNumber: '01812345002', gender: 'female',
    preferredJobType: 'internship', studyLevel: 'ongoing', preferredIndustryTypes: ['Information Technology / Software'],
    seminarParticipation: true, address: 'Block C, Bashundhara R/A, Dhaka', picture: [219, 39, 119],
    githubUrl: 'https://github.com/nusrat-demo',
    educations: [
      { level: 'bsc', institutionName: 'American International University-Bangladesh', cgpa: 3.65, subject: 'Computer Science and Engineering', passingYear: 2027 },
      { level: 'hsc', institutionName: 'Viqarunnisa Noon College', cgpa: 5, subject: 'Science', passingYear: 2022 },
    ],
    references: [
      { name: 'Ms. Sadia Rahman', designation: 'Assistant Professor', organization: 'AIUB', email: 'sadia.rahman@example.org', mobile: '01912345602', relation: 'academic' },
    ],
  },
  {
    key: 'arif', name: 'Arif Hossain', aiubId: '20-43210-3', mobileNumber: '01912345003', gender: 'male',
    preferredJobType: 'full_time', studyLevel: 'graduated', preferredIndustryTypes: ['Telecommunications'],
    seminarParticipation: false, address: 'Agrabad, Chattogram',
    educations: [
      { level: 'bsc', institutionName: 'American International University-Bangladesh', cgpa: 3.41, subject: 'Electrical and Electronic Engineering', passingYear: 2025 },
      { level: 'hsc', institutionName: 'Chittagong College', cgpa: 4.83, subject: 'Science', passingYear: 2020 },
    ],
    experiences: [
      { companyName: 'Deshi Telecom Ltd.', industryType: 'Telecommunications', jobType: 'internship', designation: 'Network Intern', startDate: '2025-01-05', endDate: '2025-04-05', responsibilities: 'Monitored network alarms' },
      { companyName: 'SkyNet ISP', industryType: 'Telecommunications', jobType: 'part_time', designation: 'Support Engineer', startDate: '2025-06-01', endDate: null, responsibilities: 'Fixed customer connection problems' },
    ],
  },
  {
    key: 'sumaiya', name: 'Sumaiya Islam', aiubId: '21-44582-1', mobileNumber: '01612345004', gender: 'female',
    preferredJobType: 'full_time', studyLevel: 'graduated', preferredIndustryTypes: ['FinTech / Digital Banking', 'Commercial Banking & Finance'],
    seminarParticipation: true, address: 'Dhanmondi 27, Dhaka', picture: [5, 150, 105],
    linkedinUrl: 'https://www.linkedin.com/in/sumaiya-islam-demo',
    educations: [
      { level: 'msc_1', institutionName: 'American International University-Bangladesh', cgpa: 3.9, subject: 'MBA in Finance', passingYear: 2026 },
      { level: 'bsc', institutionName: 'University of Dhaka', cgpa: 3.55, subject: 'Statistics', passingYear: 2024 },
    ],
    experiences: [
      { companyName: 'Padma Digital Finance', industryType: 'FinTech', jobType: 'internship', designation: 'Data Intern', startDate: '2025-02-01', endDate: '2025-07-31', responsibilities: 'Cleaned payment data and built Power BI reports' },
    ],
    references: [
      { name: 'Mr. Habibur Rahman', designation: 'Head of Data', organization: 'Padma Digital Finance', email: 'habib.rahman@example.org', mobile: '01712345603', relation: 'professional' },
    ],
  },
  {
    key: 'rakib', name: 'Rakibul Hasan', aiubId: '22-46001-1', mobileNumber: '01512345005', gender: 'male',
    preferredJobType: 'internship', studyLevel: 'ongoing', preferredIndustryTypes: ['FinTech / Digital Banking', 'E-Commerce & Retail'],
    seminarParticipation: true, address: 'Uttara Sector 7, Dhaka',
    educations: [{ level: 'bsc', institutionName: 'American International University-Bangladesh', cgpa: 3.2, subject: 'Business Administration (BBA)', passingYear: 2027 }],
  },
  {
    key: 'farzana', name: 'Farzana Akter', aiubId: '19-40555-2', mobileNumber: '01312345006', gender: 'female',
    preferredJobType: 'full_time', studyLevel: 'graduated', preferredIndustryTypes: ['Commercial Banking & Finance', 'Manufacturing & FMCG'],
    seminarParticipation: false, address: 'Mirpur 10, Dhaka', picture: [234, 88, 12],
    educations: [
      { level: 'bsc', institutionName: 'American International University-Bangladesh', cgpa: 3.68, subject: 'Business Administration (BBA)', passingYear: 2024 },
      { level: 'hsc', institutionName: 'Holy Cross College', cgpa: 5, subject: 'Commerce', passingYear: 2019 },
    ],
    experiences: [
      { companyName: 'Meghna Consumer Goods', industryType: 'FMCG', jobType: 'full_time', designation: 'Sales Officer', startDate: '2024-08-01', endDate: null, responsibilities: 'Managed 40 retail shops in Mirpur' },
    ],
    references: [
      { name: 'Mr. Rezaul Karim', designation: 'Area Sales Manager', organization: 'Meghna Consumer Goods', email: 'rezaul.k@example.org', mobile: '01612345604', relation: 'professional' },
    ],
  },
  {
    key: 'tanvir', name: 'Tanvir Rahman', aiubId: '21-45222-3', mobileNumber: '01412345007', gender: 'male',
    preferredJobType: 'full_time', studyLevel: 'graduated', preferredIndustryTypes: ['Information Technology / Software'],
    seminarParticipation: true, address: 'Bashundhara R/A, Dhaka',
    educations: [{ level: 'bsc', institutionName: 'American International University-Bangladesh', cgpa: 3.05, subject: 'Computer Science and Engineering', passingYear: 2025 }],
  },
  {
    // No CV yet: shows an incomplete profile.
    key: 'mehedi', name: 'Mehedi Hasan', aiubId: '23-51234-1', mobileNumber: '01712345008', gender: 'male',
    preferredJobType: 'internship', studyLevel: 'ongoing', preferredIndustryTypes: ['Telecommunications', 'Information Technology / Software'],
    seminarParticipation: true, address: 'Khilkhet, Dhaka', noCv: true,
    educations: [{ level: 'hsc', institutionName: 'Dhaka College', cgpa: 4.75, subject: 'Science', passingYear: 2023 }],
  },
];

// student, job, joining date, answers by question number, status set by the company
const APPLICATIONS = [
  ['tahsin', 'backend', 'within_1_month', { 1: 'I like building reliable systems and Nexus works on real banking products.', 2: '1-2', 3: 'https://github.com/tahsin-demo/fair-api' }, 'shortlisted'],
  ['tahsin', 'analyst', 'within_1_month', { 1: 'I analysed AIUB library loans and found peak hours for staffing.', 2: 'Python' }, 'submitted'],
  ['nusrat', 'frontend-intern', 'immediately', { 1: 'Yes' }, 'hired'],
  ['nusrat', 'backend', 'within_15_days', { 1: 'I want to learn backend work from experienced engineers.', 2: 'Less than 1' }, 'rejected'],
  ['tanvir', 'backend', 'immediately', { 1: 'Nexus is known for good mentoring.', 2: '1-2' }, 'submitted'],
  ['tanvir', 'qa', 'immediately', {}, 'shortlisted'],
  ['arif', 'network', 'within_1_week', { 1: 'In progress' }, 'shortlisted'],
  ['arif', 'cx', 'immediately', {}, 'submitted'],
  ['sumaiya', 'analyst', 'within_15_days', { 1: 'At Padma I studied failed payments by hour and bank, and cut retries by 12%.', 2: 'Power BI' }, 'hired'],
  ['sumaiya', 'mto', 'within_1_month', { 1: 'Yes', 2: 'I enjoy finance and working with people.' }, 'shortlisted'],
  ['farzana', 'mto', 'within_1_month', { 1: 'Yes', 2: 'Banking fits my BBA and sales experience.' }, 'submitted'],
  ['rakib', 'pm-intern', 'immediately', { 1: 'bKash-style wallets: very few taps to pay.' }, 'submitted'],
];

// student, company (null = general pool), note
const CV_DROPS = [
  ['tahsin', null, 'Open to backend and data roles.'],
  ['farzana', null, null],
  ['rakib', null, 'Looking for a business internship from January.'],
  ['arif', null, null],
  ['farzana', 'meghna', 'Interested in the 2027 trainee programme.'],
  ['sumaiya', 'karnaphuli', 'Interested in digital banking.'],
  ['tanvir', 'meghna', null],
];

const CRITERIA = [
  {
    company: 'meghna', title: 'Management Trainees 2027',
    description: 'Fresh graduates for our one-year trainee programme in sales, supply chain and brand. Must be willing to work outside Dhaka.',
    preferredJobType: 'full_time', studyLevel: 'graduated', industryType: 'Manufacturing & FMCG', skills: 'Communication, Excel, leadership', attachment: true,
  },
  {
    company: 'meghna', title: 'Supply Chain Interns',
    description: 'Students who can join a 3-month internship at our Gazipur factory.',
    preferredJobType: 'internship', studyLevel: 'ongoing', industryType: null, skills: 'Excel, ERP basics', attachment: false,
  },
  {
    company: 'karnaphuli', title: 'Future Digital Banking Team',
    description: 'Graduates interested in mobile banking products, for openings in 2027.',
    preferredJobType: 'full_time', studyLevel: 'graduated', industryType: 'FinTech / Digital Banking', skills: 'SQL, product thinking', attachment: false,
  },
];

// ---------- run ----------

async function seed() {
  const demo = demoUsers();
  const existing = await sql(`SELECT count(*)::int AS n FROM users WHERE ${demo.where}`, demo.params);
  if (existing.rows[0].n > 0) {
    console.error('Example data is already there. Use  npm run db:seed -- --reset  to recreate it.');
    process.exit(1);
  }
  const ids = STUDENTS.map((s) => s.aiubId);
  const clash = await sql('SELECT aiub_id FROM student_profiles WHERE aiub_id = ANY($1)', [ids]);
  if (clash.rowCount) {
    console.error(`These AIUB IDs are already used by real students: ${clash.rows.map((r) => r.aiub_id).join(', ')}`);
    process.exit(1);
  }

  // Companies
  const companies = {};
  for (const c of COMPANIES) {
    const res = await call('POST', '/auth/register/employer', {
      json: {
        email: email(c.key), password: PASSWORD, companyName: c.companyName, websiteUrl: c.websiteUrl,
        industryType: c.industryType, about: c.about, hrName: c.hrName, hrEmail: email(c.key),
        hrMobileNumber: c.hrMobileNumber, hasOngoingHiring: c.hasOngoingHiring,
      },
    });
    await call('POST', '/employers/me/logo', { token: res.accessToken, form: { file: makePng(c.color) } });
    if (c.booth) await call('PATCH', '/employers/me', { token: res.accessToken, json: { boothNumber: c.booth } });
    await sql('UPDATE users SET email_verified = true WHERE id = $1', [res.user.id]);
    companies[c.key] = { token: res.accessToken, id: res.profile.id, ...c };
  }
  console.log(`Companies: ${COMPANIES.length} (5 with booths, 2 without)`);

  // Jobs
  const jobs = {};
  for (const j of JOBS) {
    const c = companies[j.company];
    const { key, company, closeAfterApplying, ...body } = j;
    jobs[key] = { ...(await call('POST', '/jobs', { token: c.token, json: body })), companyToken: c.token, closeAfterApplying };
  }
  console.log(`Jobs: ${JOBS.length} with ${JOBS.reduce((n, j) => n + j.questions.length, 0)} questions`);

  // Students
  const students = {};
  for (const s of STUDENTS) {
    const { key, picture, noCv, ...profile } = s;
    const res = await call('POST', '/auth/register/student', { json: { email: studentEmail(s.aiubId), password: PASSWORD, ...profile } });
    await sql('UPDATE users SET email_verified = true WHERE id = $1', [res.user.id]);
    if (!noCv) {
      const cv = makePdf([
        s.name,
        `AIUB ID: ${s.aiubId}   |   ${studentEmail(s.aiubId)}   |   ${s.mobileNumber}`,
        '',
        'EDUCATION',
        ...s.educations.map((e) => `${e.subject ?? e.level} - ${e.institutionName} (${e.passingYear})`),
        '',
        'EXPERIENCE',
        ...(s.experiences ?? []).map((e) => `${e.designation}, ${e.companyName}`),
        ...(s.experiences?.length ? [] : ['Fresher']),
        '',
        `Interests: ${s.preferredIndustryTypes.join(', ')}`,
        'Example CV created by the AIUB Job Fair seed script.',
      ]);
      await call('POST', '/students/me/cv', { token: res.accessToken, form: { file: cv } });
    }
    if (picture) await call('POST', '/students/me/picture', { token: res.accessToken, form: { file: makePng(picture) } });
    students[key] = { token: res.accessToken, id: res.profile.id };
  }
  console.log(`Students: ${STUDENTS.length} (1 without a CV, so not ready to apply)`);

  // Applications
  for (const [student, jobKey, joiningDate, answers, status] of APPLICATIONS) {
    const job = jobs[jobKey];
    const app = await call('POST', `/jobs/${job.id}/apply`, {
      token: students[student].token,
      json: {
        joiningDate,
        answers: Object.entries(answers).map(([n, answer]) => ({ questionId: job.questions[Number(n) - 1].id, answer })),
      },
    });
    if (status !== 'submitted') {
      await call('PATCH', `/applications/${app.id}/status`, { token: job.companyToken, json: { status } });
    }
  }
  for (const job of Object.values(jobs)) {
    if (job.closeAfterApplying) await call('PATCH', `/jobs/${job.id}/close`, { token: job.companyToken });
  }
  console.log(`Applications: ${APPLICATIONS.length} (submitted, shortlisted, rejected and hired). The QA Engineer job is closed.`);

  // CV drops
  for (const [student, company, note] of CV_DROPS) {
    await call('POST', '/cv-drops', {
      token: students[student].token,
      json: { ...(company ? { employerId: companies[company].id } : {}), ...(note ? { note } : {}) },
    });
  }
  console.log(`CV drops: ${CV_DROPS.length} (4 to the general pool, 3 to companies)`);

  // Candidate criteria
  for (const { company, attachment, ...body } of CRITERIA) {
    const c = companies[company];
    const created = await call('POST', '/candidate-criteria', { token: c.token, json: body });
    if (attachment) {
      const pdf = makePdf([body.title, c.companyName, '', body.description.slice(0, 90), `Skills: ${body.skills}`]);
      await call('POST', `/candidate-criteria/${created.id}/attachment`, { token: c.token, form: { file: pdf } });
    }
  }
  console.log(`Candidate criteria: ${CRITERIA.length}`);

  // One open password-reset request (it expires after 15 minutes, like a real one).
  const mehedi = studentEmail(STUDENTS.find((s) => s.key === 'mehedi').aiubId);
  await call('POST', '/auth/forgot-password', { json: { email: mehedi } });
  console.log(`Password reset: 1 open request for ${mehedi} (expires in 15 minutes)`);

  console.log(`\nDone. Every example account uses the password ${PASSWORD}, for example:`);
  console.log(`  student:  ${studentEmail(STUDENTS[0].aiubId)}`);
  console.log('  employer: demo.nexus@example.com');
}

try {
  if (args.includes('--remove')) {
    await removeDemo();
  } else {
    if (args.includes('--reset')) await removeDemo();
    await seed();
  }
} catch (e) {
  console.error(`\nSeeding stopped: ${e.message}`);
  console.error('Is the backend running? Remove partial data with: npm run db:seed -- --remove');
  process.exit(1);
}
