import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public } from '../../common/decorators/index.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { AuthService } from './auth.service.js';
import {
  AuthResponseDto,
  AuthUserDto,
  LoginDto,
  RegisterDto,
} from './dto/index.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register/student')
  registerStudent(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.registerStudent(dto);
  }

  @Public()
  @Post('register/employer')
  registerEmployer(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.registerEmployer(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<AuthUserDto> {
    return this.authService.me(user);
  }
}
