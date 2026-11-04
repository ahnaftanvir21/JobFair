import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ExperienceJobType } from '../../../common/enums/index.js';
import { emptyToNull, trimValue } from '../../../common/utils/text.util.js';

export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class CreateExperienceDto {
  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @ApiProperty({ example: 'Brain Station 23' })
  companyName: string;

  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @ApiProperty({ example: 'Software' })
  industryType: string;

  @IsEnum(ExperienceJobType)
  @ApiProperty({ example: 'internship' })
  jobType: ExperienceJobType;

  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @ApiProperty({ example: 'Software Engineer Intern' })
  designation: string;

  /** YYYY-MM-DD */
  @Matches(DATE_ONLY, { message: 'startDate must be YYYY-MM-DD' })
  @IsDateString({ strict: true })
  @ApiProperty({ example: '2025-06-01' })
  startDate: string;

  /** YYYY-MM-DD. Leave empty or null when the job is continuing. */
  @IsOptional()
  @Transform(emptyToNull)
  @Matches(DATE_ONLY, { message: 'endDate must be YYYY-MM-DD' })
  @IsDateString({ strict: true })
  @ApiPropertyOptional({ example: '2025-09-30' })
  endDate?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(3000)
  @ApiPropertyOptional({ example: 'Built REST APIs with NestJS' })
  responsibilities?: string | null;
}

export class UpdateExperienceDto extends PartialType(CreateExperienceDto) {}
