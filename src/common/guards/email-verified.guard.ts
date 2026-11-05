import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_UNVERIFIED_KEY } from '../decorators/allow-unverified.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { AuthUser } from '../interfaces/auth-user.interface.js';

export const VERIFY_EMAIL_FIRST =
  'Verify your email first. Enter the 6-digit code we emailed you.';

/**
 * Global guard, after the JWT and role guards. Accounts that have not
 * confirmed their email can only use routes marked @AllowUnverified() (their
 * own profile and the verify routes). On public routes they count as visitors.
 */
@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user || user.emailVerified) return true;

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(ALLOW_UNVERIFIED_KEY, targets)) {
      return true;
    }
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      request.user = undefined;
      return true;
    }
    throw new ForbiddenException(VERIFY_EMAIL_FIRST);
  }
}
