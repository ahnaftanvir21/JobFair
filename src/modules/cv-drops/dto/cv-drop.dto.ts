import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { emptyToNull } from '../../../common/utils/text.util.js';

export class CreateCvDropDto {
  /** Company to send the CV to. Leave empty for the general pool. */
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  employerId?: string | null;

  /** Short message to the employer */
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(500)
  @ApiPropertyOptional({ example: 'Interested in backend developer roles.' })
  note?: string | null;
}

export enum CvDropScope {
  /** Sent directly to my company */
  COMPANY = 'company',
  /** General pool, visible to every employer */
  POOL = 'pool',
  ALL = 'all',
}

export class ReceivedCvDropsQueryDto extends PaginationQueryDto {
  /** Default: all */
  @IsOptional()
  @IsEnum(CvDropScope)
  scope?: CvDropScope;
}
