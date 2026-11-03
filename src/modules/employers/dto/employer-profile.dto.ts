import { PartialType } from '@nestjs/swagger';
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
  companyName: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsUrl({ require_protocol: true }, { message: 'Website must be a full URL' })
  @MaxLength(255)
  websiteUrl?: string | null;

  /** e.g. Software, Banking, Telecom */
  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  industryType: string;

  /** About this company / short intro */
  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  about: string;

  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  hrName: string;

  @Transform(trimValue)
  @IsEmail()
  @MaxLength(255)
  hrEmail: string;

  @Transform(trimValue)
  @Matches(BD_MOBILE, { message: 'Enter a valid Bangladeshi mobile number' })
  hrMobileNumber: string;

  /** "Any ongoing hiring?" Defaults to true. */
  @IsOptional()
  @IsBoolean()
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
