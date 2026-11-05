import { SetMetadata } from '@nestjs/common';

export const ALLOW_UNVERIFIED_KEY = 'allowUnverified';

/**
 * Lets accounts that have not verified their email yet use this route
 * (see EmailVerifiedGuard). Used for the own profile and the verify routes.
 */
export const AllowUnverified = () => SetMetadata(ALLOW_UNVERIFIED_KEY, true);
