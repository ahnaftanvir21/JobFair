# AIUB Job Fair 2026 — Backend API

NestJS 12 + TypeORM + PostgreSQL. Students register, build profiles, apply for jobs and drop CVs.
Employers build company profiles, post jobs with their own questions, and review applicants.

## Setup

1. Install packages: `npm install`
2. Copy `.env.example` to `.env` and set `DB_PASSWORD` and a long random `JWT_SECRET`. For real password-reset emails, fill the `SMTP_*` settings; left blank, reset emails are saved to `mail-outbox/` instead.
3. Create the database: `npm run db:create`
   Optional, with the server running: `npm run db:seed` adds example companies, jobs, students, applications, CV drops and criteria. Example companies are `demo.<name>@example.com` and example students use AIUB student emails such as `21-45101-1@student.aiub.edu`; every example account has the password `Demo1234`. Remove them with `npm run db:seed -- --remove`, or recreate them with `--reset`.
4. Start in watch mode: `npm run start:dev`

With `DB_SYNCHRONIZE=true` (development only) the tables are created automatically on start.

## Use it

- API base: http://localhost:3000/api
- Interactive docs: http://localhost:3000/api/docs
  Register or log in, copy `accessToken`, click **Authorize**, paste it.
- Website: the React frontend in `../Aiub-Job-Fair-2026`. Keep this server running, then in that folder run `npm install` once and `npm run dev`, and open http://localhost:5173.

## Test

- `npm test` runs the unit tests.
- `npm run test:smoke` runs the full student and employer flow against a running server and the real database, then deletes its test accounts.

## Docs

- `docs/PLAN.md` — agreed decisions, flows, data model, endpoints and business rules.
- `docs/ARCHITECTURE.md` — folder layout and build order.
- `docs/API.md` — every endpoint explained, with request and response examples.
# JobFair
# JobFair
