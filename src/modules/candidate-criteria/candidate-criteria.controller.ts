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
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { CurrentUser, Roles } from '../../common/decorators/index.js';
import { UserRole } from '../../common/enums/index.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import type { UploadedFileLike } from '../uploads/file-storage.service.js';
import { ApiFileUpload } from '../uploads/upload.decorators.js';
import { CandidateCriteriaService } from './candidate-criteria.service.js';
import {
  CreateCandidateCriteriaDto,
  ListCandidateCriteriaQueryDto,
  UpdateCandidateCriteriaDto,
} from './dto/candidate-criteria.dto.js';

@ApiTags('Candidate Criteria')
@Controller('candidate-criteria')
export class CandidateCriteriaController {
  constructor(private readonly service: CandidateCriteriaService) {}

  @Post()
  @Roles(UserRole.EMPLOYER)
  @ApiOperation({ summary: 'Post desired candidate criteria' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCandidateCriteriaDto,
  ) {
    return this.service.create(user.id, dto);
  }

  @Get('mine')
  @Roles(UserRole.EMPLOYER)
  @ApiOperation({ summary: 'My candidate criteria' })
  mine(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.service.mine(user.id, query);
  }

  @Get()
  @ApiOperation({
    summary: 'All candidate criteria, optionally for one company',
  })
  list(@Query() query: ListCandidateCriteriaQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One candidate criteria entry' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getById(id);
  }

  @Get(':id/matches')
  @Roles(UserRole.EMPLOYER)
  @ApiOperation({ summary: 'Students who fit my criteria' })
  matches(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.service.matches(user.id, id, query);
  }

  @Patch(':id')
  @Roles(UserRole.EMPLOYER)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCandidateCriteriaDto,
  ) {
    return this.service.update(user.id, id, dto);
  }

  @Post(':id/attachment')
  @Roles(UserRole.EMPLOYER)
  @ApiOperation({ summary: 'Attach a PDF describing the criteria (max 5 MB)' })
  @ApiFileUpload('Criteria PDF')
  attach(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedFileLike | undefined,
  ) {
    return this.service.setAttachment(user.id, id, file);
  }

  @Delete(':id')
  @Roles(UserRole.EMPLOYER)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(user.id, id);
  }
}
