import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { DataSource, EntityManager } from 'typeorm';
import { StudyLevel, UserRole } from '../../common/enums/index.js';
import { AlumniService } from '../alumni/alumni.service.js';
import { CurrentStudentListService } from '../alumni/current-student-list.service.js';
import { FairService } from '../../common/fair/fair.service.js';
import type {
  AuthUser,
  JwtPayload,
} from '../../common/interfaces/auth-user.interface.js';
import { EmployerProfile } from '../employers/entities/employer-profile.entity.js';
import { EmployersService } from '../employers/employers.service.js';
import { EmailVerificationService } from './email-verification.service.js';
import {
  EMAIL_TAKEN_MESSAGE,
  SignupEmailService,
} from './signup-email.service.js';
import {
  StudentsService,
  type StudentProfileView,
} from '../students/students.service.js';
import { User } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import {
  AuthResponseDto,
  AuthUserDto,
  LoginDto,
  RegisterAlumniDto,
  RegisterEmployerDto,
  RegisterStudentDto,
} from './dto/index.js';

/** Postgres error code for a unique-constraint violation. */
const PG_UNIQUE_VIOLATION = '23505';

export type StudentRegistrationResponse = AuthResponseDto & {
  profile: StudentProfileView;
};
export type EmployerRegistrationResponse = AuthResponseDto & {
  profile: EmployerProfile;
};

export interface CurrentStudentLookup {
  /** False: not on the list; the student picks program and faculty. */
  found: boolean;
  name: string | null;
  program: string | null;
  faculty: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly fair: FairService,
    private readonly dataSource: DataSource,
    private readonly studentsService: StudentsService,
    private readonly employersService: EmployersService,
    private readonly emailVerification: EmailVerificationService,
    private readonly signupEmail: SignupEmailService,
    private readonly alumni: AlumniService,
    private readonly currentList: CurrentStudentListService,
  ) {}

  /** Creates the student account and full profile together. */
  async registerStudent(
    dto: RegisterStudentDto,
  ): Promise<StudentRegistrationResponse> {
    this.fair.assertStudentWindowOpen('Student registration');
    const { email, password, emailToken, ...profile } = dto;
    if (email.split('@')[0] !== profile.aiubId) {
      throw new BadRequestException(
        'Your AIUB ID must match your student email (the part before @)',
      );
    }
    // On the current student list: program and faculty come from the list and are locked.
    const listed = await this.currentList.find(profile.aiubId);
    const fromList = !!(listed && (listed.program || listed.faculty));
    const program = (fromList && listed?.program) || profile.program?.trim() || null;
    const faculty = (fromList && listed?.faculty) || profile.faculty || null;
    if (!program) throw new BadRequestException('Enter your program');
    if (!faculty) throw new BadRequestException('Choose your AIUB faculty');
    const user = await this.createAccount(
      email,
      password,
      emailToken,
      UserRole.STUDENT,
      (manager, userId) =>
        this.studentsService.createForUser(manager, userId, {
          ...profile,
          program,
          faculty,
          academicsFromList: fromList,
        }),
    );
    return {
      ...(await this.buildResponse(user)),
      profile: await this.studentsService.getOwnProfile(user.id),
    };
  }

  /**
   * Creates an alumni account: any email (already checked with a code), and an
   * AIUB ID plus registration number that match the alumni list.
   */
  async registerAlumni(
    dto: RegisterAlumniDto,
  ): Promise<StudentRegistrationResponse> {
    this.fair.assertStudentWindowOpen('Student registration');
    const { email, password, emailToken, registrationNumber, ...profile } = dto;
    // Also counts wrong numbers. The unique AIUB ID stops a second account.
    const listed = await this.alumni.check(profile.aiubId, registrationNumber);
    const user = await this.createAccount(
      email,
      password,
      emailToken,
      UserRole.STUDENT,
      (manager, userId) =>
        this.studentsService.createForUser(manager, userId, {
          ...profile,
          // Name stays as typed (it can be edited); these come from the list.
          program: listed.program,
          faculty: listed.faculty,
          academicsFromList: !!(listed.program || listed.faculty),
          studyLevel: StudyLevel.GRADUATED,
          isAlumni: true,
        }),
    );
    return {
      ...(await this.buildResponse(user)),
      profile: await this.studentsService.getOwnProfile(user.id),
    };
  }

  /**
   * Current student sign-up, after the AIUB email is verified: what the
   * current student list has for this ID. The email token is checked, not used up.
   */
  async lookupCurrentStudent(
    email: string,
    emailToken: string,
  ): Promise<CurrentStudentLookup> {
    await this.signupEmail.assertToken(email, emailToken);
    const record = await this.currentList.find(email.split('@')[0]);
    return {
      found: !!record,
      name: record?.name ?? null,
      program: record?.program ?? null,
      faculty: record?.faculty ?? null,
    };
  }

  /** Creates the employer account and company profile together. */
  async registerEmployer(
    dto: RegisterEmployerDto,
  ): Promise<EmployerRegistrationResponse> {
    this.fair.assertEmployerWindowOpen('Employer registration');
    const { email, password, emailToken, ...profile } = dto;
    if (email.endsWith('@student.aiub.edu')) {
      throw new BadRequestException(
        'Student emails cannot register a company. Use your company email.',
      );
    }
    const user = await this.createAccount(
      email,
      password,
      emailToken,
      UserRole.EMPLOYER,
      (manager, userId) =>
        this.employersService.createForUser(manager, userId, profile),
    );
    return {
      ...(await this.buildResponse(user)),
      profile: await this.employersService.getOwn(user.id),
    };
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmailWithPassword(dto.email);
    // Same message for unknown email and wrong password, so emails cannot be probed.
    if (!user || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.buildResponse(user);
  }

  async me(authUser: AuthUser): Promise<AuthUserDto> {
    const user = await this.usersService.findById(authUser.id);
    if (!user) throw new UnauthorizedException('Account no longer exists');
    return this.toUserDto(user);
  }

  /**
   * Saves the user and the profile in one transaction.
   * If the profile fails (bad data, AIUB ID taken), the account is not created either.
   * With an email token (email checked before registering) the account starts verified.
   */
  private async createAccount(
    email: string,
    password: string,
    emailToken: string | undefined,
    role: UserRole,
    createProfile: (manager: EntityManager, userId: string) => Promise<void>,
  ): Promise<User> {
    if (await this.usersService.emailExists(email)) {
      throw new ConflictException(EMAIL_TAKEN_MESSAGE);
    }
    const passwordHash = await hash(
      password,
      this.config.getOrThrow<number>('auth.bcryptRounds'),
    );
    const mustVerify = this.emailVerification.required && !emailToken;

    let user: User;
    try {
      user = await this.dataSource.transaction(async (manager) => {
        if (emailToken) {
          await this.signupEmail.consumeToken(email, emailToken, manager);
        }
        const created = await this.usersService.create(
          { email, passwordHash, role, emailVerified: !mustVerify },
          manager,
        );
        await createProfile(manager, created.id);
        return created;
      });
    } catch (err) {
      // Two requests with the same email or AIUB ID at the same moment.
      if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        const detail = (err as { detail?: string }).detail ?? '';
        throw new ConflictException(
          detail.includes('aiub_id')
            ? 'This AIUB ID is already registered'
            : 'An account with this email already exists',
        );
      }
      throw err;
    }
    // Send the code once the account is saved.
    if (mustVerify) await this.emailVerification.start(user);
    return user;
  }

  private async buildResponse(user: User): Promise<AuthResponseDto> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tv: user.tokenVersion ?? 0,
    };
    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: this.toUserDto(user),
    };
  }

  private toUserDto(user: User): AuthUserDto {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
    };
  }
}
