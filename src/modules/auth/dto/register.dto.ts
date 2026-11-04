import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
  OmitType,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Gender } from '../../../common/enums/index.js';
import { trimValue } from '../../../common/utils/text.util.js';
import { CreateEmployerProfileDto } from '../../employers/dto/employer-profile.dto.js';
import {
  CreateEducationDto,
  CreateExperienceDto,
  CreateReferenceDto,
  CreateStudentProfileDto,
} from '../../students/dto/index.js';

/** Login details shared by both registration forms. */
export class RegisterDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(255)
  @ApiProperty({ example: 'you@example.com' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  // bcrypt only uses the first 72 bytes.
  @MaxLength(72, { message: 'Password must be at most 72 characters' })
  @ApiProperty({ example: 'secret123' })
  password: string;
}

/**
 * Student registration: account plus the whole profile in one request.
 * Picture and CV are uploaded afterwards with the returned token.
 */
export class RegisterStudentDto extends IntersectionType(
  RegisterDto,
  OmitType(CreateStudentProfileDto, ['address', 'gender'] as const),
) {
  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  @ApiProperty({ example: 'House 12, Road 5, Kuril, Dhaka' })
  address: string;

  @IsEnum(Gender)
  @ApiProperty({ example: 'male' })
  gender: Gender;

  /** At least one entry: SSC, HSC, BSc, MSc 1, MSc 2 or professional */
  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one education entry' })
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CreateEducationDto)
  @ApiProperty({
    example: [
      {
        level: 'bsc',
        institutionName: 'American International University-Bangladesh',
        cgpa: 3.75,
        subject: 'Computer Science and Engineering',
        passingYear: 2026,
      },
      {
        level: 'hsc',
        institutionName: 'Notre Dame College',
        cgpa: 5,
        subject: 'Science',
        passingYear: 2021,
      },
    ],
  })
  educations: CreateEducationDto[];

  /** Optional. Leave out or send [] if none. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateExperienceDto)
  @ApiPropertyOptional({
    example: [
      {
        companyName: 'Brain Station 23',
        industryType: 'Software',
        jobType: 'internship',
        designation: 'Software Engineer Intern',
        startDate: '2025-06-01',
        endDate: '2025-09-30',
        responsibilities: 'Built REST APIs with NestJS',
      },
    ],
  })
  experiences?: CreateExperienceDto[];

  /** Optional. Leave out or send [] if none. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CreateReferenceDto)
  @ApiPropertyOptional({
    example: [
      {
        name: 'Dr. Karim Ahmed',
        designation: 'Professor',
        organization: 'AIUB',
        email: 'karim.ahmed@example.com',
        mobile: '01912345678',
        relation: 'academic',
      },
    ],
  })
  references?: CreateReferenceDto[];
}

/**
 * Employer registration: account plus the whole company profile in one request.
 * The logo is uploaded afterwards with the returned token.
 */
export class RegisterEmployerDto extends IntersectionType(
  RegisterDto,
  CreateEmployerProfileDto,
) {}

// Each form gets its own example email in Swagger, so the pre-filled
// student and employer bodies never collide on the same account.
ApiProperty({
  example: 'rahim.uddin@example.com',
  format: 'email',
  maxLength: 255,
})(RegisterStudentDto.prototype, 'email');
ApiProperty({
  example: 'hr@acme-software.com',
  format: 'email',
  maxLength: 255,
})(RegisterEmployerDto.prototype, 'email');
