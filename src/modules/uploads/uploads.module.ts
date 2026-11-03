import { Module } from '@nestjs/common';
import { FileStorageService } from './file-storage.service.js';
import { UploadsController } from './uploads.controller.js';
import { UploadsService } from './uploads.service.js';

@Module({
  controllers: [UploadsController],
  providers: [FileStorageService, UploadsService],
  exports: [FileStorageService],
})
export class UploadsModule {}
