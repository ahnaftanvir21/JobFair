import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcryptjs';
import { UserRole } from '../../common/enums/index.js';
import { FairService } from '../../common/fair/fair.service.js';
import { User } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

const FUTURE = new Date('2099-01-01');
const PAST = new Date('2000-01-01');

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    'auth.bcryptRounds': 4,
    'fair.studentRegistrationDeadline': FUTURE,
    'fair.employerRegistrationDeadline': FUTURE,
    ...overrides,
  };
  const get = (key: string) => values[key];
  return {
    get,
    getOrThrow: (key: string) => {
      if (!(key in values)) throw new Error(`missing config ${key}`);
      return values[key];
    },
  } as unknown as ConfigService;
}

function makeUser(partial: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'student@example.com',
    passwordHash: '',
    role: UserRole.STUDENT,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe('AuthService', () => {
  let users: {
    emailExists: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findByEmailWithPassword: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
  };
  const jwt = new JwtService({ secret: 'test-secret' });

  function makeService(config = makeConfig()) {
    return new AuthService(
      users as unknown as UsersService,
      jwt,
      config,
      new FairService(config),
    );
  }

  beforeEach(() => {
    users = {
      emailExists: vi.fn().mockResolvedValue(false),
      create: vi.fn(async (data: Partial<User>) =>
        makeUser({ email: data.email, role: data.role }),
      ),
      findByEmailWithPassword: vi.fn(),
      findById: vi.fn(),
    };
  });

  describe('register', () => {
    it('creates a student, hashes the password and returns a token', async () => {
      const res = await makeService().registerStudent({
        email: 'student@example.com',
        password: 'secret123',
      });

      const saved = users.create.mock.calls[0][0];
      expect(saved.role).toBe(UserRole.STUDENT);
      expect(saved.passwordHash).not.toBe('secret123');
      expect(saved.passwordHash).toMatch(/^\$2[aby]\$/);

      expect(res.user).toEqual({
        id: 'user-1',
        email: 'student@example.com',
        role: UserRole.STUDENT,
      });
      const payload = jwt.verify(res.accessToken);
      expect(payload).toMatchObject({ sub: 'user-1', role: 'student' });
    });

    it('creates an employer with the employer role', async () => {
      await makeService().registerEmployer({
        email: 'hr@company.com',
        password: 'secret123',
      });
      expect(users.create.mock.calls[0][0].role).toBe(UserRole.EMPLOYER);
    });

    it('rejects an email that is already registered', async () => {
      users.emailExists.mockResolvedValue(true);
      await expect(
        makeService().registerStudent({
          email: 'student@example.com',
          password: 'secret123',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(users.create).not.toHaveBeenCalled();
    });

    it('turns a database unique violation into a conflict', async () => {
      users.create.mockRejectedValue({ code: '23505' });
      await expect(
        makeService().registerStudent({
          email: 'student@example.com',
          password: 'secret123',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('blocks student registration after the student deadline', async () => {
      const service = makeService(
        makeConfig({ 'fair.studentRegistrationDeadline': PAST }),
      );
      await expect(
        service.registerStudent({
          email: 'student@example.com',
          password: 'secret123',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      // Employers have their own, later deadline.
      await expect(
        service.registerEmployer({
          email: 'hr@company.com',
          password: 'secret123',
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('login', () => {
    it('returns a token for the right password', async () => {
      users.findByEmailWithPassword.mockResolvedValue(
        makeUser({ passwordHash: await hash('secret123', 4) }),
      );
      const res = await makeService().login({
        email: 'student@example.com',
        password: 'secret123',
      });
      expect(res.accessToken).toBeTruthy();
      expect(res.user).not.toHaveProperty('passwordHash');
    });

    it('rejects a wrong password', async () => {
      users.findByEmailWithPassword.mockResolvedValue(
        makeUser({ passwordHash: await hash('secret123', 4) }),
      );
      await expect(
        makeService().login({
          email: 'student@example.com',
          password: 'wrongpass',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an unknown email with the same error', async () => {
      users.findByEmailWithPassword.mockResolvedValue(null);
      await expect(
        makeService().login({ email: 'nobody@example.com', password: 'x' }),
      ).rejects.toThrow('Invalid email or password');
    });
  });

  describe('me', () => {
    it('rejects a token whose account was deleted', async () => {
      users.findById.mockResolvedValue(null);
      await expect(
        makeService().me({
          id: 'gone',
          email: 'a@b.com',
          role: UserRole.STUDENT,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
