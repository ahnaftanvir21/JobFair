import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployersModule } from '../employers/employers.module.js';
import { EmployerProfile } from '../employers/entities/employer-profile.entity.js';
import { StudentsModule } from '../students/students.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { CvDropsController } from './cv-drops.controller.js';
import { CvDropsService } from './cv-drops.service.js';
import { CvDrop } from './entities/cv-drop.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([CvDrop, EmployerProfile]),
    StudentsModule,
    EmployersModule,
    UploadsModule,
  ],
  controllers: [CvDropsController],
  providers: [CvDropsService],
})
export class CvDropsModule {}
