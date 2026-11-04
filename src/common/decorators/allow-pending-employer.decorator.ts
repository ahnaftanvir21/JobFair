import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_EMPLOYER_KEY = 'allowPendingEmployer';

/**
 * Lets employers whose company is not approved yet (or was rejected) use the
 * route, for example to view and fix their own profile.
 */
export const AllowPendingEmployer = () =>
  SetMetadata(ALLOW_PENDING_EMPLOYER_KEY, true);
