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
import {
  AllowPendingEmployer,
  CurrentUser,
  Roles,
} from '../../common/decorators/index.js';
import { UserRole } from '../../common/enums/index.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import type { UploadedFileLike } from '../uploads/file-storage.service.js';
import { ApiFileUpload } from '../uploads/upload.decorators.js';
import {
  SearchEmployersQueryDto,
  UpdateEmployerProfileDto,
} from './dto/index.js';
import { EmployersService } from './employers.service.js';

@ApiTags('Employers')
@Controller('employers')
export class EmployersController {
  constructor(private readonly employersService: EmployersService) {}

  @Get('me')
  @Roles(UserRole.EMPLOYER)
  @AllowPendingEmployer()
  @ApiOperation({
    summary: 'My company profile, with its approval status',
    description:
      'status is pending, approved or rejected (with rejectionReason). ' +
      'Until approved, the company can only edit its profile and logo.',
  })
  getMe(@CurrentUser() user: AuthUser) {
    return this.employersService.getOwn(user.id);
  }

  @Patch('me')
  @Roles(UserRole.EMPLOYER)
  @AllowPendingEmployer()
  @ApiOperation({
    summary: 'Update my company profile',
    description: 'After a rejection, saving sends the company back to the admin for review.',
  })
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateEmployerProfileDto) {
    return this.employersService.update(user.id, dto);
  }

  @Post('me/logo')
  @Roles(UserRole.EMPLOYER)
  @AllowPendingEmployer()
  @ApiOperation({ summary: 'Upload company logo (JPG/PNG, max 2 MB)' })
  @ApiFileUpload('Company logo')
  uploadLogo(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedFileLike | undefined,
  ) {
    return this.employersService.setLogo(user.id, file);
  }

  @Get()
  @AllowPendingEmployer()
  @ApiOperation({ summary: 'Search approved companies, with their open job count' })
  search(@Query() query: SearchEmployersQueryDto) {
    return this.employersService.search(query);
  }

  @Get(':id')
  @AllowPendingEmployer()
  @ApiOperation({ summary: 'Approved company page with its open jobs' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.employersService.getById(id);
  }
}
