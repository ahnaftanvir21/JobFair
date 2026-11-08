import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { CvDropsService } from './cv-drops.service.js';
import { CreateCvDropDto, ReceivedCvDropsQueryDto } from './dto/cv-drop.dto.js';

@ApiTags('CV Drops')
@Controller('cv-drops')
export class CvDropsController {
  constructor(private readonly cvDropsService: CvDropsService) {}

  @Post()
  @Roles(UserRole.STUDENT)
  @ApiOperation({
    summary: 'Just drop your CV',
    description:
      'employerId is required: only that company sees the CV. Leave out the file to use the profile CV.',
  })
  @ApiFileUpload('CV drop', {
    fileRequired: false,
    requiredFields: ['employerId'],
    fields: {
      employerId: { type: 'string', format: 'uuid' },
      note: { type: 'string' },
    },
  })
  drop(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCvDropDto,
    @UploadedFile() file?: UploadedFileLike,
  ) {
    return this.cvDropsService.drop(user.id, dto, file);
  }

  @Get('mine')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'My CV drops' })
  mine(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.cvDropsService.mine(user.id, query);
  }

  @Get('received')
  @Roles(UserRole.EMPLOYER)
  @ApiOperation({ summary: 'CVs students sent to my company' })
  received(
    @CurrentUser() user: AuthUser,
    @Query() query: ReceivedCvDropsQueryDto,
  ) {
    return this.cvDropsService.received(user.id, query);
  }

  @Delete(':id')
  @Roles(UserRole.STUDENT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Withdraw one of my CV drops' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cvDropsService.remove(user.id, id);
  }
}
