import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Application } from '../applications/entities/application.entity.js';
import { CandidateCriteria } from '../candidate-criteria/entities/candidate-criteria.entity.js';
import { CvDrop } from '../cv-drops/entities/cv-drop.entity.js';
import { EmployerProfile } from '../employers/entities/employer-profile.entity.js';
import { JobPost } from '../jobs/entities/job-post.entity.js';
import { StudentProfile } from '../students/entities/student-profile.entity.js';
import { User } from '../users/entities/user.entity.js';
import { AdminAccountService } from './admin-account.service.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StudentProfile,
      EmployerProfile,
      JobPost,
      Application,
      CvDrop,
      CandidateCriteria,
      User,
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminAccountService],
})
export class AdminModule {}
