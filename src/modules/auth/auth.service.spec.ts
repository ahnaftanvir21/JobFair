import { EmailVerificationService } from './email-verification.service.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcryptjs';
import { DataSource } from 'typeorm';
import {
  EducationLevel,
  Gender,
  PreferredJobType,
  StudyLevel,
  UserRole,
} from '../../common/enums/index.js';
import { FairService } from '../../common/fair/fair.service.js';
import { EmployersService } from '../employers/employers.service.js';
import { StudentsService } from '../students/students.service.js';
import { User } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import type {
  RegisterAlumniDto,
  RegisterEmployerDto,
  RegisterStudentDto,
} from './dto/index.js';
import type { AlumniService } from '../alumni/alumni.service.js';
import type { CurrentStudentListService } from '../alumni/current-student-list.service.js';
import type { SignupEmailService } from './signup-email.service.js';

const PAST = new Date('2000-01-01');

const studentDto: RegisterStudentDto = {
  email: '22-48123-1@student.aiub.edu',
  password: 'secret123',
  name: 'Rahim Uddin',
  aiubId: '22-48123-1',
  mobileNumber: '01812345678',
  preferredJobType: PreferredJobType.FULL_TIME,
  studyLevel: StudyLevel.GRADUATED,
  program: 'Bachelor of Science in Computer Science and Engineering',
  faculty: 'Faculty of Science and Technology',
  preferredIndustryTypes: ['Software'],
  seminarParticipation: true,
  address: 'Dhaka',
  gender: Gender.MALE,
  educations: [{ level: EducationLevel.BSC, institutionName: 'AIUB' }],
};

const employerDto: RegisterEmployerDto = {
  email: 'hr@company.com',
  password: 'secret123',
  companyName: 'Acme',
  industryType: 'Software',
  about: 'We build things',
  hrName: 'Hasan',
  hrEmail: 'hr@company.com',
  hrMobileNumber: '01712345678',
};

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    'auth.bcryptRounds': 4,
    'fair.studentRegistrationDeadline': null,
    'fair.employerRegistrationDeadline': null,
    ...overrides,
  };
  return {
    get: (key: string) => values[key],
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
    tokenVersion: 0,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe('AuthService', () => {
  const manager = { name: 'transaction-manager' };
  const jwt = new JwtService({ secret: 'test-secret' });
  let users: {
    emailExists: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findByEmailWithPassword: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
  };
  let students: {
    createForUser: ReturnType<typeof vi.fn>;
    getOwnProfile: ReturnType<typeof vi.fn>;
  };
  let employers: {
    createForUser: ReturnType<typeof vi.fn>;
    getOwn: ReturnType<typeof vi.fn>;
  };
  let verification: { required: boolean; start: ReturnType<typeof vi.fn> };
  let signupEmail: { consumeToken: ReturnType<typeof vi.fn> };
  let alumni: { check: ReturnType<typeof vi.fn> };
  let currentList: { find: ReturnType<typeof vi.fn> };

  function makeService(config = makeConfig()) {
    const dataSource = {
      transaction: (work: (m: unknown) => Promise<unknown>) => work(manager),
    } as unknown as DataSource;
    return new AuthService(
      users as unknown as UsersService,
      jwt,
      config,
      new FairService(config),
      dataSource,
      students as unknown as StudentsService,
      employers as unknown as EmployersService,
      verification as unknown as EmailVerificationService,
      signupEmail as unknown as SignupEmailService,
      alumni as unknown as AlumniService,
      currentList as unknown as CurrentStudentListService,
    );
  }

  beforeEach(() => {
    users = {
      emailExists: vi.fn().mockResolvedValue(false),
      create: vi.fn(async (data: Partial<User>) =>
        makeUser({
          email: data.email,
          role: data.role,
          emailVerified: data.emailVerified,
        }),
      ),
      findByEmailWithPassword: vi.fn(),
      findById: vi.fn(),
    };
    students = {
      createForUser: vi.fn().mockResolvedValue(undefined),
      getOwnProfile: vi.fn().mockResolvedValue({ id: 'profile-1' }),
    };
    employers = {
      createForUser: vi.fn().mockResolvedValue(undefined),
      getOwn: vi.fn().mockResolvedValue({ id: 'company-1' }),
    };
    verification = { required: true, start: vi.fn().mockResolvedValue(undefined) };
    signupEmail = { consumeToken: vi.fn().mockResolvedValue(undefined) };
    currentList = { find: vi.fn().mockResolvedValue(null) };
    alumni = {
      check: vi.fn().mockResolvedValue({
        message: 'ok',
        name: 'RAHIM UDDIN',
        program: 'Bachelor of Business Administration',
        faculty: 'Faculty of Business Administration',
        convocation: '10th Convocation',
      }),
    };
  });

  describe('email verification on registration', () => {
    it('saves new accounts as unverified and emails a code', async () => {
      const res = await makeService().registerStudent(studentDto);
      expect(users.create.mock.calls[0][0].emailVerified).toBe(false);
      expect(res.user.emailVerified).toBe(false);
      expect(verification.start).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-1' }),
      );
    });

    it('skips the check when REQUIRE_EMAIL_VERIFICATION is false', async () => {
      verification.required = false;
      const res = await makeService().registerStudent(studentDto);
      expect(users.create.mock.calls[0][0].emailVerified).toBe(true);
      expect(res.user.emailVerified).toBe(true);
      expect(verification.start).not.toHaveBeenCalled();
    });

    it('sends no code when registration fails', async () => {
      users.emailExists.mockResolvedValue(true);
      await expect(
        makeService().registerStudent(studentDto),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(verification.start).not.toHaveBeenCalled();
    });
  });

  describe('registerStudent', () => {
    it('creates account and profile in one transaction and returns both', async () => {
      const res = await makeService().registerStudent(studentDto);

      const [userData, userManager] = users.create.mock.calls[0];
      expect(userData.role).toBe(UserRole.STUDENT);
      expect(userData.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(userManager).toBe(manager);

      const [profileManager, userId, profile] =
        students.createForUser.mock.calls[0];
      expect(profileManager).toBe(manager);
      expect(userId).toBe('user-1');
      expect(profile).not.toHaveProperty('password');
      expect(profile).not.toHaveProperty('email');
      expect(profile.aiubId).toBe('22-48123-1');
      expect(profile.educations).toHaveLength(1);

      expect(res.profile).toEqual({ id: 'profile-1' });
      expect(jwt.verify(res.accessToken)).toMatchObject({
        sub: 'user-1',
        role: 'student',
      });
    });

    it('rejects an email that is already registered', async () => {
      users.emailExists.mockResolvedValue(true);
      await expect(
        makeService().registerStudent(studentDto),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(users.create).not.toHaveBeenCalled();
    });

    it('passes on profile errors so the transaction rolls back', async () => {
      students.createForUser.mockRejectedValue(
        new ConflictException('This AIUB ID is already registered'),
      );
      await expect(makeService().registerStudent(studentDto)).rejects.toThrow(
        'This AIUB ID is already registered',
      );
    });

    it('names the AIUB ID when the database reports it as taken', async () => {
      students.createForUser.mockRejectedValue({
        code: '23505',
        detail: 'Key (aiub_id)=(22-48123-1) already exists.',
      });
      await expect(makeService().registerStudent(studentDto)).rejects.toThrow(
        'This AIUB ID is already registered',
      );
    });

    it('names the email when the database reports it as taken', async () => {
      users.create.mockRejectedValue({
        code: '23505',
        detail: 'Key (email)=(22-48123-1@student.aiub.edu) already exists.',
      });
      await expect(makeService().registerStudent(studentDto)).rejects.toThrow(
        'An account with this email already exists',
      );
    });

    it('rejects an AIUB ID that differs from the student email', async () => {
      await expect(
        makeService().registerStudent({ ...studentDto, aiubId: '22-48123-2' }),
      ).rejects.toThrow('Your AIUB ID must match your student email');
      expect(users.create).not.toHaveBeenCalled();
    });

    it('is blocked when a student cutoff is set and has passed', async () => {
      const service = makeService(
        makeConfig({ 'fair.studentRegistrationDeadline': PAST }),
      );
      await expect(service.registerStudent(studentDto)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      // Employers have their own cutoff.
      await expect(
        service.registerEmployer(employerDto),
      ).resolves.toBeDefined();
    });
  });

  describe('current student list', () => {
    it('uses the list program and faculty and locks them', async () => {
      currentList.find.mockResolvedValue({
        aiubId: '22-48123-1',
        name: 'RAHIM UDDIN',
        program: 'Bachelor of Business Administration',
        faculty: 'Faculty of Business Administration',
      });
      await makeService().registerStudent(studentDto);
      expect(currentList.find).toHaveBeenCalledWith('22-48123-1');
      expect(students.createForUser.mock.calls[0][2]).toMatchObject({
        program: 'Bachelor of Business Administration',
        faculty: 'Faculty of Business Administration',
        academicsFromList: true,
      });
    });

    it('lets a student who is not on the list pick program and faculty', async () => {
      await makeService().registerStudent(studentDto);
      expect(students.createForUser.mock.calls[0][2]).toMatchObject({
        program: studentDto.program,
        faculty: studentDto.faculty,
        academicsFromList: false,
      });
    });

    it('asks for program and faculty when the ID is not on the list', async () => {
      const { program: _p, faculty: _f, ...rest } = studentDto;
      await expect(
        makeService().registerStudent(rest as RegisterStudentDto),
      ).rejects.toThrow('Enter your program');
      expect(users.create).not.toHaveBeenCalled();
    });
  });

  describe('registerAlumni', () => {
    const {
      studyLevel: _level,
      program: _program,
      faculty: _faculty,
      ...rest
    } = studentDto;
    const alumniDto: RegisterAlumniDto = {
      ...rest,
      email: 'rahim.uddin@gmail.com',
      registrationNumber: '22-36918-02',
      emailToken: 'a'.repeat(64),
    };

    it('checks the alumni list, then saves a verified graduated alumni profile', async () => {
      const res = await makeService().registerAlumni(alumniDto);
      expect(alumni.check).toHaveBeenCalledWith('22-48123-1', '22-36918-02');
      expect(signupEmail.consumeToken).toHaveBeenCalledWith(
        'rahim.uddin@gmail.com',
        'a'.repeat(64),
        manager,
      );
      expect(users.create.mock.calls[0][0]).toMatchObject({
        email: 'rahim.uddin@gmail.com',
        role: UserRole.STUDENT,
        emailVerified: true,
      });
      const profile = students.createForUser.mock.calls[0][2];
      // Name as typed; program and faculty from the list.
      expect(profile).toMatchObject({
        name: 'Rahim Uddin',
        aiubId: '22-48123-1',
        program: 'Bachelor of Business Administration',
        faculty: 'Faculty of Business Administration',
        studyLevel: StudyLevel.GRADUATED,
        isAlumni: true,
      });
      expect(profile).not.toHaveProperty('registrationNumber');
      expect(profile).not.toHaveProperty('emailToken');
      expect(verification.start).not.toHaveBeenCalled();
      expect(res.user.emailVerified).toBe(true);
    });

    it('creates nothing when the details are not on the alumni list', async () => {
      alumni.check.mockRejectedValue(new BadRequestException('no match'));
      await expect(makeService().registerAlumni(alumniDto)).rejects.toThrow(
        'no match',
      );
      expect(users.create).not.toHaveBeenCalled();
    });

    it('is blocked when the student cutoff has passed', async () => {
      const config = makeConfig({ 'fair.studentRegistrationDeadline': PAST });
      await expect(
        makeService(config).registerAlumni(alumniDto),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(alumni.check).not.toHaveBeenCalled();
    });
  });

  describe('registerEmployer', () => {
    it('creates account and company profile together', async () => {
      const res = await makeService().registerEmployer(employerDto);
      expect(users.create.mock.calls[0][0].role).toBe(UserRole.EMPLOYER);
      const [profileManager, , profile] = employers.createForUser.mock.calls[0];
      expect(profileManager).toBe(manager);
      expect(profile.companyName).toBe('Acme');
      expect(profile).not.toHaveProperty('password');
      expect(res.profile).toEqual({ id: 'company-1' });
    });

    it('rejects an AIUB student email', async () => {
      await expect(
        makeService().registerEmployer({
          ...employerDto,
          email: '22-48123-1@student.aiub.edu',
        }),
      ).rejects.toThrow('Student emails cannot register a company');
      expect(users.create).not.toHaveBeenCalled();
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
          emailVerified: true,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
