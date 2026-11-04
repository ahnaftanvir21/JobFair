import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';
import { emptyToNull, trimValue } from '../../../common/utils/text.util.js';
import { BD_MOBILE } from '../../students/dto/student-profile.dto.js';

export class CreateEmployerProfileDto {
  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @ApiProperty({ example: 'Acme Software Ltd.' })
  companyName: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsUrl({ require_protocol: true }, { message: 'Website must be a full URL' })
  @MaxLength(255)
  @ApiPropertyOptional({ example: 'https://www.acme-software.com' })
  websiteUrl?: string | null;

  /** e.g. Software, Banking, Telecom */
  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @ApiProperty({ example: 'Software' })
  industryType: string;

  /** About this company / short intro */
  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  @ApiProperty({
    example:
      'Acme builds banking and e-commerce software for clients in Bangladesh and abroad.',
  })
  about: string;

  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @ApiProperty({ example: 'Hasan Mahmud' })
  hrName: string;

  @Transform(trimValue)
  @IsEmail()
  @MaxLength(255)
  @ApiProperty({ example: 'hr@acme-software.com' })
  hrEmail: string;

  @Transform(trimValue)
  @Matches(BD_MOBILE, { message: 'Enter a valid Bangladeshi mobile number' })
  @ApiProperty({ example: '01712345678' })
  hrMobileNumber: string;

  /** Booth at the fair, for example "B-12". Blank clears it. */
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(20)
  @ApiPropertyOptional({ example: 'B-12' })
  boothNumber?: string | null;

  /** "Any ongoing hiring?" Defaults to true. */
  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ example: true })
  hasOngoingHiring?: boolean;
}

export class UpdateEmployerProfileDto extends PartialType(
  CreateEmployerProfileDto,
) {}

export const REQUIRED_EMPLOYER_FIELDS = [
  'companyName',
  'industryType',
  'about',
  'hrName',
  'hrEmail',
  'hrMobileNumber',
  'hasOngoingHiring',
] as const;
