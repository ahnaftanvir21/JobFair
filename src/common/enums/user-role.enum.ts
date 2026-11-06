export enum UserRole {
  STUDENT = 'student',
  EMPLOYER = 'employer',
  /** Fair office staff. Created from ADMIN_EMAIL / ADMIN_PASSWORD, never through the API. */
  ADMIN = 'admin',
}
