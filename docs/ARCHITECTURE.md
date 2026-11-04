# AIUB Job Fair 2026 — Architecture

Backend: NestJS 12 (ES modules) REST API under `/api`.
Database: PostgreSQL via TypeORM. Connection settings live in `.env` (copy `.env.example`).
Run `npm run db:create` once to create the database.
Frontend: separate app added later, consuming this API.

## Folder layout

```
src/
  main.ts                 bootstrap
  app.module.ts           wires all feature modules
  config/                 auth, database and fair settings read from .env
  common/
    database/             snake_case naming for tables and columns
    decorators/           @Public(), @Roles(), @CurrentUser()
    dto/                  pagination
    enums/                shared dropdown values (gender, job type, divisions, ...)
    fair/                 FairService: the 5 Dec and 12 Dec closing dates
    guards/               JWT guard (global) and role guard (global)
    interfaces/           logged-in user and token payload types
    utils/                Dhaka dates, search text, validation helpers
  modules/
    auth/                 register and login for students and employers
    users/                login accounts (email, password hash, role)
    students/             student profile, education, experience, references
    employers/            company profile and HR contact
    jobs/                 job posts with any number of employer questions
    applications/         apply to a job: answers, joining date, CV
    cv-drops/             "just drop your CV" without a specific job
    candidate-criteria/   employer without ongoing hiring posts desired criteria
    uploads/              file checks, storage and protected downloads
uploads/                  stored files (git-ignored)
```

## User flows (from the flyer)

**Student:** register, build profile, answer seminar question, then
"Want to apply for a job?"
- Yes: search companies, pick a job, answer employer questions, choose joining date, upload CV, submit.
- No: just drop a CV.
- Deadline: 5 Dec 2026.

**Employer:** register, build company profile, then "Any ongoing hiring?"
- Yes: create job posts.
- No: upload desired candidate criteria.
- Each job post can carry any number of questions (psychometric or screening).
- Deadline: 12 Dec 2026.

## Build order

All backend modules are built. See docs/PLAN.md section 8.
Next: frontend, and a QR code for the live site URL.

## Decisions taken from the sheets

- Sheet 1 header says "Employer Registration" but sits under "Student Apply"; it is treated as student registration.
- "Salary Expectation" was crossed out on sheet 2, so applications do not store it.
- Handwritten note "Add CV upload button" is covered by the `cvUrl` on applications.
- No admin role and no company approval. Employers can browse all students. Jobs and companies are public; applying needs a student login.
- See docs/PLAN.md for the full agreed plan.
- Job location dropdown uses the 8 divisions of Bangladesh plus "Anywhere".
