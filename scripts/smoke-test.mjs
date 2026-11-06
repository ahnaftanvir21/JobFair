// End-to-end smoke test: walks the whole student and employer flow against a running server.
// Usage: start the server (npm run start:dev), then run: npm run test:smoke
// Another URL can be passed: npm run test:smoke -- http://localhost:3000/api
// It creates accounts ending in .test (plus AIUB student emails it remembers) and deletes
// them, with all their rows, when done.
// Uploaded test files stay in uploads/, which is git-ignored.
import 'dotenv/config';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const BASE = process.argv[2] ?? `http://localhost:${process.env.PORT ?? 3000}/api`;
const tag = Date.now().toString(36);
let failures = 0;
let passes = 0;
/** Student accounts to delete at the end (their emails cannot end in .test). */
const studentEmails = [];
// Emails are read from the outbox folder, so run the server with SMTP_HOST blank.
const outbox = process.env.MAIL_OUTBOX_DIR || 'mail-outbox';

/** Latest email to this address saved at or after `after` (ms), with its code and link token. */
async function readMail(email, after) {
  for (let i = 0; i < 40; i++) {
    const files = existsSync(outbox)
      ? readdirSync(outbox).filter((f) => f.endsWith(`-${email}.txt`) && Number(f.split('-')[0]) >= after).sort()
      : [];
    if (files.length) {
      const text = readFileSync(join(outbox, files.at(-1)), 'utf8');
      return { count: files.length, text, code: /code: (\d{6})/.exec(text)?.[1], token: /token=([a-f0-9]{64})/.exec(text)?.[1] };
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return { count: 0 };
}

/** Marks a test account's email as verified straight in the database. */
async function markVerified(email) {
  const db = dbClient();
  await db.connect();
  await db.query('UPDATE users SET email_verified = true WHERE email = $1', [email.toLowerCase()]);
  await db.end();
}

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const PNG = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  Buffer.alloc(32),
]);
const FAKE_PDF = Buffer.from('MZ this is an exe renamed to pdf');

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
      if (v && v.buffer) body.append(k, new Blob([v.buffer], { type: v.type }), v.name);
      else body.append(k, v);
    }
  }
  const res = await fetch(BASE + path, { method, headers, body });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

function check(name, cond, detail) {
  if (cond) { passes++; console.log(`  ok   ${name}`); }
  else { failures++; console.log(`  FAIL ${name}`, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : ''); }
}

async function expectStatus(name, promise, status) {
  const r = await promise;
  check(`${name} -> ${status}`, r.status === status, { got: r.status, body: r.data });
  return r;
}

const today = new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10);
const future = '2026-12-20';
const past = '2020-01-01';

console.log('\n== Admin account ==');
const adminEmail = `admin.${tag}@fair.test`;
{
  const db = dbClient();
  await db.connect();
  await db.query("INSERT INTO users (email, password_hash, role, email_verified) VALUES ($1, $2, 'admin', true)", [adminEmail, await bcrypt.hash('adminPass123', 10)]);
  await db.end();
}
const adminLogin = (await expectStatus('admin logs in', call('POST', '/auth/login', { json: { email: adminEmail, password: 'adminPass123' } }), 200)).data;
const A = adminLogin.accessToken;
check('login says admin', adminLogin.user?.role === 'admin', adminLogin.user);
await expectStatus('admin cannot register through the API', call('POST', '/auth/register/employer', { json: { email: `x.${tag}@fair.test`, password: 'secret123', role: 'admin' } }), 400);

console.log('\n== Employer ==');
const employerBody = {
  email: `hr.${tag}@acme.test`, password: 'secret123',
  companyName: `Acme ${tag}`, websiteUrl: 'https://acme.test', industryType: 'Software',
  about: 'We build things', hrName: 'Hasan', hrEmail: 'hr@acme.test', hrMobileNumber: '01712345678',
};
await expectStatus('employer register with only email and password', call('POST', '/auth/register/employer', { json: { email: employerBody.email, password: 'secret123' } }), 400);
await expectStatus('employer register bad HR mobile', call('POST', '/auth/register/employer', { json: { ...employerBody, hrMobileNumber: '123' } }), 400);
check('failed employer registration left no account', (await call('POST', '/auth/login', { json: { email: employerBody.email, password: 'secret123' } })).status === 401);
const empStart = Date.now();
const emp = (await expectStatus('register employer with company profile', call('POST', '/auth/register/employer', { json: employerBody }), 201)).data;
const E = emp.accessToken;
const company = emp.profile;

console.log('\n== Email verification ==');
check('new account starts unverified', emp.user?.emailVerified === false, emp.user);
const blocked = await expectStatus('unverified company cannot browse students', call('GET', '/students', { token: E }), 403);
check('told to verify the email', /Verify your email/.test(blocked.data?.message), blocked.data);
await expectStatus('unverified company cannot post a job', call('POST', '/jobs', { token: E, json: {} }), 403);
await expectStatus('unverified company can read own profile', call('GET', '/employers/me', { token: E }), 200);
check('/auth/me shows unverified', (await call('GET', '/auth/me', { token: E })).data?.emailVerified === false);
const empMail = await readMail(employerBody.email, empStart);
check('verification email has a 6-digit code and a link', empMail.code && empMail.token && /verify-email\?token=/.test(empMail.text), empMail);
await expectStatus('ask for another code right away', call('POST', '/auth/resend-verification', { token: E }), 429);
await expectStatus('verify needs the code or link', call('POST', '/auth/verify-email', { token: E, json: {} }), 400);
await expectStatus('code without login', call('POST', '/auth/verify-email', { json: { code: empMail.code } }), 401);
const wrongVerify = empMail.code === '000000' ? '111111' : '000000';
const wrongV = await expectStatus('wrong verification code', call('POST', '/auth/verify-email', { token: E, json: { code: wrongVerify } }), 400);
check('told how many tries are left', /4 tries left/.test(wrongV.data?.message), wrongV.data);
const hiddenQueue = (await expectStatus('admin lists companies', call('GET', `/admin/employers?q=${tag}`, { token: A }), 200)).data;
check('unverified company is not in the admin list', hiddenQueue.total === 0, hiddenQueue.items?.map((e) => e.companyName));
await expectStatus('unverified company detail hidden from admin', call('GET', `/admin/employers/${company.id}`, { token: A }), 404);
const verified = (await expectStatus('verify with the code', call('POST', '/auth/verify-email', { token: E, json: { code: empMail.code } }), 200)).data;
check('verify answer shows verified user', verified.user?.emailVerified === true, verified);
await expectStatus('code works only once', call('POST', '/auth/verify-email', { json: { token: empMail.token } }), 400);
await expectStatus('resend after verifying', call('POST', '/auth/resend-verification', { token: E }), 400);

console.log('\n== Company approval ==');
check('new company is pending', company?.status === 'pending', company?.status);
const pendingJob = await expectStatus('pending company cannot post a job', call('POST', '/jobs', { token: E, json: {} }), 403);
check('told it is waiting for approval', /waiting for admin approval/.test(pendingJob.data?.message), pendingJob.data);
await expectStatus('pending company cannot browse students', call('GET', '/students', { token: E }), 403);
await expectStatus('pending company can read own profile', call('GET', '/employers/me', { token: E }), 200);
await expectStatus('pending company can read /auth/me', call('GET', '/auth/me', { token: E }), 200);
check('pending company hidden from company search', (await call('GET', `/employers?q=${tag}`)).data?.total === 0);
await expectStatus('pending company page hidden', call('GET', `/employers/${company.id}`), 404);
await expectStatus('employer cannot use admin routes', call('GET', '/admin/stats', { token: E }), 403);
await expectStatus('visitor cannot use admin routes', call('GET', '/admin/stats'), 401);
const queue = (await expectStatus('admin sees approval queue', call('GET', `/admin/employers?status=pending&q=${tag}`, { token: A }), 200)).data;
check('queue shows company with login email', queue.items?.[0]?.id === company.id && queue.items[0].user?.email === employerBody.email, queue.items?.[0]);
check('queue does not leak password data', !JSON.stringify(queue).includes('password'));
const approveStart = Date.now();
const approved = (await expectStatus('admin approves company', call('PATCH', `/admin/employers/${company.id}/approve`, { token: A }), 200)).data;
check('company approved with review time', approved.status === 'approved' && approved.reviewedAt, approved);
const approveMail = await readMail(employerBody.email, approveStart);
check('company gets an approval email', /is approved for AIUB Job Fair 2026/.test(approveMail.text ?? ''), approveMail.text?.slice(0, 200));
await expectStatus('approved company can browse students', call('GET', '/students', { token: E }), 200);
await expectStatus('company can read /auth/me', call('GET', '/auth/me', { token: E }), 200);
check('new company shows in company search', (await call('GET', `/employers?q=${tag}`, { token: E })).data?.total === 1);
await expectStatus('new company page is public', call('GET', `/employers/${company.id}`), 200);
const studentMailCompany = await expectStatus('AIUB student email cannot register a company', call('POST', '/auth/register/employer', { json: { ...employerBody, email: '22-12345-1@student.aiub.edu' } }), 400);
check('told to use a company email', /Student emails cannot register a company/.test(studentMailCompany.data?.message), studentMailCompany.data);
check('registration returns company profile', company?.companyName === `Acme ${tag}` && company?.hasOngoingHiring === true, company);
await expectStatus('separate create-company route is gone', call('POST', '/employers/me', { token: E, json: {} }), 404);
await expectStatus('clear required field', call('PATCH', '/employers/me', { token: E, json: { companyName: null } }), 400);
const withLogo = (await expectStatus('upload logo PNG', call('POST', '/employers/me/logo', { token: E, form: { file: { buffer: PNG, type: 'image/png', name: 'logo.png' } } }), 201)).data;
await expectStatus('anyone can load a company logo', call('GET', withLogo.logoUrl.replace('/api', '')), 200);
await expectStatus('upload logo that is a PDF', call('POST', '/employers/me/logo', { token: E, form: { file: { buffer: PDF, type: 'image/png', name: 'logo.png' } } }), 400);

const jobBody = {
  positionName: 'Junior Developer', location: 'dhaka', workplace: 'office',
  educationRequirement: 'BSc in CSE', responsibilities: 'Write code', skillsAndExpertise: 'TypeScript',
  employmentStatus: 'full_time', salaryNegotiable: true, deadline: future,
  questions: [
    { text: 'Why do you want this job?' },
    { text: 'Years of experience?', type: 'single_choice', options: ['0', '1-2', '3+'] },
    { text: 'Portfolio link', isRequired: false },
  ],
};
await expectStatus('job with past deadline', call('POST', '/jobs', { token: E, json: { ...jobBody, deadline: past } }), 400);
await expectStatus('job not negotiable without amount', call('POST', '/jobs', { token: E, json: { ...jobBody, salaryNegotiable: false } }), 400);
await expectStatus('single_choice with one option', call('POST', '/jobs', { token: E, json: { ...jobBody, questions: [{ text: 'Q', type: 'single_choice', options: ['a'] }] } }), 400);
await expectStatus('bad location', call('POST', '/jobs', { token: E, json: { ...jobBody, location: 'mars' } }), 400);
const job = (await expectStatus('create job with 3 questions', call('POST', '/jobs', { token: E, json: jobBody }), 201)).data;
check('job has 3 ordered questions', job.questions?.length === 3 && job.questions[0].order === 1 && job.questions[2].order === 3, job.questions);
check('compensation default', job.compensationAndBenefits === 'As per company policy', job.compensationAndBenefits);
check('job isOpen', job.isOpen === true);
const job2 = (await expectStatus('create second job (no questions)', call('POST', '/jobs', { token: E, json: { ...jobBody, positionName: 'Intern', employmentStatus: 'part_time', salaryNegotiable: false, salaryAmount: '15,000 BDT', questions: [] } }), 201)).data;
const edited = (await expectStatus('edit job questions before applications', call('PATCH', `/jobs/${job2.id}`, { token: E, json: { questions: [{ text: 'Are you available on weekends?', type: 'single_choice', options: ['Yes', 'No'] }] } }), 200)).data;
check('job2 now has 1 question', edited.questions?.length === 1, edited.questions);

console.log('\n== Student ==');
const aiubId = `2${tag.slice(-1).replace(/\D/, '1')}-${String(Date.now()).slice(-5)}-1`;
const studentEmail = (id) => `${id}@student.aiub.edu`;
const studentBody = {
  email: studentEmail(aiubId), password: 'secret123',
  name: 'Rahim Uddin', aiubId, mobileNumber: '01812345678',
  preferredJobType: 'full_time', studyLevel: 'graduated', preferredIndustryTypes: ['Software Development'],
  seminarParticipation: true, address: 'Kuril, Dhaka', gender: 'male',
  linkedinUrl: 'https://linkedin.com/in/rahim',
  educations: [{ level: 'bsc', institutionName: 'AIUB', cgpa: 3.75, subject: 'CSE', passingYear: 2026 }],
  references: [{ name: 'Dr. Karim', designation: 'Professor', organization: 'AIUB', email: 'karim@aiub.test', mobile: '01912345678', relation: 'academic' }],
};
const reg = (body) => call('POST', '/auth/register/student', { json: body });
await expectStatus('student register with only email and password', reg({ email: studentBody.email, password: 'secret123' }), 400);
await expectStatus('student register without education', reg({ ...studentBody, educations: [] }), 400);
await expectStatus('student register without address', reg({ ...studentBody, address: undefined }), 400);
await expectStatus('student register bad AIUB ID', reg({ ...studentBody, aiubId: '123' }), 400);
const nonAiub = await expectStatus('student register with a non-AIUB email', reg({ ...studentBody, email: `stu.${tag}@mail.test` }), 400);
check('told to use the AIUB student email', JSON.stringify(nonAiub.data?.message).includes('student.aiub.edu'), nonAiub.data);
await expectStatus('student register with a staff-style AIUB email', reg({ ...studentBody, email: 'rahim@aiub.edu' }), 400);
const mismatch = await expectStatus('student email and AIUB ID differ', reg({ ...studentBody, aiubId: aiubId.slice(0, -1) + '9' }), 400);
check('told the ID must match the email', /must match your student email/.test(mismatch.data?.message), mismatch.data);
await expectStatus('student register bad education level', reg({ ...studentBody, educations: [{ level: 'phd', institutionName: 'X' }] }), 400);
await expectStatus('student register unknown nested field', reg({ ...studentBody, educations: [{ level: 'bsc', institutionName: 'X', hacked: true }] }), 400);
await expectStatus('student register SSC twice', reg({ ...studentBody, educations: [{ level: 'ssc', institutionName: 'A' }, { level: 'ssc', institutionName: 'B' }] }), 409);
await expectStatus('student register experience ends before it starts', reg({ ...studentBody, experiences: [{ companyName: 'X', industryType: 'IT', jobType: 'internship', designation: 'Intern', startDate: '2025-06-01', endDate: '2025-01-01' }] }), 400);
check('failed student registrations left no account', (await call('POST', '/auth/login', { json: { email: studentBody.email, password: 'secret123' } })).status === 401);
studentEmails.push(studentBody.email);
const stuStart = Date.now();
const stu = (await expectStatus('register student with full profile', reg({ ...studentBody, email: studentBody.email.toUpperCase() }), 201)).data;
const S = stu.accessToken;
await expectStatus('unverified student cannot drop a CV', call('POST', '/cv-drops', { token: S, json: {} }), 403);
await expectStatus('unverified student can read own profile', call('GET', '/students/me', { token: S }), 200);
check('unverified student is a visitor on public pages', (await call('GET', `/employers/${company.id}`, { token: S })).data?.hrEmail === undefined);
const stuMail = await readMail(studentBody.email, stuStart);
await expectStatus('bad link token', call('POST', '/auth/verify-email', { json: { token: 'f'.repeat(64) } }), 400);
await expectStatus('verify with the email link, no login', call('POST', '/auth/verify-email', { json: { token: stuMail.token } }), 200);
check('student verified after the link', (await call('GET', '/auth/me', { token: S })).data?.emailVerified === true);
const prof = stu.profile;
check('only the CV is missing after registration', JSON.stringify(prof?.completeness?.missing) === JSON.stringify(['cv']), prof?.completeness);
check('profile shows login email in lower case', prof?.email === studentBody.email, prof?.email);
check('education and reference saved with registration', prof?.educations?.length === 1 && prof?.references?.length === 1, prof);
check('cgpa stored with 2 decimals', prof?.educations?.[0]?.cgpa === '3.75', prof?.educations?.[0]?.cgpa);
await expectStatus('same student registers twice', reg(studentBody), 409);
await expectStatus('AIUB ID cannot be changed later', call('PATCH', '/students/me', { token: stu.accessToken, json: { aiubId: '20-00000-1' } }), 400);
await expectStatus('separate create-profile route is gone', call('POST', '/students/me', { token: S, json: {} }), 404);
await expectStatus('student cannot post jobs', call('POST', '/jobs', { token: S, json: jobBody }), 403);
await expectStatus('student cannot browse students', call('GET', '/students', { token: S }), 403);
await expectStatus('employer cannot use student profile', call('GET', '/students/me', { token: E }), 403);
const publicJobs = (await expectStatus('anyone can browse jobs', call('GET', `/jobs?q=${tag}`), 200)).data;
check('visitor sees open jobs', publicJobs.total === 2, publicJobs.total);
const publicJob = (await expectStatus('anyone can open a job', call('GET', `/jobs/${job.id}`), 200)).data;
check('visitor sees questions and company name', publicJob.questions?.length === 3 && publicJob.employer?.companyName === `Acme ${tag}`, publicJob.employer);
check('visitor does not see HR contact or account id', !('hrEmail' in (publicJob.employer ?? {})) && !('hrMobileNumber' in (publicJob.employer ?? {})) && !('userId' in (publicJob.employer ?? {})), publicJob.employer);
await expectStatus('bad token on public route is ignored', call('GET', '/jobs', { token: 'not.a.token' }), 200);
const anonApply = await expectStatus('visitor cannot apply', call('POST', `/jobs/${job.id}/apply`, { json: { joiningDate: 'immediately' } }), 401);
check('visitor is told to log in', anonApply.data?.message === 'Log in to continue', anonApply.data);
const empApply = await expectStatus('employer cannot apply', call('POST', `/jobs/${job.id}/apply`, { token: E, json: { joiningDate: 'immediately' } }), 403);
check('employer is told only students can apply', empApply.data?.message === 'Only students can do this. You are logged in as an employer.', empApply.data);
await expectStatus('apply without a CV', call('POST', `/jobs/${job.id}/apply`, { token: S, json: { joiningDate: 'immediately' } }), 400);
await expectStatus('edit profile after registration', call('PATCH', '/students/me', { token: S, json: { githubUrl: 'https://github.com/rahim' } }), 200);
await expectStatus('add BSc twice', call('POST', '/students/me/educations', { token: S, json: { level: 'bsc', institutionName: 'AIUB' } }), 409);
await expectStatus('add SSC', call('POST', '/students/me/educations', { token: S, json: { level: 'ssc', institutionName: 'Dhaka School', cgpa: 5, subject: 'Science', passingYear: 2019 } }), 201);
await expectStatus('experience end before start', call('POST', '/students/me/experiences', { token: S, json: { companyName: 'X', industryType: 'Software', jobType: 'internship', designation: 'Intern', startDate: '2025-06-01', endDate: '2025-01-01' } }), 400);
const exp = (await expectStatus('add continuing experience', call('POST', '/students/me/experiences', { token: S, json: { companyName: 'Startup', industryType: 'Software', jobType: 'internship', designation: 'Intern', startDate: '2025-06-01', responsibilities: 'APIs' } }), 201)).data;
check('experience continuing', exp.endDate === null, exp.endDate);
await expectStatus('add reference', call('POST', '/students/me/references', { token: S, json: { name: 'Dr. Karim', designation: 'Professor', organization: 'AIUB', email: 'karim@aiub.test', mobile: '01912345678', relation: 'academic' } }), 201);
await expectStatus('upload CV that is not a PDF', call('POST', '/students/me/cv', { token: S, form: { file: { buffer: FAKE_PDF, type: 'application/pdf', name: 'cv.pdf' } } }), 400);
await expectStatus('upload CV too big', call('POST', '/students/me/cv', { token: S, form: { file: { buffer: Buffer.concat([PDF, Buffer.alloc(6 * 1024 * 1024)]), type: 'application/pdf', name: 'cv.pdf' } } }), 413);
const withCv = (await expectStatus('upload CV', call('POST', '/students/me/cv', { token: S, form: { file: { buffer: PDF, type: 'application/pdf', name: 'cv.pdf' } } }), 201)).data;
check('profile complete', withCv.completeness?.isComplete === true, withCv.completeness);
check('educations ordered SSC first', withCv.educations?.[0]?.level === 'ssc', withCv.educations?.map((e) => e.level));

console.log('\n== Search ==');
const companies = (await expectStatus('search companies', call('GET', `/employers?q=${tag}`, { token: S }), 200)).data;
check('company found with 2 open jobs', companies.items?.[0]?.openJobCount === 2, companies);
const companyPage = (await expectStatus('company page', call('GET', `/employers/${company.id}`, { token: S }), 200)).data;
check('company page lists open jobs', companyPage.openJobs?.length === 2);
const jobs = (await expectStatus('search jobs', call('GET', `/jobs?q=${tag}&location=dhaka`, { token: S }), 200)).data;
check('jobs found by company name', jobs.total === 2, jobs.total);
await expectStatus('search jobs bad limit', call('GET', '/jobs?limit=1000', { token: S }), 400);
const jobView = (await expectStatus('job details', call('GET', `/jobs/${job.id}`, { token: S }), 200)).data;
check('not applied yet', jobView.myApplication === null, jobView.myApplication);
check('logged-in user sees HR contact', jobView.employer?.hrEmail === 'hr@acme.test', jobView.employer?.hrEmail);

console.log('\n== Apply ==');
const [q1, q2, q3] = job.questions;
await expectStatus('missing required answer', call('POST', `/jobs/${job.id}/apply`, { token: S, json: { joiningDate: 'immediately', answers: [{ questionId: q1.id, answer: 'Because' }] } }), 400);
await expectStatus('invalid choice', call('POST', `/jobs/${job.id}/apply`, { token: S, json: { joiningDate: 'immediately', answers: [{ questionId: q1.id, answer: 'Because' }, { questionId: q2.id, answer: '10' }] } }), 400);
await expectStatus('unknown question', call('POST', `/jobs/${job.id}/apply`, { token: S, json: { joiningDate: 'immediately', answers: [{ questionId: q1.id, answer: 'a' }, { questionId: q2.id, answer: '0' }, { questionId: job2.id, answer: 'x' }] } }), 400);
await expectStatus('bad joining date', call('POST', `/jobs/${job.id}/apply`, { token: S, json: { joiningDate: 'next_year' } }), 400);
await expectStatus('salary expectation not accepted', call('POST', `/jobs/${job.id}/apply`, { token: S, json: { joiningDate: 'immediately', salaryExpectation: 50000 } }), 400);
const app1 = (await expectStatus('apply with JSON body and profile CV', call('POST', `/jobs/${job.id}/apply`, { token: S, json: { joiningDate: 'within_1_week', answers: [{ questionId: q2.id, answer: '1-2' }, { questionId: q1.id, answer: 'I love building things' }] } }), 201)).data;
check('answers stored in question order', app1.answers?.map((a) => a.question.order).join() === '1,2', app1.answers);
check('uses profile CV', app1.cvUrl === withCv.cvUrl);
check('status submitted', app1.status === 'submitted');
await expectStatus('apply twice', call('POST', `/jobs/${job.id}/apply`, { token: S, json: { joiningDate: 'within_1_week', answers: [{ questionId: q1.id, answer: 'x' }, { questionId: q2.id, answer: '0' }] } }), 409);
const app2 = (await expectStatus('apply multipart with new CV', call('POST', `/jobs/${job2.id}/apply`, { token: S, form: { joiningDate: 'within_15_days', answers: JSON.stringify([{ questionId: edited.questions[0].id, answer: 'Yes' }]), file: { buffer: PDF, type: 'application/pdf', name: 'cv2.pdf' } } }), 201)).data;
check('application has its own CV', app2.cvUrl && app2.cvUrl !== withCv.cvUrl, app2.cvUrl);
await expectStatus('multipart answers not JSON', call('POST', `/jobs/${job2.id}/apply`, { token: S, form: { joiningDate: 'immediately', answers: 'not json' } }), 400);
await expectStatus('edit questions after applications', call('PATCH', `/jobs/${job2.id}`, { token: E, json: { questions: [] } }), 409);
await expectStatus('edit other fields after applications', call('PATCH', `/jobs/${job2.id}`, { token: E, json: { positionName: 'Intern (Backend)' } }), 200);
const jobView2 = (await call('GET', `/jobs/${job.id}`, { token: S })).data;
check('job shows my application', jobView2.myApplication?.id === app1.id, jobView2.myApplication);
const mine = (await expectStatus('my applications', call('GET', '/applications/mine', { token: S }), 200)).data;
check('2 applications', mine.total === 2 && mine.items?.length === 2, mine.total);
const listed = mine.items?.find((a) => a.id === app1.id);
check('list includes my answers with their questions', listed?.answers?.length === 2 && listed.answers[0].question?.text === q1.text, listed?.answers);
check('list shows job, company and whether the job is open', listed?.jobPost?.isOpen === true && listed?.jobPost?.employer?.companyName === `Acme ${tag}`, listed?.jobPost);
check('list includes joining date and CV', listed?.joiningDate === 'within_1_week' && listed?.cvUrl === withCv.cvUrl);

console.log('\n== Employer reviews ==');
const applicants = (await expectStatus('applicants for job', call('GET', `/jobs/${job.id}/applications`, { token: E }), 200)).data;
check('applicant has answers and email', applicants.items?.[0]?.answers?.length === 2 && applicants.items[0].student?.user?.email === studentBody.email, applicants.items?.[0]);
check('no password hash leaks', !JSON.stringify(applicants).includes('password'));
const myJobs = (await expectStatus('my jobs with counts', call('GET', '/jobs/mine', { token: E }), 200)).data;
check('application counts', myJobs.items?.every((j) => j.applicationCount === 1), myJobs.items?.map((j) => j.applicationCount));
await expectStatus('student cannot change status', call('PATCH', `/applications/${app1.id}/status`, { token: S, json: { status: 'hired' } }), 403);
const shortlisted = (await expectStatus('shortlist', call('PATCH', `/applications/${app1.id}/status`, { token: E, json: { status: 'shortlisted' } }), 200)).data;
check('status shortlisted', shortlisted.status === 'shortlisted');
const studentsList = (await expectStatus('browse students', call('GET', `/students?q=Rahim&studyLevel=graduated&industry=software&hasCv=true`, { token: E }), 200)).data;
check('student found with completeness', studentsList.items?.some((s) => s.id === prof.id && s.completeness?.isComplete), studentsList);
await expectStatus('student detail', call('GET', `/students/${prof.id}`, { token: E }), 200);

console.log('\n== Other employer ==');
console.log('\n== Sign-up email check ==');
const signupEmail = `hr.${tag}@other.test`;
await expectStatus('code for an email that has an account', call('POST', '/auth/signup-code', { json: { email: employerBody.email } }), 409);
await expectStatus('code needs a valid email', call('POST', '/auth/signup-code', { json: { email: 'nope' } }), 400);
const signupStart = Date.now();
await expectStatus('send sign-up code', call('POST', '/auth/signup-code', { json: { email: signupEmail.toUpperCase() } }), 200);
await expectStatus('second code right away', call('POST', '/auth/signup-code', { json: { email: signupEmail } }), 429);
const signupMail = await readMail(signupEmail, signupStart);
check('sign-up email has a 6-digit code', !!signupMail.code, signupMail);
const wrongSignup = signupMail.code === '000000' ? '111111' : '000000';
const wrongS = await expectStatus('wrong sign-up code', call('POST', '/auth/signup-code/verify', { json: { email: signupEmail, code: wrongSignup } }), 400);
check('sign-up code: told tries left', /4 tries left/.test(wrongS.data?.message), wrongS.data);
const proof = (await expectStatus('right sign-up code', call('POST', '/auth/signup-code/verify', { json: { email: signupEmail, code: signupMail.code } }), 200)).data;
check('right code returns an email token', /^[a-f0-9]{64}$/.test(proof.emailToken ?? ''), proof);
await expectStatus('sign-up code works once', call('POST', '/auth/signup-code/verify', { json: { email: signupEmail, code: signupMail.code } }), 400);
const otherBody = { email: signupEmail, password: 'secret123', companyName: `Other ${tag}`, industryType: 'Banking', about: 'Bank', hrName: 'H', hrEmail: 'hr@other.test', hrMobileNumber: '01712345679', hasOngoingHiring: false };
const wrongEmailToken = await expectStatus('email token for another email', call('POST', '/auth/register/employer', { json: { ...otherBody, email: `x.${tag}@other.test`, emailToken: proof.emailToken } }), 400);
check('told to verify again', /verify your email again/i.test(wrongEmailToken.data?.message), wrongEmailToken.data);
check('no account left behind', (await call('POST', '/auth/signup-code', { json: { email: `x.${tag}@other.test` } })).status === 200);
const registerStart = Date.now();
const other = (await expectStatus('register second employer with email token', call('POST', '/auth/register/employer', { json: { ...otherBody, emailToken: proof.emailToken } }), 201)).data;
check('account starts verified', other.user?.emailVerified === true, other.user);
check('no second verification email', (await readMail(signupEmail, registerStart)).count === 0);
const O = other.accessToken;
await expectStatus('admin approves second company', call('PATCH', `/admin/employers/${other.profile.id}/approve`, { token: A }), 200);
await expectStatus('other cannot see applicants', call('GET', `/jobs/${job.id}/applications`, { token: O }), 403);
await expectStatus('other cannot read application', call('GET', `/applications/${app1.id}`, { token: O }), 403);
await expectStatus('other cannot edit job', call('PATCH', `/jobs/${job.id}`, { token: O, json: { positionName: 'Hacked' } }), 403);
await expectStatus('other cannot close job', call('PATCH', `/jobs/${job.id}/close`, { token: O }), 403);

console.log('\n== Files ==');
await expectStatus('student reads own CV', call('GET', withCv.cvUrl.replace('/api', ''), { token: S }), 200);
await expectStatus('employer reads CV', call('GET', app2.cvUrl.replace('/api', ''), { token: O }), 200);
const aiubId2 = aiubId.slice(0, -1) + '2';
studentEmails.push(studentEmail(aiubId2));
const stu2 = (await expectStatus('register second student', reg({ ...studentBody, email: studentEmail(aiubId2), aiubId: aiubId2 }), 201)).data;
await markVerified(studentEmail(aiubId2));
await expectStatus('other student cannot read CV', call('GET', withCv.cvUrl.replace('/api', ''), { token: stu2.accessToken }), 403);
await expectStatus('files need login', call('GET', withCv.cvUrl.replace('/api', '')), 401);
await expectStatus('path traversal rejected', call('GET', '/uploads/cvs/..%2F..%2F.env', { token: E }), 404);

console.log('\n== CV drops ==');
await expectStatus('drop CV to pool', call('POST', '/cv-drops', { token: S, json: {} }), 201);
const drop2 = (await expectStatus('drop CV to other company', call('POST', '/cv-drops', { token: S, json: { employerId: (await call('GET', '/employers/me', { token: O })).data.id, note: 'Interested in banking' } }), 201)).data;
await expectStatus('drop again to pool replaces', call('POST', '/cv-drops', { token: S, form: { file: { buffer: PDF, type: 'application/pdf', name: 'cv3.pdf' } } }), 201);
const myDrops = (await expectStatus('my drops', call('GET', '/cv-drops/mine', { token: S }), 200)).data;
check('2 drops (pool replaced, not duplicated)', myDrops.total === 2, myDrops.total);
await expectStatus('drop to unknown company', call('POST', '/cv-drops', { token: S, json: { employerId: '00000000-0000-4000-8000-000000000000' } }), 404);
const recvOther = (await expectStatus('other company received', call('GET', '/cv-drops/received?scope=company', { token: O }), 200)).data;
check('other company sees its drop', recvOther.items?.some((d) => d.id === drop2.id), recvOther.total);
const recvAcmeCompany = (await call('GET', '/cv-drops/received?scope=company', { token: E })).data;
check('acme does not see drop sent to other', !recvAcmeCompany.items?.some((d) => d.id === drop2.id));
const pool = (await call('GET', '/cv-drops/received?scope=pool', { token: E })).data;
check('acme sees pool drop', pool.items?.some((d) => d.studentId === prof.id));

console.log('\n== Candidate criteria ==');
const crit = (await expectStatus('post criteria', call('POST', '/candidate-criteria', { token: O, json: { title: 'Fresh graduates', description: 'Looking for graduates', studyLevel: 'graduated', preferredJobType: 'full_time', industryType: 'software' } }), 201)).data;
await expectStatus('attach PDF', call('POST', `/candidate-criteria/${crit.id}/attachment`, { token: O, form: { file: { buffer: PDF, type: 'application/pdf', name: 'c.pdf' } } }), 201);
const matches = (await expectStatus('matching students', call('GET', `/candidate-criteria/${crit.id}/matches`, { token: O }), 200)).data;
check('student matches criteria', matches.items?.some((s) => s.id === prof.id), matches.total);
await expectStatus('student lists criteria', call('GET', '/candidate-criteria', { token: S }), 200);
await expectStatus('acme cannot see other matches', call('GET', `/candidate-criteria/${crit.id}/matches`, { token: E }), 403);
await expectStatus('delete criteria', call('DELETE', `/candidate-criteria/${crit.id}`, { token: O }), 204);

console.log('\n== Admin ==');
await expectStatus('student cannot use admin routes', call('GET', '/admin/employers', { token: S }), 403);
const stats = (await expectStatus('admin stats', call('GET', '/admin/stats', { token: A }), 200)).data;
check('stats count students, companies, jobs and applications', stats.students?.total >= 2 && stats.employers?.approved >= 2 && stats.jobs?.total >= 2 && stats.applications?.total >= 2, stats);
await expectStatus('admin job list is not offered', call('GET', '/admin/jobs', { token: A }), 404);
await expectStatus('admin cannot browse students', call('GET', '/students', { token: A }), 403);
const adminCompany = (await expectStatus('admin opens a company', call('GET', `/admin/employers/${company.id}`, { token: A }), 200)).data;
check('company detail lists its jobs', adminCompany.jobs?.length === 2, adminCompany.jobs?.length);
await expectStatus('reject needs a reason', call('PATCH', `/admin/employers/${company.id}/reject`, { token: A, json: {} }), 400);
const rejectStart = Date.now();
await expectStatus('admin withdraws approval', call('PATCH', `/admin/employers/${company.id}/reject`, { token: A, json: { reason: 'Documents missing' } }), 200);
const rejectMail = await readMail(employerBody.email, rejectStart);
check('company gets a rejection email with the reason', /was not approved/.test(rejectMail.text ?? '') && /Reason: Documents missing/.test(rejectMail.text ?? ''), rejectMail.text?.slice(0, 300));
const rejectedMsg = await expectStatus('rejected company cannot see applicants', call('GET', `/jobs/${job.id}/applications`, { token: E }), 403);
check('rejection reason shown', /rejected: Documents missing/.test(rejectedMsg.data?.message), rejectedMsg.data);
await expectStatus('rejected company cannot read CVs', call('GET', withCv.cvUrl.replace('/api', ''), { token: E }), 403);
await expectStatus('its job is hidden from students', call('GET', `/jobs/${job.id}`, { token: S }), 404);
await expectStatus('company still sees its own job', call('GET', `/jobs/${job.id}`, { token: E }), 200);
check('its jobs leave the public list', (await call('GET', `/jobs?q=${tag}`)).data?.total === 0);
await expectStatus('nobody can apply to it', call('POST', `/jobs/${job.id}/apply`, { token: stu2.accessToken, json: { joiningDate: 'immediately' } }), 404);
await expectStatus('CV drop to it refused', call('POST', '/cv-drops', { token: S, json: { employerId: company.id } }), 404);
const resubmitted = (await expectStatus('rejected company edits profile', call('PATCH', '/employers/me', { token: E, json: { about: 'Updated with documents' } }), 200)).data;
check('editing sends it back to pending', resubmitted.status === 'pending' && resubmitted.rejectionReason === null, resubmitted);
await expectStatus('admin approves again', call('PATCH', `/admin/employers/${company.id}/approve`, { token: A }), 200);
check('jobs visible again', (await call('GET', `/jobs?q=${tag}`)).data?.total === 2);
await expectStatus('unknown company', call('PATCH', '/admin/employers/00000000-0000-4000-8000-000000000000/approve', { token: A }), 404);
await expectStatus('company reads a CV', call('GET', withCv.cvUrl.replace('/api', ''), { token: E }), 200);

console.log('\n== Close job ==');
const closed = (await expectStatus('close job', call('PATCH', `/jobs/${job2.id}/close`, { token: E }), 200)).data;
check('closed job not open', closed.isOpen === false);
const stu2tok = stu2.accessToken;
await expectStatus('apply to closed job', call('POST', `/jobs/${job2.id}/apply`, { token: stu2tok, json: { joiningDate: 'immediately' } }), 400);
const afterClose = (await call('GET', `/jobs?q=${tag}`, { token: S })).data;
check('closed job hidden from search', afterClose.total === 1, afterClose.total);

console.log('\n== Public companies, booths, reopen, internships ==');
const visitorCompanies = (await expectStatus('visitor can search companies', call('GET', `/employers?q=${tag}`), 200)).data;
check('visitor sees both companies', visitorCompanies.total === 2, visitorCompanies.total);
check('visitor company list has no HR contact or account id', visitorCompanies.items?.every((e) => !('hrEmail' in e) && !('hrMobileNumber' in e) && !('userId' in e) && 'openJobCount' in e), visitorCompanies.items?.[0]);
const visitorPage = (await expectStatus('visitor can open a company page', call('GET', `/employers/${company.id}`), 200)).data;
check('visitor company page has open jobs but no HR contact', Array.isArray(visitorPage.openJobs) && !('hrEmail' in visitorPage), visitorPage);
check('logged-in user still sees HR contact on company page', (await call('GET', `/employers/${company.id}`, { token: S })).data?.hrEmail === 'hr@acme.test');
await expectStatus('student cannot set a booth', call('PATCH', '/employers/me', { token: S, json: { boothNumber: 'B-1' } }), 403);
await expectStatus('booth number too long', call('PATCH', '/employers/me', { token: E, json: { boothNumber: 'x'.repeat(21) } }), 400);
const booth = (await expectStatus('company sets its booth', call('PATCH', '/employers/me', { token: E, json: { boothNumber: ' B-12 ' } }), 200)).data;
check('booth saved trimmed', booth.boothNumber === 'B-12', booth.boothNumber);
check('visitor sees the booth', (await call('GET', `/employers/${company.id}`)).data?.boothNumber === 'B-12');
const cleared = (await expectStatus('company clears its booth', call('PATCH', '/employers/me', { token: E, json: { boothNumber: '' } }), 200)).data;
check('booth cleared', cleared.boothNumber === null, cleared.boothNumber);
await expectStatus('other company cannot reopen the job', call('PATCH', `/jobs/${job2.id}/reopen`, { token: O }), 403);
const reopened = (await expectStatus('reopen closed job', call('PATCH', `/jobs/${job2.id}/reopen`, { token: E }), 200)).data;
check('reopened job is open', reopened.isOpen === true && reopened.isActive === true, reopened);
check('reopened job back in search', (await call('GET', `/jobs?q=${tag}`)).data?.total === 2);
const internJob = (await expectStatus('post an internship job', call('POST', '/jobs', { token: E, json: { ...jobBody, positionName: 'Summer Intern', employmentStatus: 'internship', questions: [] } }), 201)).data;
const interns = (await call('GET', `/jobs?q=${tag}&employmentStatus=internship`)).data;
check('internship filter finds only the internship', interns.total === 1 && interns.items?.[0]?.id === internJob.id, interns.total);
await expectStatus('portfolio must be a full URL', call('PATCH', '/students/me', { token: S, json: { portfolioUrl: 'rahim.dev' } }), 400);
const withPortfolio = (await expectStatus('add portfolio link', call('PATCH', '/students/me', { token: S, json: { portfolioUrl: 'https://rahim.dev' } }), 200)).data;
check('portfolio saved', withPortfolio.portfolioUrl === 'https://rahim.dev', withPortfolio.portfolioUrl);

console.log('\n== Forgot password ==');
const readResetEmail = readMail;
const stu2Email = studentEmail(aiubId2);
const forgotStart = Date.now();
const unknown = (await expectStatus('forgot password for unknown email', call('POST', '/auth/forgot-password', { json: { email: `nobody.${tag}@mail.test` } }), 200)).data;
const known = (await expectStatus('forgot password', call('POST', '/auth/forgot-password', { json: { email: stu2Email.toUpperCase() } }), 200)).data;
check('same answer whether or not the account exists', unknown.message === known.message, [unknown, known]);
const mail1 = await readResetEmail(stu2Email, forgotStart);
check('email has a 6-digit code and a link token', mail1.code && mail1.token, mail1);
await expectStatus('ask again right away', call('POST', '/auth/forgot-password', { json: { email: stu2Email } }), 200);
await new Promise((r) => setTimeout(r, 300));
check('no second email within a minute', (await readResetEmail(stu2Email, forgotStart)).count === 1);
const wrongCode = mail1.code === '000000' ? '111111' : '000000';
const wrong = await expectStatus('reset with wrong code', call('POST', '/auth/reset-password', { json: { email: stu2Email, code: wrongCode, newPassword: 'newSecret123' } }), 400);
check('tries left shown', wrong.data?.message === 'The code is wrong. 4 tries left.', wrong.data);
await expectStatus('reset with neither code nor token', call('POST', '/auth/reset-password', { json: { newPassword: 'newSecret123' } }), 400);
await expectStatus('reset with short password', call('POST', '/auth/reset-password', { json: { email: stu2Email, code: mail1.code, newPassword: 'short' } }), 400);
await expectStatus('reset with made-up token', call('POST', '/auth/reset-password', { json: { token: 'a'.repeat(64), newPassword: 'newSecret123' } }), 400);
await expectStatus('reset with code', call('POST', '/auth/reset-password', { json: { email: stu2Email, code: mail1.code, newPassword: 'newSecret123' } }), 200);
const oldTok = await expectStatus('old login token stops working', call('GET', '/auth/me', { token: stu2tok }), 401);
check('told to log in again', oldTok.data?.message === 'Your password was changed. Log in again.', oldTok.data);
await expectStatus('old password rejected', call('POST', '/auth/login', { json: { email: stu2Email, password: 'secret123' } }), 401);
const relog = (await expectStatus('new password works', call('POST', '/auth/login', { json: { email: stu2Email, password: 'newSecret123' } }), 200)).data;
await expectStatus('new token works', call('GET', '/auth/me', { token: relog.accessToken }), 200);
await expectStatus('code works only once', call('POST', '/auth/reset-password', { json: { email: stu2Email, code: mail1.code, newPassword: 'another123' } }), 400);
await expectStatus('link token from the used request is dead too', call('POST', '/auth/reset-password', { json: { token: mail1.token, newPassword: 'another123' } }), 400);

const otherEmail = `hr.${tag}@other.test`;
await expectStatus('employer forgot password', call('POST', '/auth/forgot-password', { json: { email: otherEmail } }), 200);
const mail2 = await readResetEmail(otherEmail, forgotStart);
await expectStatus('reset with link token', call('POST', '/auth/reset-password', { json: { token: mail2.token, newPassword: 'linkReset123' } }), 200);
await expectStatus('employer logs in with new password', call('POST', '/auth/login', { json: { email: otherEmail, password: 'linkReset123' } }), 200);

console.log('\n== Docs ==');
const docs = await call('GET', '/docs-json');
check('swagger json served', docs.status === 200 && Object.keys(docs.data.paths ?? {}).length > 20, Object.keys(docs.data.paths ?? {}).length);
check('swagger documents DTO fields', JSON.stringify(docs.data.components?.schemas?.CreateJobDto ?? {}).includes('positionName'));

console.log(`\n${passes} passed, ${failures} failed`);
await cleanup();
process.exit(failures ? 1 : 0);

function dbClient() {
  return new pg.Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'aiub_job_fair',
  });
}

async function cleanup() {
  const client = dbClient();
  await client.connect();
  // Profiles, jobs, applications and drops go with ON DELETE CASCADE.
  const { rowCount } = await client.query(
    "DELETE FROM users WHERE email LIKE '%.' || $1 || '@%.test' OR email = ANY($2)",
    [tag, studentEmails],
  );
  await client.end();
  console.log(`Cleaned up ${rowCount} test accounts.`);
}
