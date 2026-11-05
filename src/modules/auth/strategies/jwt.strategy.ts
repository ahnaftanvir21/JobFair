import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type {
  AuthUser,
  JwtPayload,
} from '../../../common/interfaces/auth-user.interface.js';
import { UsersService } from '../../users/users.service.js';

/** Reads the "Authorization: Bearer TOKEN" header and turns it into request.user. */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('auth.jwtSecret'),
    });
  }

  /**
   * Rejects tokens of deleted accounts, and tokens issued before the last
   * password reset (so a reset logs out every device).
   */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.usersService.findByIdForAuth(payload.sub);
    if (!user) throw new UnauthorizedException('Log in to continue');
    if ((payload.tv ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException(
        'Your password was changed. Log in again.',
      );
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
    };
  }
}
