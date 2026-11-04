import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/index.js';
import { UserRole } from '../../common/enums/index.js';
import { AdminService } from './admin.service.js';
import {
  AdminApplicationsQueryDto,
  AdminEmployersQueryDto,
  AdminJobsQueryDto,
  RejectEmployerDto,
} from './dto/admin.dto.js';

/**
 * Fair office tools. Students: use GET /students and GET /students/:id.
 * One application in full: GET /applications/:id.
 */
@ApiTags('Admin')
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  @ApiOperation({
    summary: 'Overall numbers',
    description:
      'Students (with CV, seminar sign-ups), employers by approval status, open and closed jobs, ' +
      'applications by status, CV drops and candidate criteria.',
  })
  stats() {
    return this.adminService.stats();
  }

  @Get('employers')
  @ApiOperation({
    summary: 'All companies with login email and job counts',
    description: 'Use status=pending for the approval queue (oldest first).',
  })
  listEmployers(@Query() query: AdminEmployersQueryDto) {
    return this.adminService.listEmployers(query);
  }

  @Get('employers/:id')
  @ApiOperation({
    summary: 'One company with all its jobs and what it has received',
  })
  getEmployer(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getEmployer(id);
  }

  @Patch('employers/:id/approve')
  @ApiOperation({
    summary: 'Approve a company',
    description:
      'The company can then post jobs and criteria, browse students and review applicants, ' +
      'and shows up for students. It gets an email. Also works on a rejected company.',
  })
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.approveEmployer(id);
  }

  @Patch('employers/:id/reject')
  @ApiOperation({
    summary: 'Reject a company, with a reason',
    description:
      'The company and its jobs are hidden from students, and it can only edit its profile. ' +
      'It gets an email with the reason. Editing its profile sends it back to pending. ' +
      'Also works on an approved company, to withdraw approval.',
  })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectEmployerDto,
  ) {
    return this.adminService.rejectEmployer(id, dto);
  }

  @Get('jobs')
  @ApiOperation({
    summary: 'All job posts with application counts',
    description: 'Includes closed jobs and jobs of companies not approved.',
  })
  listJobs(@Query() query: AdminJobsQueryDto) {
    return this.adminService.listJobs(query);
  }

  @Get('applications')
  @ApiOperation({ summary: 'All applications with student, job and company' })
  listApplications(@Query() query: AdminApplicationsQueryDto) {
    return this.adminService.listApplications(query);
  }
}
