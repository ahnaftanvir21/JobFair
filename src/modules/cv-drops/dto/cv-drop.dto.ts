import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { emptyToNull } from '../../../common/utils/text.util.js';

export class CreateCvDropDto {
  /** Company to send the CV to. Only that company can see it. */
  @Transform(emptyToNull)
  @IsNotEmpty({ message: 'Choose a company to send your CV to' })
  @IsUUID()
  employerId: string;

  /** Short message to the employer */
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(500)
  @ApiPropertyOptional({ example: 'Interested in backend developer roles.' })
  note?: string | null;
}

/** Kept so old clients that still send ?scope= are not rejected. Ignored. */
export class ReceivedCvDropsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  scope?: string;
}
