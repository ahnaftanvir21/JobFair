import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../../../common/enums/index.js';
import { UsersService } from '../../users/users.service.js';
import { JwtStrategy } from './jwt.strategy.js';

function makeStrategy(user: object | null) {
  const config = { getOrThrow: () => 'secret' } as unknown as ConfigService;
  const users = {
    findByIdForAuth: async () => user,
  } as unknown as UsersService;
  return new JwtStrategy(config, users);
}

const base = {
  id: 'u1',
  email: 'a@b.com',
  role: UserRole.STUDENT,
  emailVerified: true,
};
const payload = (tv?: number) => ({
  sub: 'u1',
  email: 'a@b.com',
  role: UserRole.STUDENT,
  tv,
});

describe('JwtStrategy', () => {
  it('accepts a token with the current version', async () => {
    const s = makeStrategy({ ...base, tokenVersion: 0 });
    await expect(s.validate(payload(0))).resolves.toEqual(base);
  });

  it('treats tokens issued before versions existed as version 0', async () => {
    const s = makeStrategy({ ...base, tokenVersion: 0 });
    await expect(s.validate(payload())).resolves.toEqual(base);
  });

  it('rejects a token issued before the password was reset', async () => {
    const s = makeStrategy({ ...base, tokenVersion: 1 });
    await expect(s.validate(payload(0))).rejects.toThrow(
      new UnauthorizedException('Your password was changed. Log in again.'),
    );
  });

  it('rejects a token for a deleted account', async () => {
    await expect(makeStrategy(null).validate(payload(0))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
