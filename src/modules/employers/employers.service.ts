import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { paginated, type Paginated } from '../../common/dto/pagination.dto.js';
import { todayInDhaka } from '../../common/utils/date.util.js';
import { likePattern } from '../../common/utils/text.util.js';
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

@Injectable()
export class EmployersService {
  constructor(
    @InjectRepository(EmployerProfile)
    private readonly profiles: Repository<EmployerProfile>,
    @InjectRepository(JobPost)
    private readonly jobs: Repository<JobPost>,
    private readonly storage: FileStorageService,
  ) {}

  async create(
    userId: string,
    dto: CreateEmployerProfileDto,
  ): Promise<EmployerProfile> {
    if (await this.profiles.existsBy({ userId })) {
      throw new ConflictException(
        'Company profile already exists. Use PATCH /employers/me to change it.',
      );
    }
    return this.profiles.save(this.profiles.create({ ...dto, userId }));
  }

  async update(
    userId: string,
    dto: UpdateEmployerProfileDto,
  ): Promise<EmployerProfile> {
    assertNotNull(dto, REQUIRED_EMPLOYER_FIELDS);
    const profile = await this.requireProfileByUser(userId);
    return this.profiles.save(this.profiles.merge(profile, dto));
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
      throw new NotFoundException(
        'Create your company profile first with POST /employers/me',
      );
    }
    return profile;
  }

  /** Company search for students: "Search company you're looking for". */
  async search(
    query: SearchEmployersQueryDto,
  ): Promise<Paginated<EmployerSummary>> {
    const qb = this.profiles
      .createQueryBuilder('e')
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
      items.map((e) => ({ ...e, openJobCount: counts.get(e.id) ?? 0 })),
      total,
      query,
    );
  }

  /** Company page with its open job posts. */
  async getById(id: string): Promise<EmployerDetail> {
    const profile = await this.profiles.findOneBy({ id });
    if (!profile) throw new NotFoundException('Company not found');
    const openJobs = await this.jobs
      .createQueryBuilder('j')
      .where('j.employerId = :id', { id })
      .andWhere('j.isActive = true AND j.deadline >= :today', {
        today: todayInDhaka(),
      })
      .orderBy('j.deadline', 'ASC')
      .getMany();
    return { ...profile, openJobs };
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
