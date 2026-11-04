import { ApiProperty, PartialType } from '@nestjs/swagger';
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
  @ApiProperty({ example: 'Dr. Karim Ahmed' })
  name: string;

  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @ApiProperty({ example: 'Professor' })
  designation: string;

  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @ApiProperty({ example: 'AIUB' })
  organization: string;

  @Transform(trimValue)
  @IsEmail()
  @MaxLength(255)
  @ApiProperty({ example: 'karim.ahmed@example.com' })
  email: string;

  @Transform(trimValue)
  @Matches(BD_MOBILE, { message: 'Enter a valid Bangladeshi mobile number' })
  @ApiProperty({ example: '01912345678' })
  mobile: string;

  @IsEnum(ReferenceRelation)
  @ApiProperty({ example: 'academic' })
  relation: ReferenceRelation;
}

export class UpdateReferenceDto extends PartialType(CreateReferenceDto) {}
