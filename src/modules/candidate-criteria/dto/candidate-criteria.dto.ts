import { PartialType } from '@nestjs/swagger';
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
  title: string;

  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description: string;

  /** Used for matching. Leave empty for any. */
  @IsOptional()
  @IsEnum(PreferredJobType)
  preferredJobType?: PreferredJobType | null;

  /** Used for matching. Leave empty for any. */
  @IsOptional()
  @IsEnum(StudyLevel)
  studyLevel?: StudyLevel | null;

  /** Matched against students' preferred industries. Leave empty for any. */
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(120)
  industryType?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(3000)
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
