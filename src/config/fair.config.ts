import { registerAs } from '@nestjs/config';

/** Reads an optional cutoff date. Blank or missing means no cutoff. */
function optionalDate(name: string): Date | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `${name} must be a date like 2026-12-05T23:59:59+06:00, or left blank`,
    );
  }
  return date;
}

/** Job Fair 2026 settings. Override through the .env file. */
export default registerAs('fair', () => ({
  name: 'AIUB Job Fair 2026',
  /** Closes student registration, applying and CV drops. Null: no cutoff. */
  studentRegistrationDeadline: optionalDate('STUDENT_DEADLINE'),
  /** Closes employer registration, job posts and candidate criteria. Null: no cutoff. */
  employerRegistrationDeadline: optionalDate('EMPLOYER_DEADLINE'),
  uploads: {
    dir: process.env.UPLOAD_DIR ?? 'uploads',
    maxCvSizeMb: 5,
    maxImageSizeMb: 2,
  },
}));
