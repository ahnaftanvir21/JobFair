import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../common/decorators/index.js';
import { JoiningDate, UserRole } from '../../common/enums/index.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import type { UploadedFileLike } from '../uploads/file-storage.service.js';
import { ApiFileUpload } from '../uploads/upload.decorators.js';
import { ApplicationsService } from './applications.service.js';
import {
  ApplyDto,
  ListApplicationsQueryDto,
  UpdateApplicationStatusDto,
} from './dto/application.dto.js';

@ApiTags('Applications')
@Controller()
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post('jobs/:id/apply')
  @Roles(UserRole.STUDENT)
  @ApiOperation({
    summary: 'Apply for a job',
    description:
      'Profile is attached automatically. Leave out the file to use the profile CV. ' +
      'Also accepts a JSON body (without a file) with answers as an array.',
  })
  @ApiFileUpload('Application', {
    fileRequired: false,
    requiredFields: ['joiningDate'],
    fields: {
      joiningDate: { type: 'string', enum: Object.values(JoiningDate) },
      answers: {
        type: 'string',
        description: 'JSON array: [{"questionId":"...","answer":"..."}]',
        example:
          '[{"questionId":"00000000-0000-0000-0000-000000000000","answer":"My answer"}]',
      },
    },
  })
  apply(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) jobId: string,
    @Body() dto: ApplyDto,
    @UploadedFile() file?: UploadedFileLike,
  ) {
    return this.applicationsService.apply(user.id, jobId, dto, file);
  }

  @Get('applications/mine')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'My applications with status' })
  mine(
    @CurrentUser() user: AuthUser,
    @Query() query: ListApplicationsQueryDto,
  ) {
    return this.applicationsService.mine(user.id, query);
  }

  @Get('jobs/:id/applications')
  @Roles(UserRole.EMPLOYER)
  @ApiOperation({ summary: 'Applicants for my job, with answers' })
  forJob(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) jobId: string,
    @Query() query: ListApplicationsQueryDto,
  ) {
    return this.applicationsService.forJob(user.id, jobId, query);
  }

  @Get('applications/:id')
  @ApiOperation({
    summary: 'One application (applicant or the hiring company)',
  })
  getOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.applicationsService.getOne(user, id);
  }

  @Patch('applications/:id/status')
  @Roles(UserRole.EMPLOYER)
  @ApiOperation({ summary: 'Shortlist, reject or hire an applicant' })
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationStatusDto,
  ) {
    return this.applicationsService.updateStatus(user.id, id, dto);
  }
}
