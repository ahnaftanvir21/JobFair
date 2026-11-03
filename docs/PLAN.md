# AIUB Job Fair 2026 — How the System Works

Status: backend built (3 Nov 2026). Scope: **backend API only**. The frontend is built later against this API.

---

## 1. Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Admin role | None. Only students and employers. |
| 2 | Scope | Backend first. Frontend later. |
| 3 | Student email | Any email is allowed. |
| 4 | Psychometric / screening questions | Employers write them per job post, with no limit on how many. |
| 5 | Employer approval | None. Employers are active right after registering. |
| 6 | Job list | Login required. No public job browsing. |
| 7 | Student browsing | Employers can browse and search all student profiles. |
| 8 | Hosting | Not decided yet. Keep config in `.env` so any host works. |

---

## 2. Who uses it

| Role | Can do |
|---|---|
| Student | Register, build profile, search companies and jobs, apply with answers to the employer's questions, drop CV, track applications |
| Employer | Register, build company profile, post jobs with any number of questions, or post desired-candidate criteria, review applicants, browse all students, shortlist or reject |

Without login, only register and login endpoints work.

---

## 3. Flows

### 3.1 Student
```
Register (any email + password)
  -> Step 1: Quick registration (flyer)
       name, AIUB ID, mobile, job type (full-time / internship),
       study level (ongoing / graduated), preferred industries,
       seminar participation (yes / no)
  -> Step 2: Full profile (sheet 1)
       picture, address, gender, education (SSC, HSC, BSc, MSc 1, MSc 2, professional),
       experience (repeatable), extracurricular, LinkedIn, GitHub,
       references (repeatable), CV (PDF)
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
Register (email + password)
  -> Company profile
       company name, website, logo, industry type, about,
       HR name, HR email, HR mobile
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

## 5. API (prefix /api, all need login except register and login)

Full interactive docs: run the server and open http://localhost:3000/api/docs

| Module | Endpoints |
|---|---|
| auth | POST /auth/register/student, POST /auth/register/employer, POST /auth/login, GET /auth/me |
| students (student) | POST, GET, PATCH /students/me; POST /students/me/picture; POST /students/me/cv; POST /students/me/educations, PATCH and DELETE /students/me/educations/:id; same for experiences and references |
| students (employer) | GET /students?q=&studyLevel=&preferredJobType=&industry=&hasCv=; GET /students/:id |
| employers | POST, GET, PATCH /employers/me; POST /employers/me/logo; GET /employers?q=&industry=&hiring= (with open job count); GET /employers/:id (with open jobs) |
| jobs | POST /jobs (with questions); GET /jobs/mine; GET /jobs?q=&location=&workplace=&employmentStatus=&industry=&employerId= (open jobs only); GET /jobs/:id; PATCH /jobs/:id; PATCH /jobs/:id/close |
| applications | POST /jobs/:id/apply (JSON, or multipart with an optional CV file); GET /applications/mine; GET /jobs/:id/applications; GET /applications/:id; PATCH /applications/:id/status |
| cv-drops | POST /cv-drops (pool or one company, optional CV file); GET /cv-drops/mine; GET /cv-drops/received?scope=company/pool/all; DELETE /cv-drops/:id |
| candidate-criteria | POST /candidate-criteria; GET /candidate-criteria/mine; GET /candidate-criteria?employerId=; GET /candidate-criteria/:id; GET /candidate-criteria/:id/matches; PATCH, DELETE /candidate-criteria/:id; POST /candidate-criteria/:id/attachment |
| uploads | GET /uploads/:kind/:filename (pictures, logos, attachments: any logged-in user; CVs: employers or the owning student) |

List endpoints take page and limit (default 20, max 100) and return { items, total, page, limit }.

---|---|
| auth | `POST /auth/register/student`, `POST /auth/register/employer`, `POST /auth/login`, `GET /auth/me` |
| students | `GET/PUT /students/me`, `POST/PUT/DELETE /students/me/educations[/:id]`, same for `experiences` and `references`, `GET /students?search=&studyLevel=&jobType=&industry=` (employer), `GET /students/:id` (employer) |
| employers | `GET/PUT /employers/me`, `GET /employers?search=&industry=` (company search), `GET /employers/:id` |
| uploads | `POST /uploads/profile-picture`, `POST /uploads/logo`, `POST /uploads/cv`, `GET /uploads/:file` |
| jobs | `GET /jobs?search=&location=&industry=&workplace=&status=`, `GET /jobs/:id` (with questions), `POST /jobs` (with questions), `PUT /jobs/:id`, `PATCH /jobs/:id/close`, `GET /jobs/mine` |
| applications | `POST /jobs/:id/apply`, `GET /applications/mine`, `GET /jobs/:id/applications` (owner), `GET /applications/:id` (owner or applicant), `PATCH /applications/:id/status` |
| cv-drops | `POST /cv-drops`, `GET /cv-drops/mine`, `GET /cv-drops/received` |
| candidate-criteria | `POST/GET/PUT/DELETE /candidate-criteria` (employer), `GET /candidate-criteria/:id/matches` (students that fit) |

---

## 6. Business rules
1. Passwords are hashed with bcrypt. Login returns a JWT with the user id and role.
2. Role guards: students cannot call employer endpoints and the reverse.
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
10. Salary is "Negotiable" or an amount. Compensation defaults to "As per company policy".
11. Salary expectation is not collected (struck out on sheet 2).

---

## 7. Technology
| Part | Choice |
|---|---|
| Backend | NestJS 12, TypeORM, PostgreSQL 18 (done) |
| Validation | class-validator and class-transformer DTOs |
| Auth | @nestjs/jwt, passport-jwt, bcryptjs |
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
