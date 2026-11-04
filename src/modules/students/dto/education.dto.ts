import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
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
  @ApiProperty({ example: 'bsc' })
  level: EducationLevel;

  /** School or college name */
  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @ApiProperty({ example: 'American International University-Bangladesh' })
  institutionName: string;

  /** GPA or CGPA, 0 to 5 */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(5)
  @ApiPropertyOptional({ example: 3.75 })
  cgpa?: number | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(120)
  @ApiPropertyOptional({ example: 'Computer Science and Engineering' })
  subject?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1970)
  @Max(2040)
  @ApiPropertyOptional({ example: 2026 })
  passingYear?: number | null;

  /** Degree title, mainly for the professional degree row */
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(150)
  @ApiPropertyOptional({ example: 'B.Sc. in CSE' })
  degreeName?: string | null;
}

export class UpdateEducationDto extends PartialType(CreateEducationDto) {}
