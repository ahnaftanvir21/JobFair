# AIUB Job Fair 2026 — How the System Works

Status: backend built (3 Nov 2026). Scope: **backend API only**. The frontend is built later against this API.

---

## 1. Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Admin role | Added 4 Nov 2026 (was: none). Admins are fair office staff, created with `npm run admin:create`, never through the API. |
| 2 | Scope | Backend first. Frontend later. |
| 3 | Student email | Any email is allowed. |
| 4 | Psychometric / screening questions | Employers write them per job post, with no limit on how many. |
| 5 | Employer approval | Added 4 Nov 2026 (was: none). New companies are pending until an admin approves them. |
| 6 | Job list | Anyone can browse jobs without logging in (changed 4 Nov 2026). Only logged-in students can apply. |
| 7 | Student browsing | Employers can browse and search all student profiles. |
| 8 | Hosting | Not decided yet. Keep config in `.env` so any host works. |

---

## 2. Who uses it

| Role | Can do |
|---|---|
| Student | Register, build profile, search companies and jobs, apply with answers to the employer's questions, drop CV, track applications |
| Employer | Register, build company profile, then after admin approval: post jobs with any number of questions, or post desired-candidate criteria, review applicants, browse all students, shortlist or reject |
| Admin | See overall numbers; approve or reject companies (with a reason); list all companies, students, jobs and applications; open any application, student profile or file |

Without login, visitors can register, log in, browse jobs, open job details and see company logos. Everything else needs login.

---

## 3. Flows

### 3.1 Student
```
Register in one request (any email + password + full profile)
       name, AIUB ID, mobile, job type (full-time / internship),
       study level (ongoing / graduated), preferred industries,
       seminar participation (yes / no), address, gender,
       education (at least one), experience and references (optional),
       extracurricular, LinkedIn, GitHub (optional)
  -> Upload picture and CV (PDF) with the returned token
  -> "Want to apply for a job?"
       Yes -> search companies -> company details -> job details -> Apply
               profile attached automatically, answer every question on the job,
               joining date, CV (profile CV or a new upload) -> Submit
       No  -> Just drop CV (general pool, or to one chosen company)
  -> My applications with status, my CV drops, edit profile
```
Flyer deadline: 5 Dec 2026. Not enforced for now (see rule 13).

### 3.2 Employer
```
Register in one request (email + password + full company profile)
       company name, website, industry type, about,
       HR name, HR email, HR mobile, ongoing hiring (yes / no)
  -> Upload logo with the returned token
  -> Wait for admin approval (status: pending). Meanwhile only the own profile
     and logo can be edited. Rejected: fix the profile, which sends it back to pending.
  -> "Any ongoing hiring?"
       Yes -> Create job post (repeatable)
               position, location (8 divisions or anywhere), workplace
               (office / remote / online), education requirement, additional
               requirements, responsibilities, skills, employment status,
               salary (negotiable or amount), compensation & benefits,
               deadline, and any number of questions
               (free-text or single-choice, required or optional)
       No  -> Post desired candidate criteria (text and optional file)
  -> My job posts (edit, close), applicants per job (profile, CV, answers,
     joining date), shortlist / reject / hire, CV drops received,
     browse and filter all students
```
Flyer deadline: 12 Dec 2026. Not enforced for now (see rule 13).

---

## 4. Data model (PostgreSQL)

```
users ─1:1─ student_profiles ─1:n─ educations
  │                          ├─1:n─ experiences
  │                          ├─1:n─ references
  │                          ├─1:n─ cv_drops ─n:1 (optional)─ employer_profiles
  │                          └─1:n─ applications ─1:n─ application_answers
  │                                      │                     │
  │                                      n:1                   n:1
  │                                      │                     │
  └─1:1─ employer_profiles ─1:n─ job_posts ─1:n─ job_questions
                           └─1:n─ candidate_criteria
```

Key constraints:
- `users.email` unique. `student_profiles.aiub_id` unique.
- One application per student per job: unique (`student_id`, `job_post_id`).
- One answer per question per application: unique (`application_id`, `question_id`).
- Questions on a job cannot be changed once it has applications, so answers stay meaningful.
- Closing a job sets `is_active = false`; applications are kept.
- Login email lives in `users` only.

---

## 5. API (prefix /api; everything needs login except register, login, forgot/reset password, job browsing and logos)

Full interactive docs: run the server and open http://localhost:3000/api/docs

| Module | Endpoints |
|---|---|
| auth | POST /auth/register/student and POST /auth/register/employer (account and full profile together, returns token and profile); POST /auth/login; GET /auth/me; POST /auth/forgot-password (emails a 6-digit code and a reset link); POST /auth/reset-password (email + code, or token from the link, + newPassword) |
| students (student) | GET, PATCH /students/me; POST /students/me/picture; POST /students/me/cv; POST /students/me/educations, PATCH and DELETE /students/me/educations/:id; same for experiences and references |
| students (employer) | GET /students?q=&studyLevel=&preferredJobType=&industry=&hasCv=; GET /students/:id |
| employers | GET, PATCH /employers/me; POST /employers/me/logo; GET /employers?q=&industry=&hiring= (with open job count); GET /employers/:id (with open jobs) |
| jobs | POST /jobs (with questions); GET /jobs/mine; GET /jobs?q=&location=&workplace=&employmentStatus=&industry=&employerId= (open jobs only, no login needed); GET /jobs/:id (no login needed; visitors do not see HR contact); PATCH /jobs/:id; PATCH /jobs/:id/close |
| applications | POST /jobs/:id/apply (JSON, or multipart with an optional CV file); GET /applications/mine (student: every application at once with job, company, answers, joining date, CV and status; optional status filter, no paging); GET /jobs/:id/applications; GET /applications/:id; PATCH /applications/:id/status |
| cv-drops | POST /cv-drops (pool or one company, optional CV file); GET /cv-drops/mine; GET /cv-drops/received?scope=company/pool/all; DELETE /cv-drops/:id |
| candidate-criteria | POST /candidate-criteria; GET /candidate-criteria/mine; GET /candidate-criteria?employerId=; GET /candidate-criteria/:id; GET /candidate-criteria/:id/matches; PATCH, DELETE /candidate-criteria/:id; POST /candidate-criteria/:id/attachment |
| admin (admin) | GET /admin/stats; GET /admin/employers?status=&q= (approval queue with status=pending); GET /admin/employers/:id; PATCH /admin/employers/:id/approve; PATCH /admin/employers/:id/reject (reason); GET /admin/jobs?q=&status=open/closed&employerId=; GET /admin/applications?status=&jobId=&employerId=&q=. Admins also use GET /students, GET /students/:id and GET /applications/:id |
| uploads | GET /uploads/:kind/:filename (logos: anyone; admins: everything; approved employers: everything; pictures and attachments: students; CVs: the owning student) |

Other list endpoints take page and limit (default 20, max 100) and return { items, total, page, limit }.

---

## 6. Business rules
1. Passwords are hashed with bcrypt. Login returns a JWT with the user id and role.
2. Role guards: students cannot call employer endpoints and the reverse. Only logged-in students can apply; visitors get 401 "Log in to continue", employers get 403 "Only students can do this".
3. Employers see only applicants and CV drops for their own company. They can browse all student profiles.
4. A student can apply only when the profile is complete: address, gender, at least one education, and a CV (on the profile or uploaded with the application).
5. Applying is blocked after the job's own deadline.
6. No fair-wide cutoff for now (see rule 13).
7. Job deadline must be today or later when the post is created.
8. Apply must include an answer for every required question. A single-choice answer must be one of the options.
9. Files: CV and attachments are PDF up to 5 MB. Pictures and logos are JPG/PNG up to 2 MB. The type is checked from the file content, and files get random names.
12. Dates are judged in Dhaka time. A job stays open through its deadline day.
13. Fair-wide cutoffs are **off for now** (decided 3 Nov 2026). Setting STUDENT_DEADLINE in .env closes student registration, applying and CV drops. Setting EMPLOYER_DEADLINE closes employer registration, new job posts and new candidate criteria. Each job post's own deadline always applies.
14. One application per student per job. Questions on a job cannot change once someone has applied.
15. Dropping a CV again to the same company, or to the pool, replaces the earlier drop.
16. SSC, HSC, BSc, MSc 1 and MSc 2 can each be added once. Professional degrees can repeat.
19. Employer approval: new companies start as pending. Until approved, a company can only view and edit its own profile and logo; every other employer route answers 403 with the reason. Its company page, jobs and candidate criteria are hidden from students and visitors, nobody can apply to its jobs or drop a CV to it, and it cannot open student files. An admin can reject with a reason (also to withdraw an earlier approval); editing the profile after a rejection sends it back to pending. The company is emailed on every approval or rejection.
17. Registration saves the account and the whole profile in one transaction. If any part is invalid (for example the AIUB ID is taken), nothing is saved.
10. Salary is "Negotiable" or an amount. Compensation defaults to "As per company policy".
11. Salary expectation is not collected (struck out on sheet 2).
18. Forgot password: the email holds a 6-digit code and a link; either one works once and expires in 15 minutes. The answer is the same whether or not the email has an account. At most one email a minute per account; a new request replaces the old code. 5 wrong codes kill the request. A reset logs out every device (old login tokens get 401). Only hashes of the code and link are stored. Without SMTP settings in .env, emails are saved to mail-outbox/ and printed in the server log.

---

## 7. Technology
| Part | Choice |
|---|---|
| Backend | NestJS 12, TypeORM, PostgreSQL 18 (done) |
| Validation | class-validator and class-transformer DTOs |
| Auth | @nestjs/jwt, passport-jwt, bcryptjs |
| Email | nodemailer over SMTP (dev: saved to mail-outbox/) |
| File upload | Multer, local `uploads/` folder |
| API docs | Swagger at `/api/docs`, used for testing until the frontend exists |
| Frontend | Later |

---

## 8. Build order (backend)

| # | Module | Done when |
|---|---|---|
| 1 | Database + config | Done |
| 2 | Auth + Users | Done |
| 3 | Students | Done |
| 4 | Uploads | Done |
| 5 | Employers | Done |
| 6 | Jobs + questions | Done |
| 7 | Applications | Done |
| 8 | CV drops | Done |
| 9 | Candidate criteria | Done |
| 10 | Deadlines + Swagger + tests | Done |

Testing: npm test runs the unit tests. With the server running, npm run test:smoke walks the full student and employer flow against the real database and cleans up after itself.

Target: backend complete by about **20 Nov**, leaving time for the frontend before the 5 Dec student deadline.
