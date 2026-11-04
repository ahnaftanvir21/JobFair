import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '../enums/index.js';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to the given roles (enforced by RolesGuard).
 * In Swagger, the route uses only the token box for those roles.
 */
export const Roles = (...roles: UserRole[]) =>
  applyDecorators(
    SetMetadata(ROLES_KEY, roles),
    ...roles.map((role) => ApiBearerAuth(role)),
  );
