import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  paginated,
  PaginationQueryDto,
  type Paginated,
} from '../../common/dto/pagination.dto.js';
import {
  EmployerStatus,
  QuestionType,
  UserRole,
} from '../../common/enums/index.js';
import { FairService } from '../../common/fair/fair.service.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import {
  isOnOrBeforeDeadline,
  todayInDhaka,
} from '../../common/utils/date.util.js';
import { likePattern } from '../../common/utils/text.util.js';
import { assertNotNull } from '../../common/utils/validation.util.js';
import { Application } from '../applications/entities/application.entity.js';
import {
  EmployersService,
  toPublicEmployer,
} from '../employers/employers.service.js';
import {
  CreateJobDto,
  JobQuestionDto,
  REQUIRED_JOB_FIELDS,
  SearchJobsQueryDto,
  UpdateJobDto,
} from './dto/job.dto.js';
import { JobPost } from './entities/job-post.entity.js';
import { JobQuestion } from './entities/job-question.entity.js';

export const DEFAULT_COMPENSATION = 'As per company policy';

export type JobView = JobPost & {
  isOpen: boolean;
  /** For students: their application on this job, if any. */
  myApplication?: { id: string; status: string } | null;
};

export type OwnJobView = JobPost & {
  isOpen: boolean;
  applicationCount: number;
};

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(JobPost) private readonly jobs: Repository<JobPost>,
    @InjectRepository(Application)
    private readonly applications: Repository<Application>,
    private readonly employers: EmployersService,
    private readonly fair: FairService,
    private readonly dataSource: DataSource,
  ) {}

  isOpen(job: Pick<JobPost, 'isActive' | 'deadline'>): boolean {
    return job.isActive && isOnOrBeforeDeadline(job.deadline);
  }

  // ---------- Employer ----------

  async create(userId: string, dto: CreateJobDto): Promise<JobView> {
    this.fair.assertEmployerWindowOpen('Posting new jobs');
    const employer = await this.employers.requireProfileByUser(userId);
    this.assertDeadlineNotPast(dto.deadline);
    this.assertSalary(dto.salaryNegotiable, dto.salaryAmount);

    const { questions, ...fields } = dto;
    const job = this.jobs.create({
      ...fields,
      salaryAmount: dto.salaryNegotiable ? null : dto.salaryAmount,
      compensationAndBenefits:
        dto.compensationAndBenefits ?? DEFAULT_COMPENSATION,
      employerId: employer.id,
      questions: this.buildQuestions(questions ?? []),
    });
    const saved = await this.jobs.save(job);
    return this.getById(saved.id);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateJobDto,
  ): Promise<JobView> {
    assertNotNull(dto, REQUIRED_JOB_FIELDS);
    const job = await this.requireOwnJob(userId, id);
    if (dto.deadline && dto.deadline !== job.deadline) {
      this.assertDeadlineNotPast(dto.deadline);
    }

    const { questions, compensationAndBenefits, ...fields } = dto;
    this.jobs.merge(job, fields);
    this.assertSalary(job.salaryNegotiable, job.salaryAmount);
    if (job.salaryNegotiable) job.salaryAmount = null;
    if (compensationAndBenefits !== undefined) {
      // Clearing it falls back to the default text.
      job.compensationAndBenefits =
        compensationAndBenefits ?? DEFAULT_COMPENSATION;
    }

    await this.dataSource.transaction(async (manager) => {
      if (questions) {
        const applied = await manager.countBy(Application, { jobPostId: id });
        if (applied > 0) {
          throw new ConflictException(
            'Questions cannot be changed after students have applied',
          );
        }
        await manager.delete(JobQuestion, { jobPostId: id });
        await manager.save(
          JobQuestion,
          this.buildQuestions(questions).map((q) => ({ ...q, jobPostId: id })),
        );
      }
      // Write only the changed columns; questions were handled above.
      await manager.update(JobPost, id, {
        ...fields,
        salaryAmount: job.salaryAmount,
        compensationAndBenefits: job.compensationAndBenefits,
      });
    });
    return this.getById(id);
  }

  async close(userId: string, id: string): Promise<JobView> {
    const job = await this.requireOwnJob(userId, id);
    await this.jobs.update(job.id, { isActive: false });
    return this.getById(id);
  }

  /** Takes a closed job back to accepting applications. Its deadline must not have passed. */
  async reopen(userId: string, id: string): Promise<JobView> {
    const job = await this.requireOwnJob(userId, id);
    if (!isOnOrBeforeDeadline(job.deadline)) {
      throw new BadRequestException(
        'The deadline has passed. Change the deadline to reopen this job.',
      );
    }
    await this.jobs.update(job.id, { isActive: true });
    return this.getById(id);
  }

  async mine(
    userId: string,
    query: PaginationQueryDto,
  ): Promise<Paginated<OwnJobView>> {
    const employer = await this.employers.requireProfileByUser(userId);
    const [items, total] = await this.jobs.findAndCount({
      where: { employerId: employer.id },
      relations: { questions: true },
      order: { createdAt: 'DESC', questions: { order: 'ASC' } },
      skip: query.skip,
      take: query.limit,
    });
    const counts = await this.applicationCounts(items.map((j) => j.id));
    return paginated(
      items.map((j) => ({
        ...j,
        isOpen: this.isOpen(j),
        applicationCount: counts.get(j.id) ?? 0,
      })),
      total,
      query,
    );
  }

  // ---------- Everyone (logged in) ----------

  /** Open jobs only: active and deadline not passed. */
  async search(query: SearchJobsQueryDto): Promise<Paginated<JobView>> {
    const qb = this.jobs
      .createQueryBuilder('j')
      .innerJoin('j.employer', 'e')
      .addSelect([
        'e.id',
        'e.companyName',
        'e.logoUrl',
        'e.industryType',
        'e.websiteUrl',
      ])
      .where('j.isActive = true AND j.deadline >= :today', {
        today: todayInDhaka(),
      })
      .andWhere('e.status = :approved', { approved: EmployerStatus.APPROVED })
      .orderBy('j.createdAt', 'DESC')
      .skip(query.skip)
      .take(query.limit);

    if (query.q) {
      qb.andWhere('(j.positionName ILIKE :q OR e.companyName ILIKE :q)', {
        q: likePattern(query.q),
      });
    }
    if (query.location) {
      qb.andWhere('j.location = :location', { location: query.location });
    }
    if (query.workplace) {
      qb.andWhere('j.workplace = :workplace', { workplace: query.workplace });
    }
    if (query.employmentStatus) {
      qb.andWhere('j.employmentStatus = :status', {
        status: query.employmentStatus,
      });
    }
    if (query.industry) {
      qb.andWhere('e.industryType ILIKE :industry', {
        industry: likePattern(query.industry),
      });
    }
    if (query.employerId) {
      qb.andWhere('j.employerId = :employerId', {
        employerId: query.employerId,
      });
    }

    const [items, total] = await qb.getManyAndCount();
    return paginated(
      items.map((j) => ({ ...j, isOpen: true })),
      total,
      query,
    );
  }

  /** Job details with questions. Students also see whether they applied. */
  async getById(id: string, viewer?: AuthUser): Promise<JobView> {
    const job = await this.jobs.findOne({
      where: { id },
      relations: { questions: true, employer: true },
      order: { questions: { order: 'ASC' } },
    });
    if (!job) throw new NotFoundException('Job not found');
    // Jobs of companies not approved are visible only to that company and admins.
    if (
      job.employer.status !== EmployerStatus.APPROVED &&
      job.employer.userId !== viewer?.id &&
      viewer?.role !== UserRole.ADMIN
    ) {
      throw new NotFoundException('Job not found');
    }

    const view: JobView = { ...job, isOpen: this.isOpen(job) };
    if (viewer?.role === UserRole.STUDENT) {
      const application = await this.applications
        .createQueryBuilder('a')
        .innerJoin('a.student', 's')
        .select(['a.id', 'a.status'])
        .where('a.jobPostId = :id AND s.userId = :userId', {
          id,
          userId: viewer.id,
        })
        .getOne();
      view.myApplication = application
        ? { id: application.id, status: application.status }
        : null;
    }
    return view;
  }

  /** Job details as the person asking may see them. Visitors get public company fields only. */
  async getForViewer(id: string, viewer?: AuthUser): Promise<JobView> {
    const view = await this.getById(id, viewer);
    if (viewer) return view;
    return { ...view, employer: toPublicEmployer(view.employer) };
  }

  // ---------- Used by other modules ----------

  /** The job with its questions, or an error if it is closed. */
  async requireOpenJob(id: string): Promise<JobPost> {
    const job = await this.jobs.findOne({
      where: { id },
      relations: { questions: true, employer: true },
      order: { questions: { order: 'ASC' } },
    });
    if (!job || job.employer.status !== EmployerStatus.APPROVED) {
      throw new NotFoundException('Job not found');
    }
    if (!this.isOpen(job)) {
      throw new BadRequestException('This job is closed for applications');
    }
    return job;
  }

  async requireOwnJob(userId: string, id: string): Promise<JobPost> {
    const employer = await this.employers.requireProfileByUser(userId);
    const job = await this.jobs.findOneBy({ id });
    if (!job) throw new NotFoundException('Job not found');
    if (job.employerId !== employer.id) {
      throw new ForbiddenException('This job belongs to another company');
    }
    return job;
  }

  // ---------- Helpers ----------

  private buildQuestions(input: JobQuestionDto[]): JobQuestion[] {
    return input.map((q, index) => {
      const type = q.type ?? QuestionType.TEXT;
      const options =
        type === QuestionType.SINGLE_CHOICE ? (q.options ?? []) : [];
      if (type === QuestionType.SINGLE_CHOICE) {
        const unique = new Set(options.map((o) => o.toLowerCase()));
        if (options.length < 2 || unique.size !== options.length) {
          throw new BadRequestException(
            `Question ${index + 1}: single_choice needs at least 2 different options`,
          );
        }
      }
      const question = new JobQuestion();
      question.text = q.text;
      question.type = type;
      question.options = options;
      question.isRequired = q.isRequired ?? true;
      question.order = index + 1;
      return question;
    });
  }

  private assertDeadlineNotPast(deadline: string): void {
    if (!isOnOrBeforeDeadline(deadline)) {
      throw new BadRequestException('Deadline cannot be in the past');
    }
  }

  private assertSalary(negotiable: boolean, amount?: string | null): void {
    if (!negotiable && !amount) {
      throw new BadRequestException(
        'Give a salaryAmount, or set salaryNegotiable to true',
      );
    }
  }

  private async applicationCounts(ids: string[]): Promise<Map<string, number>> {
    if (!ids.length) return new Map();
    const rows = await this.applications
      .createQueryBuilder('a')
      .select('a.jobPostId', 'jobPostId')
      .addSelect('COUNT(*)', 'count')
      .where('a.jobPostId IN (:...ids)', { ids })
      .groupBy('a.jobPostId')
      .getRawMany<{ jobPostId: string; count: string }>();
    return new Map(rows.map((r) => [r.jobPostId, Number(r.count)]));
  }
}
