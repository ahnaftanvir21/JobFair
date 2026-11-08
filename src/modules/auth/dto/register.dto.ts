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
  Matches,
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
import { AIUB_STUDENT_EMAIL } from '../../students/dto/student-profile.dto.js';

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

  /** From POST /auth/signup-code/verify. With it the account starts verified. */
  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/, {
    message: 'Your email check is invalid. Verify your email again.',
  })
  @ApiPropertyOptional({
    description:
      'Email token from POST /auth/signup-code/verify for this email. With it the account ' +
      'starts verified and no code is emailed after registering.',
  })
  emailToken?: string;
}

/** Account plus the whole profile: shared by student and alumni registration. */
class StudentRegistrationFields extends IntersectionType(
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
 * Current student registration: account plus the whole profile in one request.
 * Picture and CV are uploaded afterwards with the returned token.
 */
export class RegisterStudentDto extends StudentRegistrationFields {
  /** AIUB student email only. The ID before @ must equal aiubId. */
  @Matches(AIUB_STUDENT_EMAIL, {
    message: 'Use your AIUB student email, like 23-54445-3@student.aiub.edu',
  })
  declare email: string;

  /** Required unless the AIUB ID is on the current student list (then the list's is used). */
  @IsOptional()
  @ApiPropertyOptional({
    example: 'Bachelor of Science in Computer Science and Engineering',
    description:
      'Required unless the AIUB ID is on the current student list; then the list value is used.',
  })
  declare program: string;

  @IsOptional()
  @ApiPropertyOptional({
    example: 'Faculty of Science and Technology',
    description:
      'Required unless the AIUB ID is on the current student list; then the list value is used.',
  })
  declare faculty: string;
}

/** Current student sign-up: look up the student list after verifying the AIUB email. */
export class StudentListLookupDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @Matches(AIUB_STUDENT_EMAIL, {
    message: 'Use your AIUB student email, like 23-54445-3@student.aiub.edu',
  })
  @ApiProperty({ example: '23-54445-3@student.aiub.edu' })
  email: string;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/, {
    message: 'Your email check is invalid. Verify your email again.',
  })
  @ApiProperty({ description: 'Email token from POST /auth/signup-code/verify.' })
  emailToken: string;
}

/**
 * Alumni registration: any email, proven by the code check, plus the AIUB ID
 * and registration number from the alumni list. Study level is always graduated;
 * program and faculty come from the list.
 */
export class RegisterAlumniDto extends OmitType(StudentRegistrationFields, [
  'studyLevel',
  'program',
  'faculty',
  'emailToken',
] as const) {
  @Transform(trimValue)
  @IsString()
  @IsNotEmpty({ message: 'Enter your registration number' })
  @MaxLength(40)
  @ApiProperty({
    example: '22-36987-01',
    description: 'Graduation registration number, as on the alumni list.',
  })
  registrationNumber: string;

  /** Required: alumni always verify their personal email before registering. */
  @IsString()
  @Matches(/^[a-f0-9]{64}$/, {
    message: 'Your email check is invalid. Verify your email again.',
  })
  @ApiProperty({
    description: 'Email token from POST /auth/signup-code/verify for this email.',
  })
  emailToken: string;
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
  example: '22-48123-1@student.aiub.edu',
  format: 'email',
  maxLength: 255,
})(RegisterStudentDto.prototype, 'email');
ApiProperty({
  example: 'ahnaf.sadman@gmail.com',
  format: 'email',
  maxLength: 255,
})(RegisterAlumniDto.prototype, 'email');
ApiProperty({
  example: 'hr@acme-software.com',
  format: 'email',
  maxLength: 255,
})(RegisterEmployerDto.prototype, 'email');
