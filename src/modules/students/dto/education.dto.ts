import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { EducationLevel } from '../../../common/enums/index.js';
import { emptyToNull, trimValue } from '../../../common/utils/text.util.js';

export class CreateEducationDto {
  @IsEnum(EducationLevel)
  level: EducationLevel;

  /** School or college name */
  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  institutionName: string;

  /** GPA or CGPA, 0 to 5 */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(5)
  cgpa?: number | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(120)
  subject?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1970)
  @Max(2040)
  passingYear?: number | null;

  /** Degree title, mainly for the professional degree row */
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(150)
  degreeName?: string | null;
}

export class UpdateEducationDto extends PartialType(CreateEducationDto) {}
