import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AllowPendingEmployer,
  CurrentUser,
  Public,
} from '../../common/decorators/index.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import {
  AuthService,
  type EmployerRegistrationResponse,
  type StudentRegistrationResponse,
} from './auth.service.js';
import { PasswordResetService } from './password-reset.service.js';
import {
  AuthResponseDto,
  AuthUserDto,
  ForgotPasswordDto,
  LoginDto,
  MessageResponseDto,
  ResetPasswordDto,
  RegisterEmployerDto,
  RegisterStudentDto,
} from './dto/index.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  @Public()
  @Post('register/student')
  @ApiOperation({
    summary: 'Register a student with the full profile',
    description:
      'Creates the account, profile, education, experience and references in one go. ' +
      'Upload the picture and CV afterwards with the returned token.',
  })
  registerStudent(
    @Body() dto: RegisterStudentDto,
  ): Promise<StudentRegistrationResponse> {
    return this.authService.registerStudent(dto);
  }

  @Public()
  @Post('register/employer')
  @ApiOperation({
    summary: 'Register an employer with the full company profile',
    description: 'Upload the logo afterwards with the returned token.',
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

  @Get('me')
  @AllowPendingEmployer()
  me(@CurrentUser() user: AuthUser): Promise<AuthUserDto> {
    return this.authService.me(user);
  }
}
