import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobPost } from '../jobs/entities/job-post.entity.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { EmployersController } from './employers.controller.js';
import { EmployersService } from './employers.service.js';
import { EmployerProfile } from './entities/employer-profile.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmployerProfile, JobPost]),
    UploadsModule,
  ],
  controllers: [EmployersController],
  providers: [EmployersService],
  exports: [EmployersService],
})
export class EmployersModule {}
