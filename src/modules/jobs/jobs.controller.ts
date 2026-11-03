import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { CurrentUser, Roles } from '../../common/decorators/index.js';
import { UserRole } from '../../common/enums/index.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import {
  CreateJobDto,
  SearchJobsQueryDto,
  UpdateJobDto,
} from './dto/job.dto.js';
import { JobsService } from './jobs.service.js';

@ApiTags('Jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @Roles(UserRole.EMPLOYER)
  @ApiOperation({ summary: 'Create a job post with any number of questions' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateJobDto) {
    return this.jobsService.create(user.id, dto);
  }

  @Get('mine')
  @Roles(UserRole.EMPLOYER)
  @ApiOperation({
    summary: 'My job posts, open and closed, with applicant counts',
  })
  mine(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.jobsService.mine(user.id, query);
  }

  @Get()
  @ApiOperation({ summary: 'Search open jobs' })
  search(@Query() query: SearchJobsQueryDto) {
    return this.jobsService.search(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Job details with questions' })
  getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.jobsService.getById(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.EMPLOYER)
  @ApiOperation({
    summary: 'Edit my job post',
    description:
      'Sending questions replaces the whole list. Not allowed once someone has applied.',
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobDto,
  ) {
    return this.jobsService.update(user.id, id, dto);
  }

  @Patch(':id/close')
  @Roles(UserRole.EMPLOYER)
  @ApiOperation({ summary: 'Close my job post to new applications' })
  close(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobsService.close(user.id, id);
  }
}
