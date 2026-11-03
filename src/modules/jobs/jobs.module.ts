import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Application } from '../applications/entities/application.entity.js';
import { EmployersModule } from '../employers/employers.module.js';
import { JobPost } from './entities/job-post.entity.js';
import { JobQuestion } from './entities/job-question.entity.js';
import { JobsController } from './jobs.controller.js';
import { JobsService } from './jobs.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([JobPost, JobQuestion, Application]),
    EmployersModule,
  ],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
