import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  Gender,
  PreferredJobType,
  StudyLevel,
} from '../../../common/enums/index.js';
import { emptyToNull, trimValue } from '../../../common/utils/text.util.js';

/** Bangladeshi mobile number, with or without +88. */
export const BD_MOBILE = /^(\+?88)?01[3-9]\d{8}$/;
/** AIUB student ID, e.g. 22-48123-1. */
export const AIUB_ID = /^\d{2}-\d{5}-\d$/;

/** Step 1 (flyer) fields are required. Step 2 (sheet 1) fields are optional here. */
export class CreateStudentProfileDto {
  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @ApiProperty({ example: 'Rahim Uddin' })
  name: string;

  /** Format XX-XXXXX-X, e.g. 22-48123-1 */
  @Transform(trimValue)
  @Matches(AIUB_ID, { message: 'AIUB ID must look like 22-48123-1' })
  @ApiProperty({ example: '22-48123-1' })
  aiubId: string;

  /** Bangladeshi mobile, e.g. 01712345678 */
  @Transform(trimValue)
  @Matches(BD_MOBILE, { message: 'Enter a valid Bangladeshi mobile number' })
  @ApiProperty({ example: '01812345678' })
  mobileNumber: string;

  @IsEnum(PreferredJobType)
  @ApiProperty({ example: 'full_time' })
  preferredJobType: PreferredJobType;

  @IsEnum(StudyLevel)
  @ApiProperty({ example: 'graduated' })
  studyLevel: StudyLevel;

  /** Preferred company or industry types, e.g. ["Software", "Banking"] */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(120, { each: true })
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((v) => (typeof v === 'string' ? v.trim() : v))
      : value,
  )
  @ApiProperty({ example: ['Software', 'Telecom'] })
  preferredIndustryTypes: string[];

  /** "Which seminar participation?" Yes or No */
  @IsBoolean()
  @ApiProperty({ example: true })
  seminarParticipation: boolean;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(300)
  @ApiPropertyOptional({ example: 'House 12, Road 5, Kuril, Dhaka' })
  address?: string | null;

  @IsOptional()
  @IsEnum(Gender)
  @ApiPropertyOptional({ example: 'male' })
  gender?: Gender | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(3000)
  @ApiPropertyOptional({
    example: 'Member of AIUB Computer Club; volunteer at a coding bootcamp',
  })
  extracurricularActivities?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsUrl({ require_protocol: true }, { message: 'LinkedIn must be a full URL' })
  @MaxLength(255)
  @ApiPropertyOptional({ example: 'https://www.linkedin.com/in/rahim-uddin' })
  linkedinUrl?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsUrl({ require_protocol: true }, { message: 'GitHub must be a full URL' })
  @MaxLength(255)
  @ApiPropertyOptional({ example: 'https://github.com/rahim-uddin' })
  githubUrl?: string | null;
}

/** Any subset of profile fields. Optional fields can be cleared with null. */
export class UpdateStudentProfileDto extends PartialType(
  CreateStudentProfileDto,
) {}

/** Fields that must never be set to null on update. */
export const REQUIRED_PROFILE_FIELDS = [
  'name',
  'aiubId',
  'mobileNumber',
  'preferredJobType',
  'studyLevel',
  'preferredIndustryTypes',
  'seminarParticipation',
] as const;
