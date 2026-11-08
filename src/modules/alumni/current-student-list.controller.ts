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
import { ApiFileUpload } from '../uploads/upload.decorators.js';
import type { AlumniUpload } from './alumni-list.parser.js';
import { CurrentStudentListService } from './current-student-list.service.js';
import { AdminAlumniQueryDto } from './dto/alumni.dto.js';

/** Fair office: the current student list (program and faculty by AIUB ID). */
@ApiTags('Admin')
@Roles(UserRole.ADMIN)
@Controller('admin/current-students')
export class CurrentStudentListController {
  constructor(private readonly list: CurrentStudentListService) {}

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @ApiFileUpload(
    'The current student list as .xlsx or .csv. The first row needs the heading ID; ' +
      'Name, Program and Faculty are read too.',
  )
  @ApiOperation({
    summary: 'Upload the current student list (add or update)',
    description:
      'New IDs are added and changed ones updated; IDs not in the file stay. Students on the ' +
      'list get their program and faculty filled in and locked, including ones already registered.',
  })
  upload(@UploadedFile() file: AlumniUpload | undefined) {
    return this.list.importFile(file);
  }

  @Get()
  @ApiOperation({
    summary: 'The current student list, with who has registered',
    description:
      'status=registered or not_registered. q matches AIUB ID, name, program or login email.',
  })
  all(@Query() query: AdminAlumniQueryDto) {
    return this.list.list(query);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove one ID from the current student list',
    description: 'An account already registered with this ID is not changed.',
  })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.list.remove(id);
  }
}
