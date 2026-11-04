import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { AuthUser } from '../interfaces/auth-user.interface.js';

/**
 * Global guard: every route needs a valid JWT unless marked @Public().
 * On public routes a token is optional: if one is sent and valid, request.user
 * is filled in (so a student browsing jobs still sees "already applied"),
 * otherwise the request continues as an anonymous visitor.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    if (this.isPublic(context)) {
      const request = context.switchToHttp().getRequest<Request>();
      if (!request.headers.authorization) return true;
    }
    return super.canActivate(context);
  }

  handleRequest<TUser = AuthUser>(
    err: unknown,
    user: TUser | false,
    _info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (this.isPublic(context)) {
      // Bad or expired tokens on public routes are ignored, not rejected.
      return (user || undefined) as TUser;
    }
    if (err || !user) {
      throw err instanceof Error
        ? err
        : new UnauthorizedException('Log in to continue');
    }
    return user;
  }

  private isPublic(context: ExecutionContext): boolean {
    return Boolean(
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]),
    );
  }
}
