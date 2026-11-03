import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadsModule } from '../uploads/uploads.module.js';
import { Education } from './entities/education.entity.js';
import { Experience } from './entities/experience.entity.js';
import { Reference } from './entities/reference.entity.js';
import { StudentProfile } from './entities/student-profile.entity.js';
import { StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StudentProfile,
      Education,
      Experience,
      Reference,
    ]),
    UploadsModule,
  ],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
