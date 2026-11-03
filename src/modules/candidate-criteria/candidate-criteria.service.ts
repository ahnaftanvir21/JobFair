import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  paginated,
  PaginationQueryDto,
  type Paginated,
} from '../../common/dto/pagination.dto.js';
import { FairService } from '../../common/fair/fair.service.js';
import { assertNotNull } from '../../common/utils/validation.util.js';
import { EmployersService } from '../employers/employers.service.js';
import { SearchStudentsQueryDto } from '../students/dto/index.js';
import {
  StudentsService,
  type StudentProfileView,
} from '../students/students.service.js';
import { FileKind } from '../uploads/file-kind.enum.js';
import {
  FileStorageService,
  type UploadedFileLike,
} from '../uploads/file-storage.service.js';
import {
  CreateCandidateCriteriaDto,
  ListCandidateCriteriaQueryDto,
  UpdateCandidateCriteriaDto,
} from './dto/candidate-criteria.dto.js';
import { CandidateCriteria } from './entities/candidate-criteria.entity.js';

@Injectable()
export class CandidateCriteriaService {
  constructor(
    @InjectRepository(CandidateCriteria)
    private readonly criteria: Repository<CandidateCriteria>,
    private readonly employers: EmployersService,
    private readonly students: StudentsService,
    private readonly storage: FileStorageService,
    private readonly fair: FairService,
  ) {}

  async create(
    userId: string,
    dto: CreateCandidateCriteriaDto,
  ): Promise<CandidateCriteria> {
    this.fair.assertEmployerWindowOpen('Posting candidate criteria');
    const employer = await this.employers.requireProfileByUser(userId);
    return this.criteria.save(
      this.criteria.create({ ...dto, employerId: employer.id }),
    );
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateCandidateCriteriaDto,
  ): Promise<CandidateCriteria> {
    assertNotNull(dto, ['title', 'description']);
    const row = await this.requireOwn(userId, id);
    return this.criteria.save(this.criteria.merge(row, dto));
  }

  async setAttachment(
    userId: string,
    id: string,
    file: UploadedFileLike | undefined,
  ): Promise<CandidateCriteria> {
    const row = await this.requireOwn(userId, id);
    const url = await this.storage.save(file, FileKind.ATTACHMENT);
    const old = row.attachmentUrl;
    row.attachmentUrl = url;
    const saved = await this.criteria.save(row);
    await this.storage.remove(old);
    return saved;
  }

  async remove(userId: string, id: string): Promise<void> {
    const row = await this.requireOwn(userId, id);
    await this.criteria.remove(row);
    await this.storage.remove(row.attachmentUrl);
  }

  async mine(
    userId: string,
    query: PaginationQueryDto,
  ): Promise<Paginated<CandidateCriteria>> {
    const employer = await this.employers.requireProfileByUser(userId);
    const [items, total] = await this.criteria.findAndCount({
      where: { employerId: employer.id },
      order: { createdAt: 'DESC' },
      skip: query.skip,
      take: query.limit,
    });
    return paginated(items, total, query);
  }

  /** Any logged-in user: what companies are looking for. */
  async list(
    query: ListCandidateCriteriaQueryDto,
  ): Promise<Paginated<CandidateCriteria>> {
    const [items, total] = await this.criteria.findAndCount({
      where: query.employerId ? { employerId: query.employerId } : {},
      relations: { employer: true },
      order: { createdAt: 'DESC' },
      skip: query.skip,
      take: query.limit,
    });
    return paginated(items, total, query);
  }

  async getById(id: string): Promise<CandidateCriteria> {
    const row = await this.criteria.findOne({
      where: { id },
      relations: { employer: true },
    });
    if (!row) throw new NotFoundException('Candidate criteria not found');
    return row;
  }

  /** Students whose job type, study level and preferred industry fit the criteria. */
  async matches(
    userId: string,
    id: string,
    query: PaginationQueryDto,
  ): Promise<Paginated<StudentProfileView>> {
    const row = await this.requireOwn(userId, id);
    const search = Object.assign(new SearchStudentsQueryDto(), {
      page: query.page,
      limit: query.limit,
      preferredJobType: row.preferredJobType ?? undefined,
      studyLevel: row.studyLevel ?? undefined,
      industry: row.industryType ?? undefined,
    });
    return this.students.search(search);
  }

  private async requireOwn(
    userId: string,
    id: string,
  ): Promise<CandidateCriteria> {
    const employer = await this.employers.requireProfileByUser(userId);
    const row = await this.criteria.findOneBy({ id });
    if (!row) throw new NotFoundException('Candidate criteria not found');
    if (row.employerId !== employer.id) {
      throw new ForbiddenException('These criteria belong to another company');
    }
    return row;
  }
}
