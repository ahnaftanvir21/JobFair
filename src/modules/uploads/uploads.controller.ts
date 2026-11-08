import {
  Controller,
  ForbiddenException,
  UnauthorizedException,
  Get,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, OptionalAuth } from '../../common/decorators/index.js';
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
  @OptionalAuth()
  @ApiOperation({
    summary: 'Download a stored file',
    description:
      'Logos: anyone. Attachments: any logged-in user. Pictures: students, or a company the student applied or sent a CV to. CVs: the student who owns the CV, or a company the student applied or sent a CV to.',
  })
  async download(
    @Param('kind') kind: string,
    @Param('filename') filename: string,
    @CurrentUser() user: AuthUser | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.storage.isValid(kind, filename)) {
      throw new NotFoundException('File not found');
    }
    const fileKind = kind as FileKind;
    const url = this.storage.urlFor(fileKind, filename);
    // Company logos appear on the public job list; everything else needs login.
    if (fileKind !== FileKind.LOGO) {
      if (!user) throw new UnauthorizedException('Log in to view this file');
      if (!(await this.uploadsService.canAccess(user, fileKind, url))) {
        throw new ForbiddenException('You cannot access this file');
      }
    }

    const file = await this.storage.read(fileKind, filename);
    if (!file) throw new NotFoundException('File not found');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', file.contentType);
    res.send(file.data);
  }
}
