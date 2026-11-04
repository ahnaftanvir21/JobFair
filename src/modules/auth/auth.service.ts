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
import { UserRole } from '../../common/enums/index.js';
import { FairService } from '../../common/fair/fair.service.js';
import type {
  AuthUser,
  JwtPayload,
} from '../../common/interfaces/auth-user.interface.js';
import { EmployerProfile } from '../employers/entities/employer-profile.entity.js';
import { EmployersService } from '../employers/employers.service.js';
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
  ) {}

  /** Creates the student account and full profile together. */
  async registerStudent(
    dto: RegisterStudentDto,
  ): Promise<StudentRegistrationResponse> {
    this.fair.assertStudentWindowOpen('Student registration');
    const { email, password, ...profile } = dto;
    if (email.split('@')[0] !== profile.aiubId) {
      throw new BadRequestException(
        'Your AIUB ID must match your student email (the part before @)',
      );
    }
    const user = await this.createAccount(
      email,
      password,
      UserRole.STUDENT,
      (manager, userId) =>
        this.studentsService.createForUser(manager, userId, profile),
    );
    return {
      ...(await this.buildResponse(user)),
      profile: await this.studentsService.getOwnProfile(user.id),
    };
  }

  /** Creates the employer account and company profile together. */
  async registerEmployer(
    dto: RegisterEmployerDto,
  ): Promise<EmployerRegistrationResponse> {
    this.fair.assertEmployerWindowOpen('Employer registration');
    const { email, password, ...profile } = dto;
    if (email.endsWith('@student.aiub.edu')) {
      throw new BadRequestException(
        'Student emails cannot register a company. Use your company email.',
      );
    }
    const user = await this.createAccount(
      email,
      password,
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
   */
  private async createAccount(
    email: string,
    password: string,
    role: UserRole,
    createProfile: (manager: EntityManager, userId: string) => Promise<void>,
  ): Promise<User> {
    if (await this.usersService.emailExists(email)) {
      throw new ConflictException('An account with this email already exists');
    }
    const passwordHash = await hash(
      password,
      this.config.getOrThrow<number>('auth.bcryptRounds'),
    );

    try {
      return await this.dataSource.transaction(async (manager) => {
        const user = await this.usersService.create(
          { email, passwordHash, role },
          manager,
        );
        await createProfile(manager, user.id);
        return user;
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
    return { id: user.id, email: user.email, role: user.role };
  }
}
