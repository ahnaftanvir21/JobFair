import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { PreferredJobType, StudyLevel } from '../../../common/enums/index.js';
import { emptyToNull, trimValue } from '../../../common/utils/text.util.js';

export class CreateCandidateCriteriaDto {
  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @ApiProperty({ example: 'Fresh CSE graduates for 2027 intake' })
  title: string;

  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  @ApiProperty({
    example:
      'We are looking for graduates who enjoy problem solving and want to grow as backend engineers.',
  })
  description: string;

  /** Used for matching. Leave empty for any. */
  @IsOptional()
  @IsEnum(PreferredJobType)
  @ApiPropertyOptional({ example: 'full_time' })
  preferredJobType?: PreferredJobType | null;

  /** Used for matching. Leave empty for any. */
  @IsOptional()
  @IsEnum(StudyLevel)
  @ApiPropertyOptional({ example: 'graduated' })
  studyLevel?: StudyLevel | null;

  /** Matched against students' preferred industries. Leave empty for any. */
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(120)
  @ApiPropertyOptional({ example: 'Software' })
  industryType?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(3000)
  @ApiPropertyOptional({ example: 'TypeScript, SQL, Git' })
  skills?: string | null;
}

export class UpdateCandidateCriteriaDto extends PartialType(
  CreateCandidateCriteriaDto,
) {}

export class ListCandidateCriteriaQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  employerId?: string;
}
