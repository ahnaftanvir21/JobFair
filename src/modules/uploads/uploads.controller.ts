import { access } from 'node:fs/promises';
import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/index.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { FileKind } from './file-kind.enum.js';
import { FileStorageService } from './file-storage.service.js';
import { UploadsService } from './uploads.service.js';

@ApiTags('Uploads')
@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly storage: FileStorageService,
    private readonly uploadsService: UploadsService,
  ) {}

  @Get(':kind/:filename')
  @ApiOperation({
    summary: 'Download a stored file',
    description:
      'Pictures, logos and attachments: any logged-in user. CVs: employers, or the student who owns the CV.',
  })
  async download(
    @Param('kind') kind: string,
    @Param('filename') filename: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.storage.isValid(kind, filename)) {
      throw new NotFoundException('File not found');
    }
    const fileKind = kind as FileKind;
    const url = this.storage.urlFor(fileKind, filename);
    if (!(await this.uploadsService.canAccess(user, fileKind, url))) {
      throw new ForbiddenException('You cannot access this file');
    }

    const path = this.storage.absolutePath(fileKind, filename);
    await access(path).catch(() => {
      throw new NotFoundException('File not found');
    });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(path);
  }
}
