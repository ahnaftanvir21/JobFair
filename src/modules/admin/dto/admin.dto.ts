import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import {
  ApplicationStatus,
  EmployerStatus,
} from '../../../common/enums/index.js';
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

export const ADMIN_JOB_STATUSES = ['open', 'closed'] as const;
export type AdminJobStatus = (typeof ADMIN_JOB_STATUSES)[number];

export class AdminJobsQueryDto extends PaginationQueryDto {
  /** Matches position or company name */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(ADMIN_JOB_STATUSES)
  @ApiPropertyOptional({
    enum: ADMIN_JOB_STATUSES,
    description: 'open = active and deadline not passed. Leave out for all.',
  })
  status?: AdminJobStatus;

  @IsOptional()
  @IsUUID()
  employerId?: string;
}

export class AdminApplicationsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ApplicationStatus)
  @ApiPropertyOptional({ enum: ApplicationStatus })
  status?: ApplicationStatus;

  @IsOptional()
  @IsUUID()
  jobId?: string;

  @IsOptional()
  @IsUUID()
  employerId?: string;

  /** Matches student name or AIUB ID */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
