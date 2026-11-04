import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../enums/index.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

function makeContext(headers: Record<string, string> = {}): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

function makeGuard(isPublic: boolean) {
  return new JwtAuthGuard({
    getAllAndOverride: () => isPublic,
  } as unknown as Reflector);
}

const student = { id: 'u1', email: 'a@b.com', role: UserRole.STUDENT };

describe('JwtAuthGuard', () => {
  it('lets visitors without a token into public routes', () => {
    expect(makeGuard(true).canActivate(makeContext())).toBe(true);
  });

  it('ignores a bad token on public routes instead of rejecting', () => {
    const guard = makeGuard(true);
    expect(
      guard.handleRequest(null, false, null, makeContext()),
    ).toBeUndefined();
  });

  it('keeps the user on public routes when the token is valid', () => {
    const guard = makeGuard(true);
    expect(guard.handleRequest(null, student, null, makeContext())).toBe(
      student,
    );
  });

  it('rejects a missing or bad token on protected routes', () => {
    const guard = makeGuard(false);
    expect(() => guard.handleRequest(null, false, null, makeContext())).toThrow(
      new UnauthorizedException('Log in to continue'),
    );
  });

  it('accepts a valid token on protected routes', () => {
    const guard = makeGuard(false);
    expect(guard.handleRequest(null, student, null, makeContext())).toBe(
      student,
    );
  });
});
