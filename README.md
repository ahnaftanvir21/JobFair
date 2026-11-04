# AIUB Job Fair 2026 — Backend API

NestJS 12 + TypeORM + PostgreSQL. Students register, build profiles, apply for jobs and drop CVs.
Employers build company profiles, post jobs with their own questions, and review applicants.

## Setup

1. Install packages: `npm install`
2. Copy `.env.example` to `.env` and set `DB_PASSWORD` and a long random `JWT_SECRET`. Create an admin with `npm run admin:create -- admin@example.com "a-long-password"` (start the server once first). For real password-reset emails, fill the `SMTP_*` settings; left blank, reset emails are saved to `mail-outbox/` instead.
3. Create the database: `npm run db:create`
4. Start in watch mode: `npm run start:dev`

With `DB_SYNCHRONIZE=true` (development only) the tables are created automatically on start.

## Use it

- API base: http://localhost:3000/api
- Interactive docs: http://localhost:3000/api/docs
  Register or log in, copy `accessToken`, click **Authorize**, paste it.

## Test

- `npm test` runs the unit tests.
- `npm run test:smoke` runs the full student and employer flow against a running server and the real database, then deletes its test accounts.

## Docs

- `docs/PLAN.md` — agreed decisions, flows, data model, endpoints and business rules.
- `docs/ARCHITECTURE.md` — folder layout and build order.
# JobFair
# JobFair
