import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ReferenceRelation } from '../../../common/enums/index.js';
import { trimValue } from '../../../common/utils/text.util.js';
import { BD_MOBILE } from './student-profile.dto.js';

export class CreateReferenceDto {
  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  designation: string;

  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  organization: string;

  @Transform(trimValue)
  @IsEmail()
  @MaxLength(255)
  email: string;

  @Transform(trimValue)
  @Matches(BD_MOBILE, { message: 'Enter a valid Bangladeshi mobile number' })
  mobile: string;

  @IsEnum(ReferenceRelation)
  relation: ReferenceRelation;
}

export class UpdateReferenceDto extends PartialType(CreateReferenceDto) {}
