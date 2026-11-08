import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentProfile } from '../students/entities/student-profile.entity.js';
import { AlumniController } from './alumni.controller.js';
import { AlumniService } from './alumni.service.js';
import { CurrentStudentListController } from './current-student-list.controller.js';
import { CurrentStudentListService } from './current-student-list.service.js';
import { AlumniRecord } from './entities/alumni-record.entity.js';
import { CurrentStudentRecord } from './entities/current-student-record.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([AlumniRecord, CurrentStudentRecord, StudentProfile]),
  ],
  controllers: [AlumniController, CurrentStudentListController],
  providers: [AlumniService, CurrentStudentListService],
  exports: [AlumniService, CurrentStudentListService],
})
export class AlumniModule {}
