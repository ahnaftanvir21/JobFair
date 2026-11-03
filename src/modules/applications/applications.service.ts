import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { paginated, type Paginated } from '../../common/dto/pagination.dto.js';
import { FairService } from '../../common/fair/fair.service.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { JobsService } from '../jobs/jobs.service.js';
import { StudentsService } from '../students/students.service.js';
import { FileKind } from '../uploads/file-kind.enum.js';
import {
  FileStorageService,
  type UploadedFileLike,
} from '../uploads/file-storage.service.js';
import { validateAnswers } from './answer-validator.js';
import {
  ApplyDto,
  ListApplicationsQueryDto,
  UpdateApplicationStatusDto,
} from './dto/application.dto.js';
import { ApplicationAnswer } from './entities/application-answer.entity.js';
import { Application } from './entities/application.entity.js';

const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectRepository(Application)
    private readonly applications: Repository<Application>,
    private readonly jobs: JobsService,
    private readonly students: StudentsService,
    private readonly storage: FileStorageService,
    private readonly fair: FairService,
  ) {}

  async apply(
    userId: string,
    jobId: string,
    dto: ApplyDto,
    file?: UploadedFileLike,
  ): Promise<Application> {
    this.fair.assertStudentWindowOpen('Applying for jobs');
    const job = await this.jobs.requireOpenJob(jobId);
    const student = await this.students.requireCompleteProfile(userId, {
      cvProvided: Boolean(file),
    });

    if (
      await this.applications.existsBy({
        studentId: student.id,
        jobPostId: job.id,
      })
    ) {
      throw new ConflictException('You have already applied for this job');
    }

    const answers = validateAnswers(job.questions, dto.answers ?? []);

    // Store the new CV only after every check has passed.
    const cvUrl = file
      ? await this.storage.save(file, FileKind.CV)
      : (student.cvUrl as string);

    const application = this.applications.create({
      jobPostId: job.id,
      studentId: student.id,
      joiningDate: dto.joiningDate,
      cvUrl,
      answers: answers.map((a) => Object.assign(new ApplicationAnswer(), a)),
    });

    try {
      const saved = await this.applications.save(application);
      return this.findFull(saved.id);
    } catch (err) {
      if (file) await this.storage.remove(cvUrl);
      if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        throw new ConflictException('You have already applied for this job');
      }
      throw err;
    }
  }

  /** Student: my applications with job and company. */
  async mine(
    userId: string,
    query: ListApplicationsQueryDto,
  ): Promise<Paginated<Application>> {
    const student = await this.students.requireProfileByUser(userId);
    const [items, total] = await this.applications.findAndCount({
      where: {
        studentId: student.id,
        ...(query.status && { status: query.status }),
      },
      relations: { jobPost: { employer: true } },
      order: { createdAt: 'DESC' },
      skip: query.skip,
      take: query.limit,
    });
    return paginated(items, total, query);
  }

  /** Employer: applicants for one of my jobs, with their answers. */
  async forJob(
    userId: string,
    jobId: string,
    query: ListApplicationsQueryDto,
  ): Promise<Paginated<Application>> {
    await this.jobs.requireOwnJob(userId, jobId);
    const [items, total] = await this.applications.findAndCount({
      where: {
        jobPostId: jobId,
        ...(query.status && { status: query.status }),
      },
      relations: { student: { user: true }, answers: { question: true } },
      order: { createdAt: 'ASC', answers: { question: { order: 'ASC' } } },
      skip: query.skip,
      take: query.limit,
    });
    return paginated(items, total, query);
  }

  /** The applicant or the job's company can read an application. */
  async getOne(user: AuthUser, id: string): Promise<Application> {
    const application = await this.findFull(id);
    const isApplicant = application.student.userId === user.id;
    const isOwner = application.jobPost.employer.userId === user.id;
    if (!isApplicant && !isOwner) {
      throw new ForbiddenException('You cannot view this application');
    }
    return application;
  }

  async updateStatus(
    userId: string,
    id: string,
    dto: UpdateApplicationStatusDto,
  ): Promise<Application> {
    const application = await this.findFull(id);
    if (application.jobPost.employer.userId !== userId) {
      throw new ForbiddenException('This application is for another company');
    }
    await this.applications.update(id, { status: dto.status });
    return this.findFull(id);
  }

  private async findFull(id: string): Promise<Application> {
    const application = await this.applications.findOne({
      where: { id },
      relations: {
        jobPost: { employer: true },
        student: { user: true },
        answers: { question: true },
      },
      order: { answers: { question: { order: 'ASC' } } },
    });
    if (!application) throw new NotFoundException('Application not found');
    return application;
  }
}
