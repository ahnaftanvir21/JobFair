import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
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
import { AIUB_FACULTIES } from '../aiub-academics.js';

/** Bangladeshi mobile number, with or without +88. */
export const BD_MOBILE = /^(\+?88)?01[3-9]\d{8}$/;
/** AIUB student ID, e.g. 22-48123-1. */
export const AIUB_ID = /^\d{2}-\d{5}-\d$/;
/** AIUB student email, e.g. 23-54445-3@student.aiub.edu. The part before @ is the AIUB ID. */
export const AIUB_STUDENT_EMAIL = /^(\d{2}-\d{5}-\d)@student\.aiub\.edu$/;

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

  /** AIUB program. Alumni get it from the convocation list instead. */
  @Transform(trimValue)
  @IsString()
  @IsNotEmpty({ message: 'Enter your program' })
  @MaxLength(200)
  @ApiProperty({ example: 'Bachelor of Science in Computer Science and Engineering' })
  program: string;

  @IsIn(AIUB_FACULTIES, { message: 'Choose your AIUB faculty' })
  @ApiProperty({ enum: AIUB_FACULTIES, example: 'Faculty of Science and Technology' })
  faculty: string;

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

  @IsOptional()
  @Transform(emptyToNull)
  @IsUrl({ require_protocol: true }, { message: 'Portfolio must be a full URL' })
  @MaxLength(255)
  @ApiPropertyOptional({ example: 'https://rahim.dev' })
  portfolioUrl?: string | null;
}

/** Any subset of profile fields. Optional fields can be cleared with null. */
/** The AIUB ID is fixed at registration, because it must match the login email. */
export class UpdateStudentProfileDto extends PartialType(
  OmitType(CreateStudentProfileDto, ['aiubId'] as const),
) {}

/** Fields that must never be set to null on update. */
export const REQUIRED_PROFILE_FIELDS = [
  'name',
  'mobileNumber',
  'preferredJobType',
  'studyLevel',
  'program',
  'faculty',
  'preferredIndustryTypes',
  'seminarParticipation',
] as const;
