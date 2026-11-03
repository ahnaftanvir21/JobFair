import { BadRequestException } from '@nestjs/common';
import { plainToInstance, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { ApplicationStatus, JoiningDate } from '../../../common/enums/index.js';
import { trimValue } from '../../../common/utils/text.util.js';

export class AnswerDto {
  @IsUUID()
  questionId: string;

  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(3000)
  answer: string;
}

/**
 * Multipart forms send answers as a JSON string, JSON bodies send an array.
 * Both become AnswerDto instances here.
 */
function parseAnswers({ value }: { value: unknown }): unknown {
  let parsed = value;
  if (typeof value === 'string') {
    if (value.trim() === '') return [];
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new BadRequestException('answers must be a JSON array');
    }
  }
  return Array.isArray(parsed)
    ? parsed.map((item) =>
        item && typeof item === 'object'
          ? plainToInstance(AnswerDto, item)
          : item,
      )
    : parsed;
}

export class ApplyDto {
  @IsEnum(JoiningDate)
  joiningDate: JoiningDate;

  /** One entry per question. In multipart forms, send as a JSON string. */
  @IsOptional()
  @Transform(parseAnswers)
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  answers?: AnswerDto[];
}

export class UpdateApplicationStatusDto {
  @IsEnum(ApplicationStatus)
  status: ApplicationStatus;
}

export class ListApplicationsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ApplicationStatus)
  status?: ApplicationStatus;
}
