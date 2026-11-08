# AIUB Job Fair 2026 — API Guide

How every endpoint works, with real requests and responses. For a quick try-out, run the server and open the interactive docs at **http://localhost:3000/api/docs**.

The examples were captured from the running API. Long responses are trimmed, and IDs and timestamps will differ on your machine.

**Contents**
1. [Basics](#1-basics): base URL, login tokens, roles, errors, paging, files
2. [Typical flows](#2-typical-flows)
3. [Auth](#3-auth): register, login, forgot password
4. [Students](#4-students): own profile, education, experience, references, browsing students
5. [Employers](#5-employers): company profile, browsing companies
6. [Jobs](#6-jobs)
7. [Applications](#7-applications)
8. [CV drops](#8-cv-drops)
9. [Candidate criteria](#9-candidate-criteria)
10. [Uploads](#10-uploads-downloading-files)
11. [Admin](#11-admin)
12. [Reference](#12-reference): all allowed values, endpoint summary

---

## 1. Basics

### Base URL
Every path starts with `/api`, so on a local machine:

```
http://localhost:3000/api
```

`GET /api` is a simple health check that returns `Hello World!`.

### Logging in and sending the token
Register or log in to get an `accessToken` (a JWT, valid for 1 day). Then send it with every request that needs login:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

A token stops working when:
- it is older than 1 day (`JWT_EXPIRES_IN` in `.env`), or
- the password is reset (every device is logged out), or
- the account is deleted.

Each of these returns `401`. The frontend should then send the user to the login page.

### Roles
Each account has one role, and it is inside the token.

| Role | How the account is made | Can do |
|---|---|---|
| `student` | `POST /auth/register/student` | Profile, browse companies and jobs, apply, drop CV |
| `employer` | `POST /auth/register/employer` | Company profile and booth number, post jobs and criteria, browse students, review applicants. Only after the admin approves the company |
| `admin` | From `ADMIN_EMAIL` and `ADMIN_PASSWORD` when the server starts | Overall numbers; approve or reject companies |

**Company approval.** A new company starts as `pending`. Until the admin approves it, it can only edit its own profile and logo (`GET/PATCH /employers/me`, `POST /employers/me/logo`) and use `GET /auth/me`; other routes answer `403 Your company is waiting for admin approval...`. Pending and rejected companies, and their jobs, are hidden from students and visitors. The company gets an email when it is approved or rejected (with the reason). A rejected company that edits its profile goes back to `pending`. Companies that existed before approvals were added count as approved.

**Admin account.** Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the server settings. The account is created when the server starts; changing `ADMIN_PASSWORD` and restarting changes the password. Admins log in with `POST /auth/login`. Admin accounts can't be registered through the API.

Visitors (no token) can register, log in, reset a password, browse open jobs and companies, open a job or a company page, and load company logos. Visitors never see HR contact details.

**Student emails.** Students register with their AIUB student email, `<AIUB ID>@student.aiub.edu` (for example `23-54445-3@student.aiub.edu`). The ID before `@` must equal `aiubId`, and the AIUB ID can't be changed later. Companies can't register with a `@student.aiub.edu` address.

### Errors
Every error has the same shape. `message` is either a sentence or a list of sentences (for form validation), so show it to the user as is.

```json
{ "message": "Invalid email or password", "error": "Unauthorized", "statusCode": 401 }
```

```json
{
  "message": [
    "Enter a valid email address",
    "Password must be at least 8 characters",
    "Enter a valid Bangladeshi mobile number"
  ],
  "error": "Bad Request",
  "statusCode": 400
}
```

| Status | Meaning | Example message |
|---|---|---|
| 400 | Bad input or a business rule failed | `Complete your profile first. Missing: cv` |
| 401 | Not logged in, or the token is no longer valid | `Log in to continue` |
| 403 | Logged in, but not allowed | `Only students can do this. You are logged in as an employer.` |
| 404 | Not found, or hidden from you | `Job not found` |
| 409 | Duplicate | `You have already applied for this job` |

Unknown fields in a body are rejected with `400` (for example `property role should not exist`). This stops anyone from sneaking in fields like `role` or `status`.

### Paging
List endpoints take `page` (default 1) and `limit` (default 20, max 100) and return:

```json
{ "items": [ ... ], "total": 42, "page": 1, "limit": 20 }
```

The only exception is `GET /applications/mine`, which returns every item at once as `{ "items": [...], "total": n }`.

### Dates
- Plain dates use `YYYY-MM-DD`, for example `"2026-12-31"`.
- Timestamps use ISO format in UTC, for example `"2026-11-04T06:17:07.119Z"`.
- Job deadlines are judged in Dhaka time, and a job stays open through its whole deadline day.

### Updating: leave out vs null
`PATCH` endpoints change only the fields you send:
- Leave a field out to keep it as it is.
- Send `null` to clear an optional field.
- Sending `null` for a required field (for example `name`) returns `400`.

### Files
Uploads use `multipart/form-data` with the file in a field named `file`.

| Kind | Types | Max size |
|---|---|---|
| CV, criteria attachment | PDF | 5 MB |
| Profile picture, company logo | JPG or PNG | 2 MB |

The type is checked from the file's content, not its name. A renamed `.exe` is refused with `File must be a PDF`.

Responses give a file as a URL such as `/api/uploads/cvs/3eefa7fa-....pdf`. See [Uploads](#10-uploads-downloading-files) for who can open which file.

---

## 2. Typical flows

**Student**
1. `POST /auth/register/student` creates the account and full profile, and returns a token.
2. `POST /students/me/cv` uploads the CV (needed before applying). Optionally `POST /students/me/picture`.
3. Find work:
   - `GET /employers?q=...` searches companies, then `GET /employers/:id` opens one.
   - `GET /jobs?...` lists jobs, then `GET /jobs/:id` shows a job with its questions.
4. Apply or drop a CV:
   - `POST /jobs/:id/apply` with the answers and a joining date, or
   - `POST /cv-drops` to "just drop CV".
5. `GET /applications/mine` shows every application and its status.

**Employer**
1. `POST /auth/register/employer` creates the account and company profile. The company can post jobs right away.
2. `POST /employers/me/logo` uploads the logo. `PATCH /employers/me` with `boothNumber` adds the booth OPA gave you.
3. Post what you're hiring for:
   - Hiring now: `POST /jobs` with questions.
   - Not hiring now: `POST /candidate-criteria`.
4. `GET /jobs/:id/applications` lists applicants, then `PATCH /applications/:id/status` shortlists, rejects or hires.
5. `GET /students?...` browses all students, and `GET /cv-drops/received` shows CVs dropped to you.

**Forgot password**
1. `POST /auth/forgot-password` emails a 6-digit code and a reset link.
2. `POST /auth/reset-password` with the code (or the link's token) and the new password.

---

## 3. Auth

### POST /auth/register/student
**Who:** anyone. Creates a student account and the **whole profile** in one request, then returns a token.

All of these are required:
- account: `email` (AIUB student email, `<AIUB ID>@student.aiub.edu`), `password` (8 to 72 characters)
- profile: `name`, `aiubId` (format `22-48123-1`), `mobileNumber` (Bangladeshi, `01XXXXXXXXX`), `preferredJobType`, `studyLevel`, `preferredIndustryTypes` (1 to 10), `seminarParticipation`, `address`, `gender`
- `educations`: at least one entry

Optional: `extracurricularActivities`, `linkedinUrl`, `githubUrl`, `portfolioUrl`, `experiences`, `references`.

If any part is invalid (for example the AIUB ID is taken), nothing is saved.

Errors specific to the email: `400 Use your AIUB student email, like 23-54445-3@student.aiub.edu` and `400 Your AIUB ID must match your student email (the part before @)`.

```http
POST /api/auth/register/student
Content-Type: application/json

{
  "email": "22-48123-1@student.aiub.edu",
  "password": "secret123",
  "name": "Rahim Uddin",
  "aiubId": "22-48123-1",
  "mobileNumber": "01812345678",
  "preferredJobType": "full_time",
  "studyLevel": "graduated",
  "program": "Bachelor of Science in Computer Science and Engineering",
  "faculty": "Faculty of Science and Technology",
  "preferredIndustryTypes": ["Software", "Telecom"],
  "seminarParticipation": true,
  "address": "House 12, Road 5, Kuril, Dhaka",
  "gender": "male",
  "linkedinUrl": "https://www.linkedin.com/in/rahim-uddin",
  "educations": [
    { "level": "bsc", "institutionName": "American International University-Bangladesh",
      "cgpa": 3.75, "subject": "Computer Science and Engineering", "passingYear": 2026 }
  ],
  "experiences": [
    { "companyName": "Brain Station 23", "industryType": "Software", "jobType": "internship",
      "designation": "Software Engineer Intern", "startDate": "2025-06-01", "endDate": "2025-09-30",
      "responsibilities": "Built REST APIs with NestJS" }
  ],
  "references": [
    { "name": "Dr. Karim Ahmed", "designation": "Professor", "organization": "AIUB",
      "email": "karim.ahmed@example.com", "mobile": "01912345678", "relation": "academic" }
  ]
}
```

**201 Created** (trimmed):
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { "id": "e96b9fa2-1e28-43fc-b282-15300955e11c", "email": "22-48123-1@student.aiub.edu", "role": "student" },
  "profile": {
    "id": "bf882db7-5cb9-41e7-bef7-aec1c915a5ad",
    "name": "Rahim Uddin",
    "aiubId": "22-48123-1",
    "email": "22-48123-1@student.aiub.edu",
    "profilePictureUrl": null,
    "cvUrl": null,
    "educations": [ { "id": "c3ccac39-...", "level": "bsc", "cgpa": "3.75", "passingYear": 2026, "...": "..." } ],
    "experiences": [ { "...": "..." } ],
    "references": [ { "...": "..." } ],
    "completeness": { "isComplete": false, "missing": ["cv"] }
  }
}
```

`completeness.missing` lists what's still needed before the student can apply. Right after registering, that's only `cv`. Older accounts without a program or faculty also get `program` and `faculty`.

**Current student list:** if the AIUB ID is on the [current student list](#post-admincurrent-studentsupload), the list's `program` and `faculty` are used (anything sent is ignored) and the profile gets `academicsFromList: true`, so `PATCH /students/me` cannot change them. The web app verifies the AIUB email first ([signup-code](#post-authsignup-code)), then calls [student-list/lookup](#post-authstudent-listlookup) to show the details, and sends the `emailToken` here.

Otherwise `program` (any text, up to 200 characters) and `faculty` are required. `faculty` is one of `Faculty of Arts and Social Sciences`, `Faculty of Business Administration`, `Faculty of Engineering`, `Faculty of Science and Technology`. `educations` must include the AIUB education: a `bsc`, `msc_1` or `msc_2` entry whose `institutionName` is American International University-Bangladesh (or contains "AIUB").

**Errors:**
- `400`: validation (list of messages), `Add your AIUB education: a BSc or MSc entry at American International University-Bangladesh`, or `End date cannot be before start date`
- `409`:
  - `An account with this email already exists`
  - `This AIUB ID is already registered`
  - `SSC was added more than once` (SSC, HSC, BSc, MSc 1 and MSc 2 can each appear once; professional degrees can repeat)

### POST /auth/student-list/lookup
**Who:** anyone with an email token. Current student sign-up: after the AIUB email is verified with [signup-code/verify](#post-authsignup-codeverify), returns what the current student list has for the ID in the email. The token is checked but not used up.

```json
{ "email": "23-54445-3@student.aiub.edu", "emailToken": "9f2c...64 hex" }
```

**200 OK:** `{ "found": true, "name": "TAHSIN AHMED", "program": "Bachelor of Science in Computer Science and Engineering", "faculty": "Faculty of Science and Technology" }`. When the ID is not on the list: `found: false` and the rest `null`; the student then picks program and faculty.

**400** if the email is not an AIUB student email, or the token is wrong or expired.

### POST /auth/alumni/check
**Who:** anyone. Alumni sign-up, first step: checks an AIUB ID and graduation registration number against the alumni list the fair office uploads ([admin](#post-adminalumniupload)).

```json
{ "aiubId": "16-32398-2", "registrationNumber": "22-36987-01" }
```

Registration numbers are compared on letters and digits only, so `22 36987 01` also matches.

**200 OK:**
```json
{ "message": "Details match the alumni list.", "name": "AHNAF SADMAN",
  "program": "Bachelor of Business Administration", "faculty": "Faculty of Business Administration",
  "convocation": "10th Convocation" }
```
All but `message` come from the list and can be `null`.

**Errors:**
- `400 These details don't match the AIUB alumni list...`: the ID is not on the list or the number is wrong (same message for both).
- `409 An account already exists for this AIUB ID...`
- `429 Too many wrong registration numbers for this AIUB ID. Try again in N minutes.`: after 5 wrong numbers in a row the ID is locked for 15 minutes.

### POST /auth/register/alumni
**Who:** anyone. Creates a student account for a graduate who no longer uses the AIUB student email.

Same body as [register/student](#post-authregisterstudent), with these differences:
- `email`: any email (personal or work).
- `emailToken` (required): from [POST /auth/signup-code/verify](#post-authsignup-codeverify) for the same email, so the account starts verified.
- `registrationNumber` (required): must match `aiubId` on the alumni list.
- No `studyLevel`: it is always `graduated`, and the profile has `isAlumni: true`. `PATCH /students/me` cannot change it to `ongoing` (`400`).
- No `program` or `faculty`: they are copied from the alumni list. `PATCH /students/me` cannot change them (`400`), except to fill in one the list did not have. `name` is taken from the body, so the graduate can correct it.

**201 Created:** like register/student.

**Errors:** the [alumni/check](#post-authalumnicheck) errors, `400` for an expired email token, `409` if the email or AIUB ID is taken.

### POST /auth/register/employer
**Who:** anyone. Creates an employer account and the company profile.

- Required: `email`, `password`, `companyName`, `industryType`, `about`, `hrName`, `hrEmail`, `hrMobileNumber`.
- Optional: `websiteUrl` (full URL), `hasOngoingHiring` (default `true`), `boothNumber` (up to 20 characters), `emailToken`.

`emailToken` comes from [POST /auth/signup-code/verify](#post-authsignup-codeverify) for the same email. With it the account starts verified and no code is emailed after registering (the website always does this). A wrong, used or expired token answers `400 Your email check has expired. Go back to step 1 and verify your email again.` and no account is made. Without it the account starts unverified (see [verify-email](#post-authverify-email)), and **a company that doesn't verify within 30 minutes is deleted** with its profile and logo. Companies with an unverified email don't appear in the admin lists or counts.

`email` can't be an AIUB student email (`400 Student emails cannot register a company. Use your company email.`).

```http
POST /api/auth/register/employer
Content-Type: application/json

{
  "email": "hr@acme-software.com",
  "password": "secret123",
  "companyName": "Acme Software Ltd.",
  "websiteUrl": "https://www.acme-software.com",
  "industryType": "Software",
  "about": "Acme builds banking and e-commerce software.",
  "hrName": "Hasan Mahmud",
  "hrEmail": "hr@acme-software.com",
  "hrMobileNumber": "01712345678",
  "hasOngoingHiring": true
}
```

**201 Created:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { "id": "500d16d2-7fc6-464f-804f-c98098286731", "email": "hr@acme-software.com", "role": "employer" },
  "profile": {
    "id": "e4a60a50-e486-4bf8-bdd6-09ec2bca8ada",
    "userId": "500d16d2-7fc6-464f-804f-c98098286731",
    "companyName": "Acme Software Ltd.",
    "websiteUrl": "https://www.acme-software.com",
    "logoUrl": null,
    "industryType": "Software",
    "about": "Acme builds banking and e-commerce software.",
    "hrName": "Hasan Mahmud",
    "hrEmail": "hr@acme-software.com",
    "hrMobileNumber": "01712345678",
    "hasOngoingHiring": true,
    "boothNumber": null,
    "createdAt": "2026-11-04T06:17:07.119Z",
    "updatedAt": "2026-11-04T06:17:07.119Z"
  }
}
```

**Errors:** `400` validation, `409 An account with this email already exists`.

### POST /auth/login
**Who:** anyone (students and employers both use this).

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "hr@acme-software.com", "password": "secret123" }
```

**200 OK:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { "id": "500d16d2-7fc6-464f-804f-c98098286731", "email": "hr@acme-software.com", "role": "employer" }
}
```

Use `user.role` to decide which part of the app to show.

**Errors:** `401 Invalid email or password`. It's the same message for an unknown email or a wrong password, so nobody can probe which emails exist.

### GET /auth/me
**Who:** any logged-in user. Returns who the token belongs to.

```http
GET /api/auth/me
Authorization: Bearer <token>
```

**200 OK:**
```json
{ "id": "500d16d2-7fc6-464f-804f-c98098286731", "email": "hr@acme-software.com", "role": "employer" }
```

**Errors:**
- `401 Log in to continue`
- `401 Your password was changed. Log in again.`

### POST /auth/forgot-password
**Who:** anyone. Emails a **6-digit code** and a **reset link**. Both expire in 15 minutes and work once.

```http
POST /api/auth/forgot-password
Content-Type: application/json

{ "email": "22-48123-1@student.aiub.edu" }
```

**200 OK** (always, even for an unknown email, so nobody can find out which emails have accounts):
```json
{ "message": "If an account exists for this email, we sent a 6-digit code and a reset link. They expire in 15 minutes." }
```

The email looks like this:
```
Subject: Reset your AIUB Job Fair password

Your code: 339608

Or open this link to set a new password:
http://localhost:5173/reset-password?token=cc99b554bd9fa953a3ac616a119b3430233f780fa4d0a27d3cb0a846b4717b8d

The code and link expire in 15 minutes and work once.
```

How it behaves:
- At most one email per minute per account. Asking again within a minute sends nothing.
- A newer request replaces the older code and link.
- The link opens `RESET_PASSWORD_URL` from `.env` (a frontend page). That page should read `?token=` and call `POST /auth/reset-password`.
- Without SMTP settings in `.env`, the email is saved in `mail-outbox/` and printed in the server log instead of being sent.

### POST /auth/reset-password
**Who:** anyone. Sets a new password using **either** `email` + `code` **or** `token` (from the link). On success, every existing login token for that account stops working.

With the code:
```http
POST /api/auth/reset-password
Content-Type: application/json

{ "email": "22-48123-1@student.aiub.edu", "code": "339608", "newPassword": "newSecret123" }
```

With the link token:
```http
POST /api/auth/reset-password
Content-Type: application/json

{ "token": "cc99b554bd9fa953a3ac616a119b3430233f780fa4d0a27d3cb0a846b4717b8d", "newPassword": "newSecret123" }
```

**200 OK:**
```json
{ "message": "Password changed. Log in with your new password." }
```

**Errors (400):**
- `The code is wrong. 4 tries left.` After 5 wrong codes, the request is dead and the user must ask for a new one.
- `The code is wrong or has expired. Request a new one.`
- `The reset link is invalid or has expired. Request a new one.`
- `Code must be the 6 digits from the email`
- `Password must be at least 8 characters`

---

### POST /auth/signup-code
**Who:** anyone. Checks an email before the account exists. Company sign-up on the website calls this right after the email and password step.

```json
{ "email": "hr@acme-software.com" }
```

**200 OK:** `{ "message": "We sent a 6-digit code to ... It expires in 30 minutes." }`. A new code replaces the old one.

**Errors:** `409` if the email already has an account; `429` if a code was sent to this email less than a minute ago.

### POST /auth/signup-code/verify
**Who:** anyone.

```json
{ "email": "hr@acme-software.com", "code": "123456" }
```

**200 OK:** `{ "message": "Email verified.", "emailToken": "<64 hex characters>" }`. Send `emailToken` when registering with the same email. It works once, for 2 hours.

**Errors:** `400` for a wrong code (`The code is wrong. 4 tries left.`), an expired code or a code already used. After 5 wrong codes, ask for a new one.

### POST /auth/verify-email
**Who:** anyone. New accounts confirm their email here.

Registering sends an email with a 6-digit code and a link (`/verify-email?token=...` on the frontend). Until the email is verified, the account can log in but can only use its own profile (`/students/me...`, `/employers/me...`), `GET /auth/me` and the two verify routes. Everything else answers `403 Verify your email first. Enter the 6-digit code we emailed you.` On public routes (jobs, companies, logos) an unverified account counts as a visitor. Accounts made before this check existed count as verified. Setting a new password with Forgot password also verifies the email.

Send one of:
- `code`: the 6 digits from the email. Needs the login token (`401` without it).
- `token`: from the email link. No login needed.

```json
{ "code": "123456" }
```

**200 OK** with a code: `{ "message": "Email verified. Your account is ready.", "user": { "id": "...", "email": "...", "role": "student", "emailVerified": true } }`. With a token: only `message`.

**Errors:** `400` for a wrong code (`The code is wrong. 4 tries left.`), an expired code or link, or a used link. The code and link expire in 30 minutes. After 5 wrong codes, ask for a new one.

### POST /auth/resend-verification
**Who:** logged-in account that is not verified yet. Emails a new code and link, replacing the old ones.

**200 OK:** `{ "message": "We sent a new 6-digit code to ..." }`

**Errors:** `429` if the last code was sent less than a minute ago; `400` if the email is already verified.

To turn the check off (for example while email sending isn't set up), set `REQUIRE_EMAIL_VERIFICATION=false`. New accounts are then verified at once.

## 4. Students

### GET /students/me
**Who:** student. Returns your full profile, including your login email and `completeness`.

```http
GET /api/students/me
Authorization: Bearer <student token>
```

**200 OK** (trimmed):
```json
{
  "id": "bf882db7-5cb9-41e7-bef7-aec1c915a5ad",
  "userId": "e96b9fa2-1e28-43fc-b282-15300955e11c",
  "name": "Rahim Uddin",
  "aiubId": "22-48123-1",
  "mobileNumber": "01812345678",
  "preferredJobType": "full_time",
  "studyLevel": "graduated",
  "preferredIndustryTypes": ["Software", "Telecom"],
  "seminarParticipation": true,
  "profilePictureUrl": null,
  "address": "House 12, Road 5, Kuril, Dhaka",
  "gender": "male",
  "extracurricularActivities": null,
  "linkedinUrl": "https://www.linkedin.com/in/rahim-uddin",
  "githubUrl": null,
  "cvUrl": null,
  "educations": [
    { "id": "c3ccac39-9f32-453d-90e0-5e49e592d4d1", "level": "bsc",
      "institutionName": "American International University-Bangladesh", "cgpa": "3.75",
      "subject": "Computer Science and Engineering", "passingYear": 2026, "degreeName": null }
  ],
  "experiences": [],
  "references": [ { "id": "a4d04501-...", "name": "Dr. Karim Ahmed", "relation": "academic", "...": "..." } ],
  "email": "22-48123-1@student.aiub.edu",
  "completeness": { "isComplete": false, "missing": ["cv"] }
}
```

`cgpa` comes back as a string with 2 decimals (`"3.75"`).

**Errors:** `403 Only students can do this. You are logged in as an employer.`

### PATCH /students/me
**Who:** student. Changes only the fields you send. Allowed fields:
- `name`, `aiubId`, `mobileNumber`
- `preferredJobType`, `studyLevel`, `preferredIndustryTypes`, `seminarParticipation`
- `address`, `gender`
- `extracurricularActivities`, `linkedinUrl`, `githubUrl`, `portfolioUrl` (links must be full URLs)

```http
PATCH /api/students/me
Authorization: Bearer <student token>
Content-Type: application/json

{ "githubUrl": "https://github.com/rahim-uddin", "extracurricularActivities": "Member of AIUB Computer Club" }
```

**200 OK:** the full profile, same shape as `GET /students/me`.

**Errors:** `400` validation or clearing a required field, `409 This AIUB ID is already registered`.

### POST /students/me/picture
**Who:** student. Uploads a profile picture (JPG or PNG, max 2 MB) and replaces the old one.

```bash
curl -X POST http://localhost:3000/api/students/me/picture \
  -H "Authorization: Bearer <student token>" \
  -F "file=@me.png"
```

**201 Created:** the full profile, with `"profilePictureUrl": "/api/uploads/pictures/d13078dc-....png"`.

**Errors (400):** `File must be a PNG or JPG`, `File must be at most 2 MB`, `A file is required in the "file" field`.

### POST /students/me/cv
**Who:** student. Uploads the profile CV (PDF, max 5 MB). Earlier CVs are kept, because past applications still point to them.

```bash
curl -X POST http://localhost:3000/api/students/me/cv \
  -H "Authorization: Bearer <student token>" \
  -F "file=@cv.pdf"
```

**201 Created:** the full profile, with `"cvUrl": "/api/uploads/cvs/3eefa7fa-....pdf"` and `"completeness": { "isComplete": true, "missing": [] }`.

**Errors:** `400 File must be a PDF`.

### Education: POST, PATCH, DELETE /students/me/educations
**Who:** student.

- `POST /students/me/educations` adds a row:
  - Required: `level`, `institutionName`.
  - Optional: `cgpa` (0 to 5), `subject`, `passingYear` (1970 to 2040), `degreeName`.
- `PATCH /students/me/educations/:id` changes the fields you send.
- `DELETE /students/me/educations/:id` removes the row and returns `204 No Content`. Deleting the last row is allowed, but then `completeness.missing` includes `education` and applying is blocked until one is added.

SSC, HSC, BSc, MSc 1 and MSc 2 can each be added once. `professional` can repeat.

```http
POST /api/students/me/educations
Authorization: Bearer <student token>
Content-Type: application/json

{ "level": "hsc", "institutionName": "Notre Dame College", "cgpa": 5, "subject": "Science", "passingYear": 2021 }
```

**201 Created:**
```json
{
  "id": "0c0932a7-7aff-431d-bc6c-437699519a0b",
  "studentId": "bf882db7-5cb9-41e7-bef7-aec1c915a5ad",
  "level": "hsc",
  "institutionName": "Notre Dame College",
  "cgpa": "5.00",
  "subject": "Science",
  "passingYear": 2021,
  "degreeName": null
}
```

```http
PATCH /api/students/me/educations/0c0932a7-7aff-431d-bc6c-437699519a0b
Content-Type: application/json

{ "cgpa": 4.9 }
```
**200 OK:** the updated row (`"cgpa": "4.90"`).

**Errors:**
- `409 You already added HSC. Edit that entry instead.`
- `404` the row isn't yours or doesn't exist
- `400` validation

### Experience: POST, PATCH, DELETE /students/me/experiences
**Who:** student.
- Required: `companyName`, `industryType`, `jobType`, `designation`, `startDate`.
- Optional: `endDate` (leave out or `null` while the job is continuing), `responsibilities`.

```http
POST /api/students/me/experiences
Content-Type: application/json

{
  "companyName": "Brain Station 23", "industryType": "Software", "jobType": "internship",
  "designation": "Software Engineer Intern", "startDate": "2025-06-01", "endDate": "2025-09-30",
  "responsibilities": "Built REST APIs with NestJS"
}
```

**201 Created:**
```json
{
  "id": "adafdd29-e182-4d02-a94a-3fa8cbc31c0c",
  "studentId": "bf882db7-5cb9-41e7-bef7-aec1c915a5ad",
  "companyName": "Brain Station 23",
  "industryType": "Software",
  "jobType": "internship",
  "designation": "Software Engineer Intern",
  "startDate": "2025-06-01",
  "endDate": "2025-09-30",
  "responsibilities": "Built REST APIs with NestJS"
}
```

To mark the job as still continuing: `PATCH /students/me/experiences/:id` with `{ "endDate": null }`. `DELETE` returns `204`.

**Errors:** `400 End date cannot be before start date`, `404`.

### References: POST, PATCH, DELETE /students/me/references
**Who:** student. All fields are required: `name`, `designation`, `organization`, `email`, `mobile`, `relation`.

```http
POST /api/students/me/references
Content-Type: application/json

{ "name": "Sadia Rahman", "designation": "Team Lead", "organization": "Brain Station 23",
  "email": "sadia@example.com", "mobile": "01712345670", "relation": "professional" }
```

**201 Created:**
```json
{
  "id": "ffac41b6-2d9d-4771-b22d-704bb612376f",
  "studentId": "bf882db7-5cb9-41e7-bef7-aec1c915a5ad",
  "name": "Sadia Rahman",
  "designation": "Team Lead",
  "organization": "Brain Station 23",
  "email": "sadia@example.com",
  "mobile": "01712345670",
  "relation": "professional"
}
```

`PATCH /students/me/references/:id` changes the fields you send. `DELETE` returns `204`.

### GET /students
**Who:** employer. Your candidates: only students who applied to one of your jobs or sent their CV to your company. There is no open list of every student.

| Query | Meaning |
|---|---|
| `q` | Name or AIUB ID contains this |
| `studyLevel` | `ongoing` or `graduated` |
| `preferredJobType` | `full_time` or `internship` |
| `industry` | Matches any of the student's preferred industries |
| `hasCv` | `true`: only students who uploaded a CV |
| `page`, `limit` | Paging |

```http
GET /api/students?q=Rahim&studyLevel=graduated&hasCv=true&limit=5
Authorization: Bearer <employer token>
```

**200 OK** (trimmed):
```json
{
  "items": [
    {
      "id": "bf882db7-5cb9-41e7-bef7-aec1c915a5ad",
      "name": "Rahim Uddin",
      "aiubId": "22-48123-1",
      "studyLevel": "graduated",
      "preferredIndustryTypes": ["Software", "Telecom"],
      "cvUrl": "/api/uploads/cvs/3eefa7fa-0d40-4acb-8320-142a5fa81899.pdf",
      "email": "22-48123-1@student.aiub.edu",
      "completeness": { "isComplete": true, "missing": [] },
      "...": "..."
    }
  ],
  "total": 1, "page": 1, "limit": 5
}
```

**Errors:** `403` for students.

### GET /students/:id
**Who:** employer. One of your candidates with education, experience and references. Same shape as `GET /students/me`.

**Errors:** `404 Student not found` (also when the student has not applied or sent a CV to your company).

---

## 5. Employers

### GET /employers/me
**Who:** employer. Your company profile.

**200 OK:** the same shape as `profile` in the employer registration response.

### PATCH /employers/me
**Who:** employer. Changes only the fields you send. Allowed fields:
- `companyName`, `websiteUrl`, `industryType`, `about`
- `hrName`, `hrEmail`, `hrMobileNumber`
- `hasOngoingHiring`
- `boothNumber`: the booth OPA gave you, for example `B-12` (up to 20 characters). An empty string clears it.

```http
PATCH /api/employers/me
Authorization: Bearer <employer token>
Content-Type: application/json

{ "about": "Acme builds banking, e-commerce and HR software." }
```

**200 OK:** the updated company profile.

### POST /employers/me/logo
**Who:** employer. Uploads the company logo (JPG or PNG, max 2 MB) as `multipart/form-data` field `file`.

**201 Created:** the company profile, with `"logoUrl": "/api/uploads/logos/07d495d8-....png"`. Anyone can load logos.

### GET /employers
**Who:** anyone, no login needed. Searches companies, with the number of open jobs. Visitors get the public fields only (`id`, `companyName`, `websiteUrl`, `logoUrl`, `industryType`, `about`, `hasOngoingHiring`, `boothNumber`); logged-in users also get the HR contact and the rest.

| Query | Meaning |
|---|---|
| `q` | Company name contains this |
| `industry` | Industry contains this |
| `hiring` | `true` or `false`: "Any ongoing hiring?" |
| `page`, `limit` | Paging |

```http
GET /api/employers?q=Acme
Authorization: Bearer <token>
```

**200 OK** (trimmed):
```json
{
  "items": [
    {
      "id": "e4a60a50-e486-4bf8-bdd6-09ec2bca8ada",
      "companyName": "Acme Software Ltd.",
      "websiteUrl": "https://www.acme-software.com",
      "logoUrl": "/api/uploads/logos/07d495d8-5fcc-413c-9bf6-918855828b98.png",
      "industryType": "Software",
      "about": "Acme builds banking, e-commerce and HR software.",
      "hrName": "Hasan Mahmud",
      "hrEmail": "hr@acme-software.com",
      "hrMobileNumber": "01712345678",
      "hasOngoingHiring": true,
      "openJobCount": 2,
      "...": "..."
    }
  ],
  "total": 1, "page": 1, "limit": 20
}
```

### GET /employers/:id
**Who:** anyone, no login needed. One company with its **open** jobs (soonest deadline first). Same visitor rule as above: no HR contact without a login.

**200 OK** (trimmed):
```json
{
  "id": "e4a60a50-e486-4bf8-bdd6-09ec2bca8ada",
  "companyName": "Acme Software Ltd.",
  "...": "...",
  "openJobs": [
    { "id": "ff25313e-95cb-4cf1-aadc-52fdb1d7fa08", "positionName": "QA Intern",
      "location": "anywhere_in_bangladesh", "deadline": "2026-12-20", "...": "..." }
  ]
}
```

**Errors:** `404 Company not found`.

---

## 6. Jobs

A job is **open** when it is active (not closed by the employer), and its deadline is today or later (Dhaka time). Only open jobs appear in the list and accept applications.

### POST /jobs
**Who:** employer. Creates a job post with any number of questions.

| Field | Required | Notes |
|---|---|---|
| `positionName` | yes | |
| `location` | yes | One of the 8 divisions, or `anywhere_in_bangladesh` |
| `workplace` | yes | `office`, `remote`, `online` |
| `educationRequirement` | yes | |
| `additionalRequirements` | no | |
| `responsibilities` | yes | |
| `skillsAndExpertise` | yes | |
| `employmentStatus` | yes | `full_time`, `internship`, `part_time`, `contractual` |
| `salaryNegotiable` | yes | `true` = "Negotiable" |
| `salaryAmount` | when not negotiable | Free text, e.g. `"30,000 - 40,000 BDT"` |
| `compensationAndBenefits` | no | Default `"As per company policy"` |
| `deadline` | yes | `YYYY-MM-DD`, today or later |
| `questions` | no | Up to 50. Each has `text`, plus optional `type` (`text` by default, or `single_choice`), `options` (at least 2 for `single_choice`) and `isRequired` (default `true`) |

```http
POST /api/jobs
Authorization: Bearer <employer token>
Content-Type: application/json

{
  "positionName": "Junior Backend Developer",
  "location": "dhaka",
  "workplace": "office",
  "educationRequirement": "B.Sc. in CSE or a related subject",
  "additionalRequirements": "Good communication skills in English",
  "responsibilities": "Build and maintain REST APIs; write unit tests",
  "skillsAndExpertise": "TypeScript, Node.js, PostgreSQL",
  "employmentStatus": "full_time",
  "salaryNegotiable": false,
  "salaryAmount": "30,000 - 40,000 BDT",
  "deadline": "2026-12-31",
  "questions": [
    { "text": "Why do you want to join Acme?" },
    { "text": "Years of experience with TypeScript?", "type": "single_choice", "options": ["Less than 1", "1-2", "3 or more"] },
    { "text": "Portfolio link", "isRequired": false }
  ]
}
```

**201 Created** (trimmed):
```json
{
  "id": "ce66a4a0-a4d3-48f1-9dd8-293185b3f988",
  "employerId": "e4a60a50-e486-4bf8-bdd6-09ec2bca8ada",
  "employer": { "id": "e4a60a50-...", "companyName": "Acme Software Ltd.", "...": "..." },
  "positionName": "Junior Backend Developer",
  "location": "dhaka",
  "workplace": "office",
  "employmentStatus": "full_time",
  "salaryNegotiable": false,
  "salaryAmount": "30,000 - 40,000 BDT",
  "compensationAndBenefits": "As per company policy",
  "deadline": "2026-12-31",
  "isActive": true,
  "isOpen": true,
  "questions": [
    { "id": "a96c0dd0-5e36-4928-a632-dd2ae42f3b2b", "text": "Why do you want to join Acme?",
      "type": "text", "options": [], "isRequired": true, "order": 1 },
    { "id": "...", "text": "Years of experience with TypeScript?", "type": "single_choice",
      "options": ["Less than 1", "1-2", "3 or more"], "isRequired": true, "order": 2 },
    { "id": "...", "text": "Portfolio link", "type": "text", "options": [], "isRequired": false, "order": 3 }
  ]
}
```

**Errors (400):**
- `Deadline cannot be in the past`
- `Give a salaryAmount, or set salaryNegotiable to true`
- `Question 1: single_choice needs at least 2 different options`
- `location must be one of the following values: dhaka, chattogram, ...`

### GET /jobs
**Who:** anyone, no login needed. Lists **open** jobs, newest first.

| Query | Meaning |
|---|---|
| `q` | Position or company name contains this |
| `location` | One location value |
| `workplace` | `office`, `remote`, `online` |
| `employmentStatus` | `full_time`, `internship`, `part_time`, `contractual` |
| `industry` | Company industry contains this |
| `employerId` | Jobs of one company |
| `page`, `limit` | Paging |

```http
GET /api/jobs?q=Acme&location=dhaka&limit=5
```

**200 OK** (trimmed; the list doesn't include questions):
```json
{
  "items": [
    {
      "id": "ce66a4a0-a4d3-48f1-9dd8-293185b3f988",
      "employer": {
        "id": "e4a60a50-e486-4bf8-bdd6-09ec2bca8ada",
        "companyName": "Acme Software Ltd.",
        "websiteUrl": "https://www.acme-software.com",
        "logoUrl": "/api/uploads/logos/07d495d8-5fcc-413c-9bf6-918855828b98.png",
        "industryType": "Software"
      },
      "positionName": "Junior Backend Developer",
      "location": "dhaka",
      "workplace": "office",
      "employmentStatus": "full_time",
      "salaryNegotiable": false,
      "salaryAmount": "30,000 - 40,000 BDT",
      "deadline": "2026-12-31",
      "isOpen": true,
      "...": "..."
    }
  ],
  "total": 1, "page": 1, "limit": 5
}
```

### GET /jobs/:id
**Who:** anyone, no login needed. One job with its questions. What you see depends on who's asking:

| Caller | Extra in the response |
|---|---|
| Visitor (no token) | `employer` has public fields only: `id`, `companyName`, `websiteUrl`, `logoUrl`, `industryType`, `about`, `hasOngoingHiring`. No HR contact. |
| Logged-in user | The full `employer`, including HR name, email and mobile |
| Student | Also `myApplication`: `null`, or `{ "id": "...", "status": "submitted" }` |

```http
GET /api/jobs/ce66a4a0-a4d3-48f1-9dd8-293185b3f988
Authorization: Bearer <student token>
```

**200 OK** (trimmed):
```json
{
  "id": "ce66a4a0-a4d3-48f1-9dd8-293185b3f988",
  "positionName": "Junior Backend Developer",
  "employer": { "companyName": "Acme Software Ltd.", "hrEmail": "hr@acme-software.com", "...": "..." },
  "questions": [ { "id": "a96c0dd0-...", "text": "Why do you want to join Acme?", "type": "text", "options": [], "isRequired": true, "order": 1 } ],
  "isOpen": true,
  "myApplication": null,
  "...": "..."
}
```

Closed jobs still open by ID (with `"isOpen": false`), so old links keep working.

**Errors:** `404 Job not found`.

### GET /jobs/mine
**Who:** employer. All your jobs (open and closed), newest first, each with `applicationCount` and its questions.

**200 OK** (trimmed):
```json
{
  "items": [
    { "id": "ff25313e-...", "positionName": "QA Intern", "isActive": true, "isOpen": true, "applicationCount": 0, "questions": [ "..." ], "...": "..." }
  ],
  "total": 2, "page": 1, "limit": 20
}
```

### PATCH /jobs/:id
**Who:** the employer that owns the job. Changes the fields you send, with the same rules as `POST /jobs`. Sending `questions` **replaces all questions**, but only while nobody has applied.

```http
PATCH /api/jobs/ff25313e-95cb-4cf1-aadc-52fdb1d7fa08
Content-Type: application/json

{
  "salaryNegotiable": false,
  "salaryAmount": "15,000 BDT",
  "questions": [ { "text": "Available on weekends?", "type": "single_choice", "options": ["Yes", "No"] } ]
}
```

**200 OK:** the updated job.

**Errors:**
- `403 This job belongs to another company`
- `409 Questions cannot be changed after students have applied`
- `400 Deadline cannot be in the past`

### PATCH /jobs/:id/close
**Who:** the employer that owns the job. Stops new applications. Existing applications are kept. No body.

**200 OK:** the job with `"isActive": false, "isOpen": false`.

### PATCH /jobs/:id/reopen
**Who:** the employer that owns the job. Takes a closed job back to accepting applications. No body.

**200 OK:** the job with `"isActive": true, "isOpen": true`.

**Errors:** `400 The deadline has passed. Change the deadline to reopen this job.`, `403 This job belongs to another company`.

---

## 7. Applications

### POST /jobs/:id/apply
**Who:** student. Applies for an open job. The profile is attached automatically.

Rules:
- Your profile must be complete: address, gender, at least one education, and a CV (on the profile or uploaded with this request).
- Answer every required question. A `single_choice` answer must exactly match one of the options.
- `joiningDate` is required: `immediately`, `within_1_week`, `within_15_days` or `within_1_month`.
- You can apply only once per job.

**Option A: JSON** (uses the CV on your profile):
```http
POST /api/jobs/ce66a4a0-a4d3-48f1-9dd8-293185b3f988/apply
Authorization: Bearer <student token>
Content-Type: application/json

{
  "joiningDate": "within_1_week",
  "answers": [
    { "questionId": "a96c0dd0-5e36-4928-a632-dd2ae42f3b2b", "answer": "I enjoy building reliable backends." },
    { "questionId": "<id of question 2>", "answer": "1-2" }
  ]
}
```

**Option B: multipart** (attach a different CV for this job). Send `answers` as a JSON **string**:
```bash
curl -X POST http://localhost:3000/api/jobs/ff25313e-95cb-4cf1-aadc-52fdb1d7fa08/apply \
  -H "Authorization: Bearer <student token>" \
  -F "joiningDate=within_15_days" \
  -F 'answers=[{"questionId":"22331957-44c8-47ff-871e-1b0a76e7849d","answer":"Yes"}]' \
  -F "file=@cv-qa.pdf"
```

**201 Created** (trimmed):
```json
{
  "id": "4ce5abf1-cb3d-4bb9-bc05-ae305a789e7d",
  "jobPostId": "ce66a4a0-a4d3-48f1-9dd8-293185b3f988",
  "jobPost": { "positionName": "Junior Backend Developer", "employer": { "companyName": "Acme Software Ltd.", "...": "..." }, "...": "..." },
  "student": { "name": "Rahim Uddin", "aiubId": "22-48123-1", "user": { "email": "22-48123-1@student.aiub.edu" }, "...": "..." },
  "answers": [
    { "questionId": "a96c0dd0-...", "question": { "text": "Why do you want to join Acme?", "order": 1, "...": "..." },
      "answer": "I enjoy building reliable backends." }
  ],
  "joiningDate": "within_1_week",
  "cvUrl": "/api/uploads/cvs/3eefa7fa-0d40-4acb-8320-142a5fa81899.pdf",
  "status": "submitted",
  "createdAt": "2026-11-04T06:17:08.327Z"
}
```

**Errors:**
- `400 Complete your profile first. Missing: cv`
- `400 Question 2 is required: "Years of experience with TypeScript?"`
- `400 This job is closed for applications`
- `401 Log in to continue` (visitor)
- `403 Only students can do this. ...`
- `404 Job not found`
- `409 You have already applied for this job`

### GET /applications/mine
**Who:** student. **All** your applications at once (no paging), newest first. Each one includes the job, the company, your answers with their questions, the joining date, the CV and the status. Each job has `isOpen`.

Optional query: `status` (`submitted`, `shortlisted`, `rejected`, `hired`).

```http
GET /api/applications/mine?status=shortlisted
Authorization: Bearer <student token>
```

**200 OK** (trimmed):
```json
{
  "items": [
    {
      "id": "c90a9bbe-fab2-48f3-91f1-105ec02518eb",
      "jobPost": { "positionName": "QA Intern", "isOpen": true, "employer": { "companyName": "Acme Software Ltd.", "...": "..." }, "...": "..." },
      "answers": [ { "question": { "text": "Available on weekends?", "...": "..." }, "answer": "Yes" } ],
      "joiningDate": "within_15_days",
      "cvUrl": "/api/uploads/cvs/8b6dbe0e-7389-40b7-b14d-f69d7bb6ec01.pdf",
      "status": "submitted",
      "createdAt": "2026-11-04T06:17:08.390Z"
    }
  ],
  "total": 2
}
```

`page` and `limit` aren't accepted here (`400`).

### GET /jobs/:id/applications
**Who:** the employer that owns the job. Applicants for one job, with the student's profile, login email and answers.

Query: `status` (optional), `page`, `limit`.

```http
GET /api/jobs/ce66a4a0-a4d3-48f1-9dd8-293185b3f988/applications?status=submitted
Authorization: Bearer <employer token>
```

**200 OK** (trimmed):
```json
{
  "items": [
    {
      "id": "4ce5abf1-cb3d-4bb9-bc05-ae305a789e7d",
      "student": { "name": "Rahim Uddin", "aiubId": "22-48123-1", "mobileNumber": "01812345678",
                   "user": { "email": "22-48123-1@student.aiub.edu" }, "cvUrl": "...", "...": "..." },
      "answers": [ { "question": { "text": "Why do you want to join Acme?" }, "answer": "I enjoy building reliable backends." } ],
      "joiningDate": "within_1_week",
      "cvUrl": "/api/uploads/cvs/3eefa7fa-0d40-4acb-8320-142a5fa81899.pdf",
      "status": "submitted"
    }
  ],
  "total": 1, "page": 1, "limit": 20
}
```

**Errors:** `403 This job belongs to another company`, `404`.

### GET /applications/:id
**Who:** the student who applied, or the company the application is for. Returns the full application: job, company, student, answers, CV and status.

**Errors:** `403 You cannot view this application`, `404`.

### PATCH /applications/:id/status
**Who:** the company the application is for. Sets the status to `submitted`, `shortlisted`, `rejected` or `hired`.

```http
PATCH /api/applications/4ce5abf1-cb3d-4bb9-bc05-ae305a789e7d/status
Authorization: Bearer <employer token>
Content-Type: application/json

{ "status": "shortlisted" }
```

**200 OK:** the full application with `"status": "shortlisted"`.

**Errors:** `403 This application is for another company`, `400` invalid status.

---

## 8. CV drops

"Just drop CV": a student sends their CV to one company. Only that company can see it. There is no general pool.

### POST /cv-drops
**Who:** student.
- Required `employerId`: the company.
- Optional `note` (max 500 characters).
- Optional `file`: a PDF. Without one, the profile CV is used.

Dropping again to the same company **replaces** the earlier drop.

JSON (profile CV):
```http
POST /api/cv-drops
Authorization: Bearer <student token>
Content-Type: application/json

{ "employerId": "7701d31b-8fb9-4ddc-b1b8-ef3566fd936f", "note": "Open to backend roles" }
```

Multipart (a new CV, to one company):
```bash
curl -X POST http://localhost:3000/api/cv-drops \
  -H "Authorization: Bearer <student token>" \
  -F "employerId=7701d31b-8fb9-4ddc-b1b8-ef3566fd936f" \
  -F "note=Interested in banking tech" \
  -F "file=@cv-bank.pdf"
```

**201 Created:**
```json
{
  "id": "9ff69a12-8db3-4864-85f3-b4344576f0e6",
  "studentId": "bf882db7-5cb9-41e7-bef7-aec1c915a5ad",
  "employerId": "7701d31b-8fb9-4ddc-b1b8-ef3566fd936f",
  "employer": { "id": "7701d31b-8fb9-4ddc-b1b8-ef3566fd936f", "companyName": "Nexus Softworks Ltd.", "...": "..." },
  "cvUrl": "/api/uploads/cvs/3eefa7fa-0d40-4acb-8320-142a5fa81899.pdf",
  "note": "Open to backend roles",
  "createdAt": "2026-11-04T06:17:08.506Z",
  "updatedAt": "2026-11-04T06:17:08.506Z"
}
```

**Errors:**
- `400 Choose a company to send your CV to`
- `400 Attach a CV file, or upload one to your profile first`
- `404 Company not found`

### GET /cv-drops/mine
**Who:** student. Your drops, each with the company it went to. Paged.

### GET /cv-drops/received
**Who:** employer. CVs students sent to your company. Paged.

```http
GET /api/cv-drops/received
Authorization: Bearer <employer token>
```

**200 OK** (trimmed):
```json
{
  "items": [
    {
      "id": "7d4ba2a9-c2e9-4c56-85af-aa5ccd97f029",
      "student": { "name": "Rahim Uddin", "aiubId": "22-48123-1", "user": { "email": "22-48123-1@student.aiub.edu" }, "...": "..." },
      "employerId": "7701d31b-8fb9-4ddc-b1b8-ef3566fd936f",
      "cvUrl": "/api/uploads/cvs/56127b60-be5d-4d93-91df-750538547aa7.pdf",
      "note": "Interested in banking tech",
      "createdAt": "2026-11-04T06:17:08.524Z"
    }
  ],
  "total": 1, "page": 1, "limit": 20
}
```

### DELETE /cv-drops/:id
**Who:** the student who made the drop. Returns `204 No Content`.

**Errors:** `404 CV drop not found` (also when it isn't yours).

---

## 9. Candidate criteria

For companies with no opening right now ("Any ongoing hiring? No"): they describe the candidates they want, and the API finds matching students.

### POST /candidate-criteria
**Who:** employer.
- Required: `title`, `description`.
- Optional: `preferredJobType`, `studyLevel`, `industryType`, `skills`.

The first three are used for matching. Leave them empty for "any".

```http
POST /api/candidate-criteria
Authorization: Bearer <employer token>
Content-Type: application/json

{
  "title": "Fresh CSE graduates for 2027 intake",
  "description": "Graduates who enjoy problem solving.",
  "preferredJobType": "full_time",
  "studyLevel": "graduated",
  "industryType": "Software",
  "skills": "TypeScript, SQL"
}
```

**201 Created:**
```json
{
  "id": "64e05791-12ce-4775-8bff-9c20c5d30d1d",
  "employerId": "7701d31b-8fb9-4ddc-b1b8-ef3566fd936f",
  "title": "Fresh CSE graduates for 2027 intake",
  "description": "Graduates who enjoy problem solving.",
  "preferredJobType": "full_time",
  "studyLevel": "graduated",
  "industryType": "Software",
  "skills": "TypeScript, SQL",
  "attachmentUrl": null,
  "createdAt": "2026-11-04T06:17:08.562Z",
  "updatedAt": "2026-11-04T06:17:08.562Z"
}
```

### GET /candidate-criteria
**Who:** any logged-in user. Criteria from every company, newest first, each with its `employer`. Optional `employerId` filter, plus paging.

### GET /candidate-criteria/mine
**Who:** employer. Your own criteria. Paged.

### GET /candidate-criteria/:id
**Who:** any logged-in user. One criteria with its company.

**Errors:** `404 Candidate criteria not found`.

### PATCH /candidate-criteria/:id
**Who:** the company that posted it. Changes the fields you send. Other companies get `403 These criteria belong to another company`.

```http
PATCH /api/candidate-criteria/64e05791-12ce-4775-8bff-9c20c5d30d1d
Content-Type: application/json

{ "skills": "TypeScript, SQL, Git" }
```

**200 OK:** the updated criteria.

### POST /candidate-criteria/:id/attachment
**Who:** the company that posted it. Attaches a PDF (max 5 MB) as `multipart/form-data` field `file`.

**201 Created:** the criteria with `"attachmentUrl": "/api/uploads/attachments/fece404b-....pdf"`.

### GET /candidate-criteria/:id/matches
**Who:** the company that posted it. Your candidates (students who applied or sent you a CV) whose job type, study level and preferred industries fit the criteria. It returns the same shape as `GET /students`. Paged.

### DELETE /candidate-criteria/:id
**Who:** the company that posted it. Returns `204 No Content`.

---

## 10. Uploads (downloading files)

### GET /uploads/:kind/:filename
Opens a stored file. Use the URL exactly as the API returned it (for example `cvUrl`). `kind` is `cvs`, `pictures`, `logos` or `attachments`.

| File | Who can open it |
|---|---|
| Company logo | Anyone, no login |
| Criteria attachment | Students and approved employers |
| Profile picture | Students, and a company the student applied or sent a CV to |
| CV | The student who owns it, and a company the student applied or sent a CV to |

```http
GET /api/uploads/cvs/3eefa7fa-0d40-4acb-8320-142a5fa81899.pdf
Authorization: Bearer <token>
```

**200 OK:** the file itself (for example `application/pdf`).

**Errors:**
- `401 Log in to view this file`
- `403 You cannot access this file`
- `404 File not found`

An `<img src>` or plain link can't send the `Authorization` header. For anything other than logos, the frontend should fetch the file with the token and show it from a blob URL.

---

## 11. Admin

All routes need an admin token.

### GET /admin/stats
Overall numbers: students (total, with CV, seminar sign-ups, `alumni`, and `byFaculty`), companies by status (`pending`, `approved`, `rejected`), jobs (open, closed), applications by status, CV drops and candidate criteria.

`students.byFaculty` counts registered accounts per faculty, biggest first, with `faculty: null` (accounts made before faculty was asked) last:
```json
[{ "faculty": "Faculty of Science and Technology", "total": 412, "alumni": 37, "current": 375,
   "programs": [{ "program": "Bachelor of Science in Computer Science and Engineering", "total": 380, "alumni": 30 }] }]
```

### GET /admin/employers
Every company with its login email (`user.email`), `jobCount` and `openJobCount`. Query: `status` (`pending`, `approved`, `rejected`; leave out for all), `q` (company name, login email or HR name), `page`, `limit`. With `status=pending` the oldest come first.

### GET /admin/employers/:id
One company with its login email, all its jobs (with `applicationCount`), `candidateCriteriaCount` and `cvDropsReceived`.

### PATCH /admin/employers/:id/approve
Approves the company and emails it. Also works on a rejected company. **200** the company profile.

### PATCH /admin/employers/:id/reject
Body: `{ "reason": "Website and HR contact could not be verified." }` (required, up to 500 characters). Rejects the company, or withdraws an approval, and emails it the reason. **400** without a reason, **404** unknown company.

### POST /admin/alumni/upload
`multipart/form-data` with `file`: the alumni list as `.xlsx` or `.csv` (Google Sheets: File > Download), up to 5 MB. The first sheet with the headings is used; headings can sit below a title row and in any order:
- `ID` (or `AIUB ID`, `Student ID`): like `16-32398-2`
- a heading containing `Reg` (like `Reg #` or `Grad Reg`): the graduation registration number
- optional: a heading containing `Name`, `Program` (or `Degree`), `Faculty`, `Convocation`

Faculty names are matched to the four AIUB faculties (so `Faculty of Science & Technology` and `FST` count as `Faculty of Science and Technology`); others are kept as written. Name, program and faculty fill in the graduate's profile at sign-up, and a later upload also updates the program and faculty of alumni who already registered. A sheet without one of these columns keeps what an earlier upload set.

New IDs are added and changed ones updated; IDs not in the file stay, so the list can be uploaded again or in parts. Every row in the sheet is read, including rows hidden by a filter. Registration numbers are checked with a keyed hash and also kept encrypted (AES-256-GCM, key from `JWT_SECRET`) so the admin can see them. **If `JWT_SECRET` changes, upload the list again**, or sign-ups stop matching and the numbers can't be shown.

**200 OK:**
```json
{ "added": 120, "updated": 2, "unchanged": 0, "skipped": 1,
  "problems": [{ "row": 7, "message": "Registration number for 13-23331-1 is empty" }],
  "totalInList": 122 }
```
`problems` lists the first 50 skipped rows. **400** for another file type, a sheet without the headings, or no usable rows.

### GET /admin/alumni
The list with who has registered. Query: `status` (`registered`, `not_registered`), `q` (AIUB ID, name, program or login email), `page`, `limit`. Each item: `id`, `aiubId`, `registrationNumber` (as written in the sheet; `null` if it can't be shown, then upload the list again), `name`, `program`, `faculty`, `convocation`, `lockedUntil` (set while locked after wrong numbers), and `account` (`email`, `name`, `isAlumni`, `registeredAt`) or `null`. An ID counts as registered when any student account has it, including a current student who signed up with the AIUB email. Also returns `totalInList` and `registered`.

### DELETE /admin/alumni/:id
Removes one ID from the list. **204**. An account already made with it is not deleted.

### POST /admin/current-students/upload
`multipart/form-data` with `file`: the current student list as `.xlsx` or `.csv`, up to 5 MB. Headings: `ID` (required), and `Name`, `Program` (or `Degree`), `Faculty`. No registration number. Faculty names are matched to the four AIUB faculties like the alumni list.

New IDs are added and changed ones updated; IDs not in the file stay. Students who already registered with an ID on the list get its program and faculty, which are then locked (`academicsFromList: true`). **200** `{ added, updated, unchanged, skipped, problems, totalInList }` as for the alumni list. **400** for another file type, a sheet without an `ID` heading, or no usable rows.

### GET /admin/current-students
The list with who has registered. Query: `status` (`registered`, `not_registered`), `q` (AIUB ID, name, program or login email), `page`, `limit`. Each item: `id`, `aiubId`, `name`, `program`, `faculty`, and `account` (`email`, `name`, `isAlumni`, `registeredAt`) or `null`. Also returns `totalInList` and `registered`.

### DELETE /admin/current-students/:id
Removes one ID from the list. **204**. An account already made with it keeps its program and faculty.

## 12. Reference

### Allowed values

| Field | Values |
|---|---|
| `role` | `student`, `employer`, `admin` |
| Company `status` | `pending`, `approved`, `rejected` |
| `gender` | `male`, `female` |
| `preferredJobType` (student, criteria) | `full_time`, `internship` |
| `studyLevel` | `ongoing`, `graduated` |
| Education `level` | `ssc`, `hsc`, `bsc`, `msc_1`, `msc_2`, `professional` |
| Experience `jobType` | `internship`, `full_time`, `part_time`, `contractual` |
| Reference `relation` | `relative`, `family_friend`, `academic`, `professional` |
| Job `location` | `dhaka`, `chattogram`, `rajshahi`, `khulna`, `barishal`, `sylhet`, `rangpur`, `mymensingh`, `anywhere_in_bangladesh` |
| Job `workplace` | `office`, `remote`, `online` |
| Job `employmentStatus` | `full_time`, `internship`, `part_time`, `contractual` |
| Question `type` | `text`, `single_choice` |
| `joiningDate` | `immediately`, `within_1_week`, `within_15_days`, `within_1_month` |
| Application `status` | `submitted`, `shortlisted`, `rejected`, `hired` |

Formats:
- AIUB ID: `NN-NNNNN-N`, for example `22-48123-1`.
- Mobile: a Bangladeshi number, for example `01712345678`. A `+880` prefix is also accepted.

### All endpoints

| Method | Path | Who |
|---|---|---|
| GET | `/` | anyone |
| POST | `/auth/register/student` | anyone |
| POST | `/auth/student-list/lookup` | anyone with an email token |
| POST | `/auth/alumni/check` | anyone |
| POST | `/auth/register/alumni` | anyone |
| POST | `/auth/register/employer` | anyone |
| POST | `/auth/login` | anyone |
| POST | `/auth/forgot-password` | anyone |
| POST | `/auth/reset-password` | anyone |
| GET | `/auth/me` | logged in |
| GET, PATCH | `/students/me` | student |
| POST | `/students/me/picture` | student |
| POST | `/students/me/cv` | student |
| POST | `/students/me/educations` | student |
| PATCH, DELETE | `/students/me/educations/:id` | student |
| POST | `/students/me/experiences` | student |
| PATCH, DELETE | `/students/me/experiences/:id` | student |
| POST | `/students/me/references` | student |
| PATCH, DELETE | `/students/me/references/:id` | student |
| GET | `/students` | employer (own candidates) |
| GET | `/students/:id` | employer (own candidates) |
| GET, PATCH | `/employers/me` | employer |
| POST | `/employers/me/logo` | employer |
| GET | `/employers` | anyone |
| GET | `/employers/:id` | anyone |
| POST | `/jobs` | employer |
| GET | `/jobs` | anyone |
| GET | `/jobs/mine` | employer |
| GET | `/jobs/:id` | anyone |
| PATCH | `/jobs/:id` | owning employer |
| PATCH | `/jobs/:id/close` | owning employer |
| PATCH | `/jobs/:id/reopen` | owning employer |
| POST | `/jobs/:id/apply` | student |
| GET | `/applications/mine` | student |
| GET | `/jobs/:id/applications` | owning employer |
| GET | `/applications/:id` | applicant, owning employer |
| PATCH | `/applications/:id/status` | owning employer |
| POST | `/cv-drops` | student |
| GET | `/cv-drops/mine` | student |
| GET | `/cv-drops/received` | employer |
| DELETE | `/cv-drops/:id` | owning student |
| POST | `/candidate-criteria` | employer |
| GET | `/candidate-criteria` | logged in |
| GET | `/candidate-criteria/mine` | employer |
| GET | `/candidate-criteria/:id` | logged in |
| PATCH, DELETE | `/candidate-criteria/:id` | owning employer |
| POST | `/candidate-criteria/:id/attachment` | owning employer |
| GET | `/candidate-criteria/:id/matches` | owning employer |
| GET | `/uploads/:kind/:filename` | depends on the file |
