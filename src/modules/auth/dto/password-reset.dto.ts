import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const toEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class ForgotPasswordDto {
  @Transform(toEmail)
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(255)
  @ApiProperty({ example: 'rahim.uddin@example.com', format: 'email' })
  email: string;
}

/**
 * Reset with the 6-digit code (email + code) or with the token from the
 * email link (token only).
 */
export class ResetPasswordDto {
  @ValidateIf((dto: ResetPasswordDto) => dto.token === undefined)
  @Transform(toEmail)
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(255)
  @ApiPropertyOptional({
    example: 'rahim.uddin@example.com',
    format: 'email',
    description: 'Needed with code. Leave out when using token.',
  })
  email?: string;

  @ValidateIf((dto: ResetPasswordDto) => dto.token === undefined)
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Code must be the 6 digits from the email' })
  @ApiPropertyOptional({
    example: '123456',
    description:
      '6-digit code from the email. Use either email + code, or token.',
  })
  code?: string;

  @ValidateIf((dto: ResetPasswordDto) => dto.token !== undefined)
  @IsString()
  @Matches(/^[a-f0-9]{64}$/, { message: 'Reset link is invalid' })
  @ApiPropertyOptional({
    description:
      'The token from the reset link (?token=...). Use instead of email + code.',
  })
  token?: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  // bcrypt only uses the first 72 bytes.
  @MaxLength(72, { message: 'Password must be at most 72 characters' })
  @ApiProperty({ example: 'newSecret123' })
  newPassword: string;
}

export class MessageResponseDto {
  @ApiProperty()
  message: string;
}
