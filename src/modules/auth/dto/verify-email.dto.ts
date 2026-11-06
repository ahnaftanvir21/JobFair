import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { AuthUserDto } from './auth-response.dto.js';

/**
 * Verify with the 6-digit code (needs the login token) or with the token from
 * the email link (works without logging in).
 */
export class VerifyEmailDto {
  @ValidateIf((dto: VerifyEmailDto) => dto.token === undefined)
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Code must be the 6 digits from the email' })
  @ApiPropertyOptional({
    example: '123456',
    description:
      '6-digit code from the email. Needs the login token. Use either code or token.',
  })
  code?: string;

  @ValidateIf((dto: VerifyEmailDto) => dto.token !== undefined)
  @IsString()
  @Matches(/^[a-f0-9]{64}$/, { message: 'Verification link is invalid' })
  @ApiPropertyOptional({
    description:
      'The token from the email link (?token=...). Use instead of code.',
  })
  token?: string;
}

export class VerifyEmailResponseDto {
  @ApiProperty()
  message: string;

  @ApiPropertyOptional({
    type: AuthUserDto,
    description: 'Returned when verifying with a code.',
  })
  user?: AuthUserDto;
}

const lowerTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Step 1 of company sign-up: email the code before the account exists. */
export class SignupCodeDto {
  @Transform(lowerTrim)
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(255)
  @ApiProperty({ example: 'hr@acme-software.com' })
  email: string;
}

export class CheckSignupCodeDto extends SignupCodeDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Code must be the 6 digits from the email' })
  @ApiProperty({ example: '123456' })
  code: string;
}

export class SignupCodeResponseDto {
  @ApiProperty()
  message: string;

  @ApiProperty({
    description:
      'Send it as emailToken when registering (same email). Works once, for 2 hours.',
  })
  emailToken: string;
}
