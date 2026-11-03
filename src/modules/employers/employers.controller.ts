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
import { UserRole } from '../../common/enums/index.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import type { UploadedFileLike } from '../uploads/file-storage.service.js';
import { ApiFileUpload } from '../uploads/upload.decorators.js';
import {
  CreateEmployerProfileDto,
  SearchEmployersQueryDto,
  UpdateEmployerProfileDto,
} from './dto/index.js';
import { EmployersService } from './employers.service.js';

@ApiTags('Employers')
@Controller('employers')
export class EmployersController {
  constructor(private readonly employersService: EmployersService) {}

  @Post('me')
  @Roles(UserRole.EMPLOYER)
  @ApiOperation({ summary: 'Create my company profile' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEmployerProfileDto) {
    return this.employersService.create(user.id, dto);
  }

  @Get('me')
  @Roles(UserRole.EMPLOYER)
  @ApiOperation({ summary: 'My company profile' })
  getMe(@CurrentUser() user: AuthUser) {
    return this.employersService.getOwn(user.id);
  }

  @Patch('me')
  @Roles(UserRole.EMPLOYER)
  @ApiOperation({ summary: 'Update my company profile' })
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateEmployerProfileDto) {
    return this.employersService.update(user.id, dto);
  }

  @Post('me/logo')
  @Roles(UserRole.EMPLOYER)
  @ApiOperation({ summary: 'Upload company logo (JPG/PNG, max 2 MB)' })
  @ApiFileUpload('Company logo')
  uploadLogo(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedFileLike | undefined,
  ) {
    return this.employersService.setLogo(user.id, file);
  }

  @Get()
  @ApiOperation({ summary: 'Search companies, with their open job count' })
  search(@Query() query: SearchEmployersQueryDto) {
    return this.employersService.search(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Company page with its open jobs' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.employersService.getById(id);
  }
}
