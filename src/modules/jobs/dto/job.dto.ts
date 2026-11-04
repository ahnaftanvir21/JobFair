import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import {
  EmploymentStatus,
  JobLocation,
  QuestionType,
  Workplace,
} from '../../../common/enums/index.js';
import { emptyToNull, trimValue } from '../../../common/utils/text.util.js';
import { DATE_ONLY } from '../../students/dto/experience.dto.js';

export class JobQuestionDto {
  /** The question the student must answer */
  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  @ApiProperty({
    example: 'How many years of experience do you have with TypeScript?',
  })
  text: string;

  /** text = free answer, single_choice = pick one option. Default text. */
  @IsOptional()
  @IsEnum(QuestionType)
  @ApiPropertyOptional({ example: 'single_choice' })
  type?: QuestionType;

  /** Required for single_choice (at least 2). Ignored for text. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(200, { each: true })
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((v) => (typeof v === 'string' ? v.trim() : v))
      : value,
  )
  @ApiPropertyOptional({ example: ['Less than 1', '1-2', '3 or more'] })
  options?: string[];

  /** Default true */
  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ example: true })
  isRequired?: boolean;
}

export class CreateJobDto {
  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @ApiProperty({ example: 'Junior Backend Developer' })
  positionName: string;

  /** One of the 8 divisions, or anywhere_in_bangladesh */
  @IsEnum(JobLocation)
  @ApiProperty({ example: 'dhaka' })
  location: JobLocation;

  @IsEnum(Workplace)
  @ApiProperty({ example: 'office' })
  workplace: Workplace;

  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(3000)
  @ApiProperty({ example: 'B.Sc. in CSE or a related subject' })
  educationRequirement: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(3000)
  @ApiPropertyOptional({ example: 'Good communication skills in English' })
  additionalRequirements?: string | null;

  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  @ApiProperty({
    example: 'Build and maintain REST APIs; write unit tests; review code',
  })
  responsibilities: string;

  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(3000)
  @ApiProperty({ example: 'TypeScript, Node.js, PostgreSQL' })
  skillsAndExpertise: string;

  @IsEnum(EmploymentStatus)
  @ApiProperty({ example: 'full_time' })
  employmentStatus: EmploymentStatus;

  /** true = "Negotiable". When false, salaryAmount is required. */
  @IsBoolean()
  @ApiProperty({ example: false })
  salaryNegotiable: boolean;

  /** e.g. "30,000 - 40,000 BDT" */
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(100)
  @ApiPropertyOptional({ example: '30,000 - 40,000 BDT' })
  salaryAmount?: string | null;

  /** Defaults to "As per company policy" */
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(3000)
  @ApiPropertyOptional({ example: 'As per company policy' })
  compensationAndBenefits?: string | null;

  /** Last day to apply, YYYY-MM-DD */
  @Matches(DATE_ONLY, { message: 'deadline must be YYYY-MM-DD' })
  @IsDateString({ strict: true })
  @ApiProperty({ example: '2026-12-31' })
  deadline: string;

  /** Any number of questions students answer when applying */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => JobQuestionDto)
  @ApiPropertyOptional({
    example: [
      { text: 'Why do you want to join Acme?', type: 'text', isRequired: true },
      {
        text: 'How many years of experience do you have with TypeScript?',
        type: 'single_choice',
        options: ['Less than 1', '1-2', '3 or more'],
        isRequired: true,
      },
      {
        text: 'Link to your portfolio (optional)',
        type: 'text',
        isRequired: false,
      },
    ],
  })
  questions?: JobQuestionDto[];
}

/** Questions, if sent, replace the whole list. Not allowed once someone has applied. */
export class UpdateJobDto extends PartialType(CreateJobDto) {}

export const REQUIRED_JOB_FIELDS = [
  'positionName',
  'location',
  'workplace',
  'educationRequirement',
  'responsibilities',
  'skillsAndExpertise',
  'employmentStatus',
  'salaryNegotiable',
  'deadline',
  'questions',
] as const;

export class SearchJobsQueryDto extends PaginationQueryDto {
  /** Matches position or company name */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsEnum(JobLocation)
  location?: JobLocation;

  @IsOptional()
  @IsEnum(Workplace)
  workplace?: Workplace;

  @IsOptional()
  @IsEnum(EmploymentStatus)
  employmentStatus?: EmploymentStatus;

  /** Company industry type */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string;

  @IsOptional()
  @IsUUID()
  employerId?: string;
}
