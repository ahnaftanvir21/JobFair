// End-to-end smoke test: walks the whole student and employer flow against a running server.
// Usage: start the server (npm run start:dev), then run: npm run test:smoke
// Another URL can be passed: npm run test:smoke -- http://localhost:3000/api
// It creates accounts ending in .test and deletes them, with all their rows, when done.
// Uploaded test files stay in uploads/, which is git-ignored.
import 'dotenv/config';
import pg from 'pg';

const BASE = process.argv[2] ?? `http://localhost:${process.env.PORT ?? 3000}/api`;
const tag = Date.now().toString(36);
let failures = 0;
let passes = 0;

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

console.log('\n== Employer ==');
const emp = (await expectStatus('register employer', call('POST', '/auth/register/employer', { json: { email: `hr.${tag}@acme.test`, password: 'secret123' } }), 201)).data;
const E = emp.accessToken;
await expectStatus('job before company profile', call('POST', '/jobs', { token: E, json: {} }), 400);
await expectStatus('employer profile bad mobile', call('POST', '/employers/me', { token: E, json: { companyName: 'Acme', industryType: 'Software', about: 'x', hrName: 'H', hrEmail: 'hr@acme.test', hrMobileNumber: '123' } }), 400);
const company = (await expectStatus('create company profile', call('POST', '/employers/me', { token: E, json: { companyName: `Acme ${tag}`, websiteUrl: 'https://acme.test', industryType: 'Software', about: 'We build things', hrName: 'Hasan', hrEmail: 'hr@acme.test', hrMobileNumber: '01712345678' } }), 201)).data;
await expectStatus('second company profile', call('POST', '/employers/me', { token: E, json: { companyName: 'X', industryType: 'S', about: 'x', hrName: 'H', hrEmail: 'hr@acme.test', hrMobileNumber: '01712345678' } }), 409);
await expectStatus('clear required field', call('PATCH', '/employers/me', { token: E, json: { companyName: null } }), 400);
await expectStatus('upload logo PNG', call('POST', '/employers/me/logo', { token: E, form: { file: { buffer: PNG, type: 'image/png', name: 'logo.png' } } }), 201);
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
const stu = (await expectStatus('register student', call('POST', '/auth/register/student', { json: { email: `stu.${tag}@mail.test`, password: 'secret123' } }), 201)).data;
const S = stu.accessToken;
await expectStatus('student cannot post jobs', call('POST', '/jobs', { token: S, json: jobBody }), 403);
await expectStatus('student cannot browse students', call('GET', '/students', { token: S }), 403);
await expectStatus('employer cannot use student profile', call('GET', '/students/me', { token: E }), 403);
await expectStatus('jobs need login', call('GET', '/jobs'), 401);
await expectStatus('profile not created yet', call('GET', '/students/me', { token: S }), 404);
await expectStatus('bad AIUB ID', call('POST', '/students/me', { token: S, json: { name: 'Rahim', aiubId: '123', mobileNumber: '01812345678', preferredJobType: 'full_time', studyLevel: 'graduated', preferredIndustryTypes: ['Software'], seminarParticipation: true } }), 400);
const aiubId = `2${tag.slice(-1).replace(/\D/, '1')}-${String(Date.now()).slice(-5)}-1`;
const prof = (await expectStatus('create student profile (step 1)', call('POST', '/students/me', { token: S, json: { name: 'Rahim Uddin', aiubId, mobileNumber: '01812345678', preferredJobType: 'full_time', studyLevel: 'graduated', preferredIndustryTypes: ['Software Development'], seminarParticipation: true } }), 201)).data;
check('completeness lists missing items', JSON.stringify(prof.completeness?.missing) === JSON.stringify(['address', 'gender', 'education', 'cv']), prof.completeness);
check('profile shows login email', prof.email === `stu.${tag}@mail.test`, prof.email);
await expectStatus('apply with incomplete profile', call('POST', `/jobs/${job.id}/apply`, { token: S, json: { joiningDate: 'immediately' } }), 400);
await expectStatus('step 2 fields', call('PATCH', '/students/me', { token: S, json: { address: 'Kuril, Dhaka', gender: 'male', linkedinUrl: 'https://linkedin.com/in/rahim', githubUrl: 'https://github.com/rahim' } }), 200);
const edu = (await expectStatus('add BSc', call('POST', '/students/me/educations', { token: S, json: { level: 'bsc', institutionName: 'AIUB', cgpa: 3.75, subject: 'CSE', passingYear: 2026 } }), 201)).data;
check('cgpa stored with 2 decimals', edu.cgpa === '3.75', edu.cgpa);
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
check('2 applications', mine.total === 2, mine.total);

console.log('\n== Employer reviews ==');
const applicants = (await expectStatus('applicants for job', call('GET', `/jobs/${job.id}/applications`, { token: E }), 200)).data;
check('applicant has answers and email', applicants.items?.[0]?.answers?.length === 2 && applicants.items[0].student?.user?.email === `stu.${tag}@mail.test`, applicants.items?.[0]);
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
const other = (await call('POST', '/auth/register/employer', { json: { email: `hr.${tag}@other.test`, password: 'secret123' } })).data;
const O = other.accessToken;
await call('POST', '/employers/me', { token: O, json: { companyName: `Other ${tag}`, industryType: 'Banking', about: 'Bank', hrName: 'H', hrEmail: 'hr@other.test', hrMobileNumber: '01712345679', hasOngoingHiring: false } });
await expectStatus('other cannot see applicants', call('GET', `/jobs/${job.id}/applications`, { token: O }), 403);
await expectStatus('other cannot read application', call('GET', `/applications/${app1.id}`, { token: O }), 403);
await expectStatus('other cannot edit job', call('PATCH', `/jobs/${job.id}`, { token: O, json: { positionName: 'Hacked' } }), 403);
await expectStatus('other cannot close job', call('PATCH', `/jobs/${job.id}/close`, { token: O }), 403);

console.log('\n== Files ==');
await expectStatus('student reads own CV', call('GET', withCv.cvUrl.replace('/api', ''), { token: S }), 200);
await expectStatus('employer reads CV', call('GET', app2.cvUrl.replace('/api', ''), { token: O }), 200);
const stu2 = (await call('POST', '/auth/register/student', { json: { email: `stu2.${tag}@mail.test`, password: 'secret123' } })).data;
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

console.log('\n== Close job ==');
const closed = (await expectStatus('close job', call('PATCH', `/jobs/${job2.id}/close`, { token: E }), 200)).data;
check('closed job not open', closed.isOpen === false);
const stu2tok = stu2.accessToken;
await expectStatus('apply to closed job', call('POST', `/jobs/${job2.id}/apply`, { token: stu2tok, json: { joiningDate: 'immediately' } }), 400);
const afterClose = (await call('GET', `/jobs?q=${tag}`, { token: S })).data;
check('closed job hidden from search', afterClose.total === 1, afterClose.total);

console.log('\n== Docs ==');
const docs = await call('GET', '/docs-json');
check('swagger json served', docs.status === 200 && Object.keys(docs.data.paths ?? {}).length > 20, Object.keys(docs.data.paths ?? {}).length);
check('swagger documents DTO fields', JSON.stringify(docs.data.components?.schemas?.CreateJobDto ?? {}).includes('positionName'));

console.log(`\n${passes} passed, ${failures} failed`);
await cleanup();
process.exit(failures ? 1 : 0);

async function cleanup() {
  const client = new pg.Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'aiub_job_fair',
  });
  await client.connect();
  // Profiles, jobs, applications and drops go with ON DELETE CASCADE.
  const { rowCount } = await client.query(
    "DELETE FROM users WHERE email LIKE '%.' || $1 || '@%.test'",
    [tag],
  );
  await client.end();
  console.log(`Cleaned up ${rowCount} test accounts.`);
}
