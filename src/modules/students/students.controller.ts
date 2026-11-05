import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AllowUnverified,
  CurrentUser,
  Roles,
} from '../../common/decorators/index.js';
import { UserRole } from '../../common/enums/index.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import type { UploadedFileLike } from '../uploads/file-storage.service.js';
import { ApiFileUpload } from '../uploads/upload.decorators.js';
import {
  CreateEducationDto,
  CreateExperienceDto,
  CreateReferenceDto,
  SearchStudentsQueryDto,
  UpdateEducationDto,
  UpdateExperienceDto,
  UpdateReferenceDto,
  UpdateStudentProfileDto,
} from './dto/index.js';
import { StudentsService } from './students.service.js';

@ApiTags('Students')
@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  // ---------- Own profile (students) ----------

  @Get('me')
  @Roles(UserRole.STUDENT)
  @AllowUnverified()
  @ApiOperation({ summary: 'My full profile with completeness check' })
  getMe(@CurrentUser() user: AuthUser) {
    return this.studentsService.getOwnProfile(user.id);
  }

  @Patch('me')
  @Roles(UserRole.STUDENT)
  @AllowUnverified()
  @ApiOperation({
    summary: 'Update my profile. Send null to clear an optional field.',
  })
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateStudentProfileDto) {
    return this.studentsService.update(user.id, dto);
  }

  @Post('me/picture')
  @Roles(UserRole.STUDENT)
  @AllowUnverified()
  @ApiOperation({ summary: 'Upload profile picture (JPG/PNG, max 2 MB)' })
  @ApiFileUpload('Profile picture')
  uploadPicture(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedFileLike | undefined,
  ) {
    return this.studentsService.setPicture(user.id, file);
  }

  @Post('me/cv')
  @Roles(UserRole.STUDENT)
  @AllowUnverified()
  @ApiOperation({ summary: 'Upload my CV (PDF, max 5 MB)' })
  @ApiFileUpload('CV as PDF')
  uploadCv(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedFileLike | undefined,
  ) {
    return this.studentsService.setCv(user.id, file);
  }

  // ---------- Education ----------

  @Post('me/educations')
  @Roles(UserRole.STUDENT)
  @AllowUnverified()
  addEducation(@CurrentUser() user: AuthUser, @Body() dto: CreateEducationDto) {
    return this.studentsService.addEducation(user.id, dto);
  }

  @Patch('me/educations/:id')
  @Roles(UserRole.STUDENT)
  @AllowUnverified()
  updateEducation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEducationDto,
  ) {
    return this.studentsService.updateEducation(user.id, id, dto);
  }

  @Delete('me/educations/:id')
  @Roles(UserRole.STUDENT)
  @AllowUnverified()
  @HttpCode(HttpStatus.NO_CONTENT)
  removeEducation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.studentsService.removeEducation(user.id, id);
  }

  // ---------- Experience ----------

  @Post('me/experiences')
  @Roles(UserRole.STUDENT)
  @AllowUnverified()
  addExperience(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateExperienceDto,
  ) {
    return this.studentsService.addExperience(user.id, dto);
  }

  @Patch('me/experiences/:id')
  @Roles(UserRole.STUDENT)
  @AllowUnverified()
  updateExperience(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExperienceDto,
  ) {
    return this.studentsService.updateExperience(user.id, id, dto);
  }

  @Delete('me/experiences/:id')
  @Roles(UserRole.STUDENT)
  @AllowUnverified()
  @HttpCode(HttpStatus.NO_CONTENT)
  removeExperience(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.studentsService.removeExperience(user.id, id);
  }

  // ---------- References ----------

  @Post('me/references')
  @Roles(UserRole.STUDENT)
  @AllowUnverified()
  addReference(@CurrentUser() user: AuthUser, @Body() dto: CreateReferenceDto) {
    return this.studentsService.addReference(user.id, dto);
  }

  @Patch('me/references/:id')
  @Roles(UserRole.STUDENT)
  @AllowUnverified()
  updateReference(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReferenceDto,
  ) {
    return this.studentsService.updateReference(user.id, id, dto);
  }

  @Delete('me/references/:id')
  @Roles(UserRole.STUDENT)
  @AllowUnverified()
  @HttpCode(HttpStatus.NO_CONTENT)
  removeReference(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.studentsService.removeReference(user.id, id);
  }

  // ---------- Browse (employers) ----------

  @Get()
  @Roles(UserRole.EMPLOYER)
  @ApiOperation({ summary: 'Search all students (employers)' })
  search(@Query() query: SearchStudentsQueryDto) {
    return this.studentsService.search(query);
  }

  @Get(':id')
  @Roles(UserRole.EMPLOYER)
  @ApiOperation({
    summary: 'One student with education, experience and references',
  })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.studentsService.getById(id);
  }
}
