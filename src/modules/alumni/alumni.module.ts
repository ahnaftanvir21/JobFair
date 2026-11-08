import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentProfile } from '../students/entities/student-profile.entity.js';
import { AlumniController } from './alumni.controller.js';
import { AlumniService } from './alumni.service.js';
import { AlumniRecord } from './entities/alumni-record.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([AlumniRecord, StudentProfile])],
  controllers: [AlumniController],
  providers: [AlumniService],
  exports: [AlumniService],
})
export class AlumniModule {}
