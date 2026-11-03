import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../enums/index.js';
import { RolesGuard } from './roles.guard.js';

function makeContext(user?: { role: UserRole }): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function makeGuard(roles: UserRole[] | undefined) {
  const reflector = {
    getAllAndOverride: () => roles,
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('allows any logged-in user when no roles are set', () => {
    expect(makeGuard(undefined).canActivate(makeContext())).toBe(true);
  });

  it('allows a user with a listed role', () => {
    const guard = makeGuard([UserRole.EMPLOYER]);
    expect(guard.canActivate(makeContext({ role: UserRole.EMPLOYER }))).toBe(
      true,
    );
  });

  it('blocks a user whose role is not listed', () => {
    const guard = makeGuard([UserRole.EMPLOYER]);
    expect(() =>
      guard.canActivate(makeContext({ role: UserRole.STUDENT })),
    ).toThrow(ForbiddenException);
  });

  it('blocks a request with no user', () => {
    const guard = makeGuard([UserRole.STUDENT]);
    expect(() => guard.canActivate(makeContext())).toThrow(ForbiddenException);
  });
});
