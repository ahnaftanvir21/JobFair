import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { EmployerStatus } from '../../../common/enums/index.js';
import { trimValue } from '../../../common/utils/text.util.js';

export class AdminEmployersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(EmployerStatus)
  @ApiPropertyOptional({
    enum: EmployerStatus,
    description: 'Leave out to list every company. pending = waiting for review.',
  })
  status?: EmployerStatus;

  /** Matches company name, login email or HR name */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class RejectEmployerDto {
  @Transform(trimValue)
  @IsString()
  @IsNotEmpty({ message: 'Give a reason so the company knows what to fix' })
  @MaxLength(500)
  @ApiProperty({
    example: 'Website and HR contact could not be verified.',
    description: 'Shown to the company and sent to them by email.',
  })
  reason: string;
}
