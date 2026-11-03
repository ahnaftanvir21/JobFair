import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobsModule } from '../jobs/jobs.module.js';
import { StudentsModule } from '../students/students.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { ApplicationsController } from './applications.controller.js';
import { ApplicationsService } from './applications.service.js';
import { ApplicationAnswer } from './entities/application-answer.entity.js';
import { Application } from './entities/application.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Application, ApplicationAnswer]),
    JobsModule,
    StudentsModule,
    UploadsModule,
  ],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
})
export class ApplicationsModule {}
