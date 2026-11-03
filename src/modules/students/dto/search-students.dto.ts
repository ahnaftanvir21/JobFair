import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { PreferredJobType, StudyLevel } from '../../../common/enums/index.js';

export class SearchStudentsQueryDto extends PaginationQueryDto {
  /** Matches name or AIUB ID */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsEnum(StudyLevel)
  studyLevel?: StudyLevel;

  @IsOptional()
  @IsEnum(PreferredJobType)
  preferredJobType?: PreferredJobType;

  /** Matches any of the student's preferred industries */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string;

  /** true: only students who uploaded a CV */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  hasCv?: boolean;
}
