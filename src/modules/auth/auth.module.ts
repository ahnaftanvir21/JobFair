import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlumniModule } from '../alumni/alumni.module.js';
import { EmployersModule } from '../employers/employers.module.js';
import { StudentsModule } from '../students/students.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { EmailVerificationService } from './email-verification.service.js';
import { EmailVerification } from './entities/email-verification.entity.js';
import { PasswordReset } from './entities/password-reset.entity.js';
import { SignupEmailCode } from './entities/signup-email-code.entity.js';
import { PasswordResetService } from './password-reset.service.js';
import { SignupEmailService } from './signup-email.service.js';
import { UnverifiedCleanupService } from './unverified-cleanup.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([PasswordReset, EmailVerification, SignupEmailCode]),
    UsersModule,
    StudentsModule,
    EmployersModule,
    UploadsModule,
    AlumniModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.getOrThrow<string>('auth.jwtSecret'),
        signOptions: {
          // Accepts values like "1d" or "12h".
          expiresIn: config.getOrThrow<string>('auth.jwtExpiresIn') as never,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordResetService,
    EmailVerificationService,
    SignupEmailService,
    UnverifiedCleanupService,
    JwtStrategy,
  ],
  exports: [AuthService],
})
export class AuthModule {}
