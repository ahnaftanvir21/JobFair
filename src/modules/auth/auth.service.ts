import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { UserRole } from '../../common/enums/index.js';
import { FairService } from '../../common/fair/fair.service.js';
import type {
  AuthUser,
  JwtPayload,
} from '../../common/interfaces/auth-user.interface.js';
import { User } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import {
  AuthResponseDto,
  AuthUserDto,
  LoginDto,
  RegisterDto,
} from './dto/index.js';

/** Postgres error code for a unique-constraint violation. */
const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly fair: FairService,
  ) {}

  registerStudent(dto: RegisterDto): Promise<AuthResponseDto> {
    return this.register(dto, UserRole.STUDENT);
  }

  registerEmployer(dto: RegisterDto): Promise<AuthResponseDto> {
    return this.register(dto, UserRole.EMPLOYER);
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

  private async register(
    dto: RegisterDto,
    role: UserRole,
  ): Promise<AuthResponseDto> {
    this.assertRegistrationOpen(role);

    if (await this.usersService.emailExists(dto.email)) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await hash(
      dto.password,
      this.config.getOrThrow<number>('auth.bcryptRounds'),
    );

    try {
      const user = await this.usersService.create({
        email: dto.email,
        passwordHash,
        role,
      });
      return this.buildResponse(user);
    } catch (err) {
      // Two requests with the same email at the same moment.
      if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw err;
    }
  }

  private assertRegistrationOpen(role: UserRole): void {
    if (role === UserRole.STUDENT) {
      this.fair.assertStudentWindowOpen('Student registration');
    } else {
      this.fair.assertEmployerWindowOpen('Employer registration');
    }
  }

  private async buildResponse(user: User): Promise<AuthResponseDto> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
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
