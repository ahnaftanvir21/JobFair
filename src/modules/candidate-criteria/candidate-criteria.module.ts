import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployersModule } from '../employers/employers.module.js';
import { StudentsModule } from '../students/students.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { CandidateCriteriaController } from './candidate-criteria.controller.js';
import { CandidateCriteriaService } from './candidate-criteria.service.js';
import { CandidateCriteria } from './entities/candidate-criteria.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([CandidateCriteria]),
    EmployersModule,
    StudentsModule,
    UploadsModule,
  ],
  controllers: [CandidateCriteriaController],
  providers: [CandidateCriteriaService],
})
export class CandidateCriteriaModule {}
