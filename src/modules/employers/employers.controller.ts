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
  AllowUnverified,
  CurrentUser,
  OptionalAuth,
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
  @AllowUnverified()
  @ApiOperation({ summary: 'My company profile' })
  getMe(@CurrentUser() user: AuthUser) {
    return this.employersService.getOwn(user.id);
  }

  @Patch('me')
  @Roles(UserRole.EMPLOYER)
  @AllowUnverified()
  @ApiOperation({ summary: 'Update my company profile, including the booth number' })
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateEmployerProfileDto) {
    return this.employersService.update(user.id, dto);
  }

  @Post('me/logo')
  @Roles(UserRole.EMPLOYER)
  @AllowUnverified()
  @ApiOperation({ summary: 'Upload company logo (JPG/PNG, max 2 MB)' })
  @ApiFileUpload('Company logo')
  uploadLogo(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedFileLike | undefined,
  ) {
    return this.employersService.setLogo(user.id, file);
  }

  @Get()
  @OptionalAuth()
  @ApiOperation({
    summary: 'Search companies, with their open job count (no login needed)',
    description: 'Visitors see public company fields only. Logged-in users also see the HR contact.',
  })
  search(
    @Query() query: SearchEmployersQueryDto,
    @CurrentUser() user: AuthUser | undefined,
  ) {
    return this.employersService.search(query, user);
  }

  @Get(':id')
  @OptionalAuth()
  @ApiOperation({
    summary: 'Company page with its open jobs (no login needed)',
    description: 'Visitors see public company fields only. Logged-in users also see the HR contact.',
  })
  getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser | undefined,
  ) {
    return this.employersService.getById(id, user);
  }
}
