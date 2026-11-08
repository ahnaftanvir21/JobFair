import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AllowPendingEmployer,
  AllowUnverified,
  CurrentUser,
  OptionalAuth,
  Public,
} from '../../common/decorators/index.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import {
  AuthService,
  type EmployerRegistrationResponse,
  type StudentRegistrationResponse,
} from './auth.service.js';
import { EmailVerificationService } from './email-verification.service.js';
import { PasswordResetService } from './password-reset.service.js';
import { SignupEmailService } from './signup-email.service.js';
import { AlumniService } from '../alumni/alumni.service.js';
import {
  CheckAlumniDto,
  CheckAlumniResponseDto,
} from '../alumni/dto/alumni.dto.js';
import {
  AuthResponseDto,
  AuthUserDto,
  CheckSignupCodeDto,
  ForgotPasswordDto,
  LoginDto,
  MessageResponseDto,
  ResetPasswordDto,
  RegisterAlumniDto,
  RegisterEmployerDto,
  RegisterStudentDto,
  SignupCodeDto,
  SignupCodeResponseDto,
  VerifyEmailDto,
  VerifyEmailResponseDto,
} from './dto/index.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
    private readonly emailVerification: EmailVerificationService,
    private readonly signupEmail: SignupEmailService,
    private readonly alumni: AlumniService,
  ) {}

  @Public()
  @Post('signup-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Before registering: email a 6-digit code to check the address',
    description:
      'Company sign-up uses this right after email and password. At most once a minute per ' +
      'email; a new code replaces the old one. **409** if the email already has an account.',
  })
  sendSignupCode(@Body() dto: SignupCodeDto): Promise<MessageResponseDto> {
    return this.signupEmail.sendCode(dto.email);
  }

  @Public()
  @Post('signup-code/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Before registering: check the code and get an email token',
    description:
      'Send the returned emailToken with POST /auth/register/employer (or student) for the same ' +
      'email; the account then starts verified. The code expires in 30 minutes, the token in 2 hours. ' +
      'After 5 wrong codes, ask for a new one.',
  })
  checkSignupCode(
    @Body() dto: CheckSignupCodeDto,
  ): Promise<SignupCodeResponseDto> {
    return this.signupEmail.checkCode(dto.email, dto.code);
  }

  @Public()
  @Post('register/student')
  @ApiOperation({
    summary: 'Register a student with the full profile',
    description:
      'Creates the account, profile, education, experience and references in one go. ' +
      'Upload the picture and CV afterwards with the returned token. A 6-digit code is ' +
      'emailed; until it is entered (POST /auth/verify-email) the account can only edit its own profile.',
  })
  registerStudent(
    @Body() dto: RegisterStudentDto,
  ): Promise<StudentRegistrationResponse> {
    return this.authService.registerStudent(dto);
  }

  @Public()
  @Post('alumni/check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Alumni sign-up: check the AIUB ID and registration number',
    description:
      'Matches them against the alumni list the fair office uploads and returns the name on the list. ' +
      '**400** if they do not match, **409** if the AIUB ID already has an account, **429** after ' +
      '5 wrong numbers in a row (the ID is locked for 15 minutes).',
  })
  checkAlumni(@Body() dto: CheckAlumniDto): Promise<CheckAlumniResponseDto> {
    return this.alumni.check(dto.aiubId, dto.registrationNumber);
  }

  @Public()
  @Post('register/alumni')
  @ApiOperation({
    summary: 'Register an alumnus with a personal email and the full profile',
    description:
      'Same body as register/student, without studyLevel (always graduated), plus registrationNumber ' +
      'and a required emailToken from POST /auth/signup-code/verify. The AIUB ID and registration ' +
      'number must match the alumni list. The account starts verified.',
  })
  registerAlumni(
    @Body() dto: RegisterAlumniDto,
  ): Promise<StudentRegistrationResponse> {
    return this.authService.registerAlumni(dto);
  }

  @Public()
  @Post('register/employer')
  @ApiOperation({
    summary: 'Register an employer with the full company profile',
    description:
      'Upload the logo afterwards with the returned token. Send emailToken from ' +
      'POST /auth/signup-code/verify and the account starts verified. Without it a 6-digit code ' +
      'is emailed; until it is entered (POST /auth/verify-email) the account can only edit its own ' +
      'profile, and a company that does not verify within 30 minutes is deleted.',
  })
  registerEmployer(
    @Body() dto: RegisterEmployerDto,
  ): Promise<EmployerRegistrationResponse> {
    return this.authService.registerEmployer(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Forgot password: email a 6-digit code and a reset link',
    description:
      'Always returns the same message, whether or not the email has an account. ' +
      'The code and link expire in 15 minutes. A new email is sent at most once a minute; ' +
      'asking again replaces the earlier code. Without SMTP settings in .env, the email is ' +
      'saved in the mail-outbox folder and printed in the server log.',
  })
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<MessageResponseDto> {
    return this.passwordResetService.requestReset(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set a new password with the code or the link token',
    description:
      'Send email + code + newPassword, or token (from the link) + newPassword. ' +
      'After 5 wrong codes, request a new one. On success, all earlier login tokens stop working.',
  })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<MessageResponseDto> {
    return this.passwordResetService.resetPassword(dto);
  }

  @OptionalAuth()
  @AllowUnverified()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm the email with the 6-digit code or the link token',
    description:
      'Send code (with the login token) or token (from the email link, no login needed). ' +
      'The code and link expire in 30 minutes. After 5 wrong codes, ask for a new one.',
  })
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @CurrentUser() user: AuthUser | undefined,
  ): Promise<VerifyEmailResponseDto> {
    if (dto.token) return this.emailVerification.verifyToken(dto.token);
    if (!user) throw new UnauthorizedException('Log in to enter your code');
    return this.emailVerification.verifyCode(user, dto.code!);
  }

  @AllowUnverified()
  @AllowPendingEmployer()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Email a new verification code',
    description: 'At most once a minute. The new code replaces the old one.',
  })
  resendVerification(
    @CurrentUser() user: AuthUser,
  ): Promise<MessageResponseDto> {
    return this.emailVerification.resend(user);
  }

  @AllowUnverified()
  @AllowPendingEmployer()
  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<AuthUserDto> {
    return this.authService.me(user);
  }
}
