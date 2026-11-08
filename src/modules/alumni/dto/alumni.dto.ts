import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { trimValue } from '../../../common/utils/text.util.js';
import { AIUB_ID } from '../../students/dto/student-profile.dto.js';

/** AIUB ID plus the registration number from the alumni list. */
export class CheckAlumniDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/\s/g, '') : value,
  )
  @Matches(AIUB_ID, { message: 'AIUB ID must look like 22-48123-1' })
  @ApiProperty({ example: '16-32398-2' })
  aiubId: string;

  @Transform(trimValue)
  @IsString()
  @IsNotEmpty({ message: 'Enter your registration number' })
  @MaxLength(40)
  @ApiProperty({
    example: '22-36987-01',
    description: 'Graduation registration number, as on the alumni list.',
  })
  registrationNumber: string;
}

export class CheckAlumniResponseDto {
  @ApiProperty({ example: 'Details match the alumni list.' })
  message: string;

  @ApiProperty({ example: 'AHNAF SADMAN', nullable: true, type: String })
  name: string | null;

  @ApiProperty({ example: 'Bachelor of Business Administration', nullable: true, type: String })
  program: string | null;

  @ApiProperty({ example: 'Faculty of Business Administration', nullable: true, type: String })
  faculty: string | null;

  @ApiProperty({ example: '10th Convocation', nullable: true, type: String })
  convocation: string | null;
}

export enum AlumniStatusFilter {
  REGISTERED = 'registered',
  NOT_REGISTERED = 'not_registered',
}

export class AdminAlumniQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(AlumniStatusFilter)
  @ApiPropertyOptional({ enum: AlumniStatusFilter })
  status?: AlumniStatusFilter;

  /** Matches AIUB ID, name, program or login email. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
