import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_UNVERIFIED_KEY } from '../decorators/allow-unverified.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { UserRole } from '../enums/index.js';
import { EmailVerifiedGuard, VERIFY_EMAIL_FIRST } from './email-verified.guard.js';

function run(
  user: object | undefined,
  meta: { allowUnverified?: boolean; isPublic?: boolean } = {},
) {
  const request: { user?: object } = { user };
  const context = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  const reflector = {
    getAllAndOverride: (key: string) =>
      key === ALLOW_UNVERIFIED_KEY
        ? meta.allowUnverified
        : key === IS_PUBLIC_KEY
          ? meta.isPublic
          : undefined,
  } as unknown as Reflector;
  const result = new EmailVerifiedGuard(reflector).canActivate(context);
  return { result, request };
}

const base = { id: 'u1', email: 'a@b.com', role: UserRole.STUDENT };
const verified = { ...base, emailVerified: true };
const unverified = { ...base, emailVerified: false };

describe('EmailVerifiedGuard', () => {
  it('lets visitors and verified accounts through', () => {
    expect(run(undefined).result).toBe(true);
    expect(run(verified).result).toBe(true);
  });

  it('blocks unverified accounts on normal routes', () => {
    expect(() => run(unverified)).toThrow(
      new ForbiddenException(VERIFY_EMAIL_FIRST),
    );
  });

  it('allows unverified accounts on their own profile routes', () => {
    const { result, request } = run(unverified, { allowUnverified: true });
    expect(result).toBe(true);
    expect(request.user).toBe(unverified);
  });

  it('treats unverified accounts as visitors on public routes', () => {
    const { result, request } = run(unverified, { isPublic: true });
    expect(result).toBe(true);
    expect(request.user).toBeUndefined();
  });
});
