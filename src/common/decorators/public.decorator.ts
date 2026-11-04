import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';

export const IS_PUBLIC_KEY = 'isPublic';

/** Swagger markers read by setupSwagger to show the right lock on the route. */
export const PUBLIC_API_EXTENSION = 'x-public';
export const OPTIONAL_AUTH_API_EXTENSION = 'x-optional-auth';

/** Marks a route as reachable without logging in. */
export const Public = () =>
  applyDecorators(
    SetMetadata(IS_PUBLIC_KEY, true),
    ApiExtension(PUBLIC_API_EXTENSION, true),
  );

/**
 * Anyone can call the route. If a valid token is sent, the logged-in user is
 * available too (for example to show a student whether they already applied).
 */
export const OptionalAuth = () =>
  applyDecorators(
    SetMetadata(IS_PUBLIC_KEY, true),
    ApiExtension(OPTIONAL_AUTH_API_EXTENSION, true),
  );
