import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, type TypeOrmModuleOptions } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { FairModule } from './common/fair/fair.module.js';
import { JwtAuthGuard, RolesGuard } from './common/guards/index.js';
import { authConfig, databaseConfig, fairConfig } from './config/index.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { StudentsModule } from './modules/students/students.module.js';
import { EmployersModule } from './modules/employers/employers.module.js';
import { JobsModule } from './modules/jobs/jobs.module.js';
import { ApplicationsModule } from './modules/applications/applications.module.js';
import { CvDropsModule } from './modules/cv-drops/cv-drops.module.js';
import { CandidateCriteriaModule } from './modules/candidate-criteria/candidate-criteria.module.js';
import { UploadsModule } from './modules/uploads/uploads.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [authConfig, databaseConfig, fairConfig],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.getOrThrow<TypeOrmModuleOptions>('database'),
    }),
    FairModule,
    AuthModule,
    UsersModule,
    StudentsModule,
    EmployersModule,
    JobsModule,
    ApplicationsModule,
    CvDropsModule,
    CandidateCriteriaModule,
    UploadsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Order matters: authenticate first, then check roles.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
