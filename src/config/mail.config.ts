import { registerAs } from '@nestjs/config';

/**
 * Email settings. Leave SMTP_HOST blank in development: emails are then
 * written to MAIL_OUTBOX_DIR (and the server log) instead of being sent.
 */
export default registerAs('mail', () => ({
  smtpHost: process.env.SMTP_HOST?.trim() || null,
  smtpPort: Number(process.env.SMTP_PORT || 587),
  // true for port 465; false for 587 (STARTTLS).
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER?.trim() || null,
  smtpPass: process.env.SMTP_PASS || null,
  from: process.env.MAIL_FROM?.trim() || 'AIUB Job Fair <no-reply@aiub-job-fair.local>',
  outboxDir: process.env.MAIL_OUTBOX_DIR?.trim() || 'mail-outbox',
  // Page on the frontend that reads ?token= and calls POST /api/auth/reset-password.
  resetPasswordUrl:
    process.env.RESET_PASSWORD_URL?.trim() ||
    'http://localhost:5173/reset-password',
}));
