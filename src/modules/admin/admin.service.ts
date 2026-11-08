import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, IsNull, Not, Repository } from 'typeorm';
import { paginated, type Paginated } from '../../common/dto/pagination.dto.js';
import { ApplicationStatus, EmployerStatus } from '../../common/enums/index.js';
import {
  isOnOrBeforeDeadline,
  todayInDhaka,
} from '../../common/utils/date.util.js';
import { likePattern } from '../../common/utils/text.util.js';
import { Application } from '../applications/entities/application.entity.js';
import { CandidateCriteria } from '../candidate-criteria/entities/candidate-criteria.entity.js';
import { CvDrop } from '../cv-drops/entities/cv-drop.entity.js';
import { EmployerProfile } from '../employers/entities/employer-profile.entity.js';
import { JobPost } from '../jobs/entities/job-post.entity.js';
import { MailService } from '../mail/mail.service.js';
import { StudentProfile } from '../students/entities/student-profile.entity.js';
import { AdminEmployersQueryDto, RejectEmployerDto } from './dto/admin.dto.js';

/** Open = active and deadline today or later (Dhaka time). */
const OPEN_JOB_SQL = 'j.isActive = true AND j.deadline >= :today';

export type AdminEmployerSummary = EmployerProfile & {
  jobCount: number;
  openJobCount: number;
};
export type AdminJobView = JobPost & {
  isOpen: boolean;
  applicationCount: number;
};

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(StudentProfile)
    private readonly students: Repository<StudentProfile>,
    @InjectRepository(EmployerProfile)
    private readonly employers: Repository<EmployerProfile>,
    @InjectRepository(JobPost) private readonly jobs: Repository<JobPost>,
    @InjectRepository(Application)
    private readonly applications: Repository<Application>,
    @InjectRepository(CvDrop) private readonly cvDrops: Repository<CvDrop>,
    @InjectRepository(CandidateCriteria)
    private readonly criteria: Repository<CandidateCriteria>,
    private readonly mail: MailService,
  ) {}

  // ---------- Overview ----------

  async stats() {
    const today = todayInDhaka();
    const [
      studentsTotal,
      studentsWithCv,
      seminarParticipants,
      employerRows,
      jobsTotal,
      jobsOpen,
      applicationRows,
      cvDropsTotal,
      cvDropsToPool,
      criteriaTotal,
      facultyRows,
    ] = await Promise.all([
      this.students.count(),
      this.students.countBy({ cvUrl: Not(IsNull()) }),
      this.students.countBy({ seminarParticipation: true }),
      this.employers
        .createQueryBuilder('e')
        .innerJoin('e.user', 'u')
        .where('u.emailVerified = true')
        .select('e.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('e.status')
        .getRawMany<{ status: EmployerStatus; count: string }>(),
      this.jobs.count(),
      this.jobs
        .createQueryBuilder('j')
        .where(OPEN_JOB_SQL, { today })
        .getCount(),
      this.applications
        .createQueryBuilder('a')
        .select('a.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('a.status')
        .getRawMany<{ status: ApplicationStatus; count: string }>(),
      this.cvDrops.count(),
      this.cvDrops.countBy({ employerId: IsNull() }),
      this.criteria.count(),
      this.students
        .createQueryBuilder('s')
        .select('s.faculty', 'faculty')
        .addSelect('s.program', 'program')
        .addSelect('s.isAlumni', 'isAlumni')
        .addSelect('COUNT(*)', 'count')
        .groupBy('s.faculty')
        .addGroupBy('s.program')
        .addGroupBy('s.isAlumni')
        .getRawMany<FacultyRow>(),
    ]);

    const employersByStatus = countByKey(
      Object.values(EmployerStatus),
      employerRows,
    );
    const applicationsByStatus = countByKey(
      Object.values(ApplicationStatus),
      applicationRows,
    );
    return {
      students: {
        total: studentsTotal,
        withCv: studentsWithCv,
        seminarParticipants,
        alumni: facultyRows
          .filter((r) => r.isAlumni)
          .reduce((n, r) => n + Number(r.count), 0),
        byFaculty: groupByFaculty(facultyRows),
      },
      employers: {
        total: sum(employersByStatus),
        ...employersByStatus,
      },
      jobs: { total: jobsTotal, open: jobsOpen, closed: jobsTotal - jobsOpen },
      applications: {
        total: sum(applicationsByStatus),
        ...applicationsByStatus,
      },
      cvDrops: {
        total: cvDropsTotal,
        toPool: cvDropsToPool,
        toCompanies: cvDropsTotal - cvDropsToPool,
      },
      candidateCriteria: { total: criteriaTotal },
    };
  }

  // ---------- Employers ----------

  /** Every company with its login email. Oldest pending first when filtering by pending. */
  async listEmployers(
    query: AdminEmployersQueryDto,
  ): Promise<Paginated<AdminEmployerSummary>> {
    const qb = this.employers
      .createQueryBuilder('e')
      .innerJoin('e.user', 'u')
      .addSelect(['u.id', 'u.email', 'u.createdAt'])
      // Companies that have not verified their email are not shown until they do.
      .where('u.emailVerified = true')
      .orderBy(
        'e.createdAt',
        query.status === EmployerStatus.PENDING ? 'ASC' : 'DESC',
      )
      .skip(query.skip)
      .take(query.limit);
    if (query.status) {
      qb.andWhere('e.status = :status', { status: query.status });
    }
    if (query.q) {
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('e.companyName ILIKE :q')
            .orWhere('u.email ILIKE :q')
            .orWhere('e.hrName ILIKE :q'),
        ),
        { q: likePattern(query.q) },
      );
    }
    const [items, total] = await qb.getManyAndCount();
    const counts = await this.jobCounts(items.map((e) => e.id));
    return paginated(
      items.map((e) => ({
        ...e,
        jobCount: counts.get(e.id)?.total ?? 0,
        openJobCount: counts.get(e.id)?.open ?? 0,
      })),
      total,
      query,
    );
  }

  /** One company with login email, all its jobs and what it has received. */
  async getEmployer(id: string) {
    const employer = await this.requireEmployer(id);
    const [jobs, criteriaCount, cvDropsReceived] = await Promise.all([
      this.jobs.find({
        where: { employerId: id },
        order: { createdAt: 'DESC' },
      }),
      this.criteria.countBy({ employerId: id }),
      this.cvDrops.countBy({ employerId: id }),
    ]);
    const appCounts = await this.applicationCounts(jobs.map((j) => j.id));
    return {
      ...employer,
      jobs: jobs.map((j) => this.toJobView(j, appCounts)),
      candidateCriteriaCount: criteriaCount,
      cvDropsReceived,
    };
  }

  async approveEmployer(id: string): Promise<EmployerProfile> {
    const employer = await this.requireEmployer(id);
    await this.employers.update(id, {
      status: EmployerStatus.APPROVED,
      rejectionReason: null,
      reviewedAt: new Date(),
    });
    this.notify(
      employer.user.email,
      `${employer.companyName} is approved for AIUB Job Fair 2026`,
      `Good news: the AIUB Office of Placement & Alumni approved ${employer.companyName} for AIUB Job Fair 2026.\n\n` +
        `Log in to post jobs or candidate criteria, browse students and review applicants.`,
    );
    return this.requireEmployer(id);
  }

  async rejectEmployer(
    id: string,
    dto: RejectEmployerDto,
  ): Promise<EmployerProfile> {
    const employer = await this.requireEmployer(id);
    await this.employers.update(id, {
      status: EmployerStatus.REJECTED,
      rejectionReason: dto.reason,
      reviewedAt: new Date(),
    });
    this.notify(
      employer.user.email,
      `${employer.companyName} was not approved for AIUB Job Fair 2026`,
      `The AIUB Office of Placement & Alumni did not approve ${employer.companyName} for AIUB Job Fair 2026.\n\n` +
        `Reason: ${dto.reason}\n\n` +
        `Log in and update your company profile to send it for review again.`,
    );
    return this.requireEmployer(id);
  }

  // ---------- Helpers ----------

  private async requireEmployer(id: string) {
    const employer = await this.employers
      .createQueryBuilder('e')
      .innerJoin('e.user', 'u')
      .addSelect(['u.id', 'u.email', 'u.createdAt'])
      .where('e.id = :id', { id })
      .andWhere('u.emailVerified = true')
      .getOne();
    if (!employer) throw new NotFoundException('Company not found');
    return employer;
  }

  private toJobView(job: JobPost, counts: Map<string, number>): AdminJobView {
    return {
      ...job,
      isOpen: job.isActive && isOnOrBeforeDeadline(job.deadline),
      applicationCount: counts.get(job.id) ?? 0,
    };
  }

  private async jobCounts(
    employerIds: string[],
  ): Promise<Map<string, { total: number; open: number }>> {
    if (!employerIds.length) return new Map();
    const rows = await this.jobs
      .createQueryBuilder('j')
      .select('j.employerId', 'employerId')
      .addSelect('COUNT(*)', 'total')
      .addSelect(`COUNT(*) FILTER (WHERE ${OPEN_JOB_SQL})`, 'open')
      .where('j.employerId IN (:...employerIds)', { employerIds })
      .setParameter('today', todayInDhaka())
      .groupBy('j.employerId')
      .getRawMany<{ employerId: string; total: string; open: string }>();
    return new Map(
      rows.map((r) => [
        r.employerId,
        { total: Number(r.total), open: Number(r.open) },
      ]),
    );
  }

  private async applicationCounts(
    jobIds: string[],
  ): Promise<Map<string, number>> {
    if (!jobIds.length) return new Map();
    const rows = await this.applications
      .createQueryBuilder('a')
      .select('a.jobPostId', 'jobPostId')
      .addSelect('COUNT(*)', 'count')
      .where('a.jobPostId IN (:...jobIds)', { jobIds })
      .groupBy('a.jobPostId')
      .getRawMany<{ jobPostId: string; count: string }>();
    return new Map(rows.map((r) => [r.jobPostId, Number(r.count)]));
  }

  /** Sends in the background; a mail failure must not undo the review. */
  private notify(to: string, subject: string, text: string): void {
    const html = text
      .split('\n\n')
      .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
      .join('');
    this.mail
      .send({ to, subject, text, html })
      .catch((err: Error) =>
        this.logger.error(`Could not email ${to}: ${err.message}`),
      );
  }
}

function countByKey<K extends string>(
  keys: K[],
  rows: { status: K; count: string }[],
): Record<K, number> {
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  for (const row of rows) out[row.status] = Number(row.count);
  return out;
}

type FacultyRow = {
  faculty: string | null;
  program: string | null;
  isAlumni: boolean;
  count: string;
};

export interface FacultyCount {
  /** Null: accounts made before faculty was asked. */
  faculty: string | null;
  total: number;
  alumni: number;
  current: number;
  programs: { program: string | null; total: number; alumni: number }[];
}

/** Registered students per faculty and program, biggest first. */
function groupByFaculty(rows: FacultyRow[]): FacultyCount[] {
  const faculties = new Map<string | null, FacultyCount>();
  for (const row of rows) {
    const n = Number(row.count);
    let f = faculties.get(row.faculty);
    if (!f) {
      f = { faculty: row.faculty, total: 0, alumni: 0, current: 0, programs: [] };
      faculties.set(row.faculty, f);
    }
    f.total += n;
    if (row.isAlumni) f.alumni += n;
    else f.current += n;
    let p = f.programs.find((x) => x.program === row.program);
    if (!p) {
      p = { program: row.program, total: 0, alumni: 0 };
      f.programs.push(p);
    }
    p.total += n;
    if (row.isAlumni) p.alumni += n;
  }
  const byTotal = (a: { total: number }, b: { total: number }) => b.total - a.total;
  return [...faculties.values()]
    .map((f) => ({ ...f, programs: f.programs.sort(byTotal) }))
    .sort((a, b) =>
      // "Not set" last.
      a.faculty === null ? 1 : b.faculty === null ? -1 : byTotal(a, b),
    );
}

function sum(record: Record<string, number>): number {
  return Object.values(record).reduce((a, b) => a + b, 0);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
