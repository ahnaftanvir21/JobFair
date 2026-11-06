import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { paginated, type Paginated } from '../../common/dto/pagination.dto.js';
import { EmployerStatus } from '../../common/enums/index.js';
import { todayInDhaka } from '../../common/utils/date.util.js';
import { likePattern } from '../../common/utils/text.util.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { assertNotNull } from '../../common/utils/validation.util.js';
import { JobPost } from '../jobs/entities/job-post.entity.js';
import { FileKind } from '../uploads/file-kind.enum.js';
import {
  FileStorageService,
  type UploadedFileLike,
} from '../uploads/file-storage.service.js';
import {
  CreateEmployerProfileDto,
  REQUIRED_EMPLOYER_FIELDS,
  SearchEmployersQueryDto,
  UpdateEmployerProfileDto,
} from './dto/index.js';
import { EmployerProfile } from './entities/employer-profile.entity.js';

export type EmployerSummary = EmployerProfile & { openJobCount: number };
export type EmployerDetail = EmployerProfile & { openJobs: JobPost[] };

/** Company fields anyone may see, without logging in. */
export const PUBLIC_EMPLOYER_FIELDS = [
  'id',
  'companyName',
  'websiteUrl',
  'logoUrl',
  'industryType',
  'about',
  'hasOngoingHiring',
  'boothNumber',
] as const;

/** Keeps only the public fields (no HR contact or login id). */
export function toPublicEmployer<T extends Partial<EmployerProfile>>(
  employer: T,
): T {
  const out: Record<string, unknown> = {};
  for (const key of PUBLIC_EMPLOYER_FIELDS) out[key] = employer[key];
  return out as T;
}

@Injectable()
export class EmployersService {
  constructor(
    @InjectRepository(EmployerProfile)
    private readonly profiles: Repository<EmployerProfile>,
    @InjectRepository(JobPost)
    private readonly jobs: Repository<JobPost>,
    private readonly storage: FileStorageService,
  ) {}

  /** Runs inside the registration transaction, so a failure also undoes the account. */
  async createForUser(
    manager: EntityManager,
    userId: string,
    dto: CreateEmployerProfileDto,
  ): Promise<void> {
    // New companies wait for the admin.
    await manager.save(
      manager.create(EmployerProfile, {
        ...dto,
        userId,
        status: EmployerStatus.PENDING,
      }),
    );
  }

  async update(
    userId: string,
    dto: UpdateEmployerProfileDto,
  ): Promise<EmployerProfile> {
    assertNotNull(dto, REQUIRED_EMPLOYER_FIELDS);
    const profile = await this.requireProfileByUser(userId);
    this.profiles.merge(profile, dto);
    // Editing after a rejection sends the company back to the admin for review.
    if (profile.status === EmployerStatus.REJECTED) {
      profile.status = EmployerStatus.PENDING;
      profile.rejectionReason = null;
    }
    return this.profiles.save(profile);
  }

  getOwn(userId: string): Promise<EmployerProfile> {
    return this.requireProfileByUser(userId);
  }

  async setLogo(
    userId: string,
    file: UploadedFileLike | undefined,
  ): Promise<EmployerProfile> {
    const profile = await this.requireProfileByUser(userId);
    const url = await this.storage.save(file, FileKind.LOGO);
    const old = profile.logoUrl;
    profile.logoUrl = url;
    const saved = await this.profiles.save(profile);
    await this.storage.remove(old);
    return saved;
  }

  async requireProfileByUser(userId: string): Promise<EmployerProfile> {
    const profile = await this.profiles.findOneBy({ userId });
    if (!profile) {
      throw new NotFoundException('Company profile not found');
    }
    return profile;
  }

  /** Company search for students: "Search company you're looking for". */
  async search(
    query: SearchEmployersQueryDto,
    viewer?: AuthUser,
  ): Promise<Paginated<EmployerSummary>> {
    const qb = this.profiles
      .createQueryBuilder('e')
      .where('e.status = :approved', { approved: EmployerStatus.APPROVED })
      .orderBy('e.companyName', 'ASC')
      .skip(query.skip)
      .take(query.limit);
    if (query.q) {
      qb.andWhere('e.companyName ILIKE :q', { q: likePattern(query.q) });
    }
    if (query.industry) {
      qb.andWhere('e.industryType ILIKE :industry', {
        industry: likePattern(query.industry),
      });
    }
    if (query.hiring !== undefined) {
      qb.andWhere('e.hasOngoingHiring = :hiring', { hiring: query.hiring });
    }

    const [items, total] = await qb.getManyAndCount();
    const counts = await this.openJobCounts(items.map((e) => e.id));
    return paginated(
      items.map((e) => ({
        ...(viewer ? e : toPublicEmployer(e)),
        openJobCount: counts.get(e.id) ?? 0,
      })),
      total,
      query,
    );
  }

  /** Company page with its open job posts. */
  async getById(id: string, viewer?: AuthUser): Promise<EmployerDetail> {
    const profile = await this.profiles.findOneBy({
      id,
      status: EmployerStatus.APPROVED,
    });
    if (!profile) throw new NotFoundException('Company not found');
    const openJobs = await this.jobs
      .createQueryBuilder('j')
      .where('j.employerId = :id', { id })
      .andWhere('j.isActive = true AND j.deadline >= :today', {
        today: todayInDhaka(),
      })
      .orderBy('j.deadline', 'ASC')
      .getMany();
    return { ...(viewer ? profile : toPublicEmployer(profile)), openJobs };
  }

  private async openJobCounts(ids: string[]): Promise<Map<string, number>> {
    if (!ids.length) return new Map();
    const rows = await this.jobs
      .createQueryBuilder('j')
      .select('j.employerId', 'employerId')
      .addSelect('COUNT(*)', 'count')
      .where('j.employerId IN (:...ids)', { ids })
      .andWhere('j.isActive = true AND j.deadline >= :today', {
        today: todayInDhaka(),
      })
      .groupBy('j.employerId')
      .getRawMany<{ employerId: string; count: string }>();
    return new Map(rows.map((r) => [r.employerId, Number(r.count)]));
  }
}
