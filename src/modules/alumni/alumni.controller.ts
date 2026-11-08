import {
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
import { Roles } from '../../common/decorators/index.js';
import { UserRole } from '../../common/enums/index.js';
import type { AlumniUpload } from './alumni-list.parser.js';
import { ApiFileUpload } from '../uploads/upload.decorators.js';
import { AlumniService } from './alumni.service.js';
import { AdminAlumniQueryDto } from './dto/alumni.dto.js';

/** Fair office: the alumni list that alumni register against. */
@ApiTags('Admin')
@Roles(UserRole.ADMIN)
@Controller('admin/alumni')
export class AlumniController {
  constructor(private readonly alumni: AlumniService) {}

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @ApiFileUpload(
    'The alumni list as .xlsx or .csv (from Google Sheets: File > Download). ' +
      'The first row needs the headings ID and Grad Reg; Name is optional.',
  )
  @ApiOperation({
    summary: 'Upload the alumni list (add or update)',
    description:
      'New IDs are added and changed ones updated. IDs not in the file stay on the list, so ' +
      'the list can be uploaded again or in parts. Registration numbers are stored as a hash. ' +
      'Returns counts and the rows that were skipped, with the reason.',
  })
  upload(@UploadedFile() file: AlumniUpload | undefined) {
    return this.alumni.importFile(file);
  }

  @Get()
  @ApiOperation({
    summary: 'The alumni list, with who has registered',
    description: 'status=registered or not_registered. q matches AIUB ID, name or login email.',
  })
  list(@Query() query: AdminAlumniQueryDto) {
    return this.alumni.list(query);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove one ID from the alumni list',
    description: 'An account already registered with this ID is not deleted.',
  })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.alumni.remove(id);
  }
}
