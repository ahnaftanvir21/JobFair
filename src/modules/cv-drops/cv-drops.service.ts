import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  paginated,
  PaginationQueryDto,
  type Paginated,
} from '../../common/dto/pagination.dto.js';
import { FairService } from '../../common/fair/fair.service.js';
import { EmployerStatus } from '../../common/enums/index.js';
import { EmployerProfile } from '../employers/entities/employer-profile.entity.js';
import { EmployersService } from '../employers/employers.service.js';
import { StudentsService } from '../students/students.service.js';
import { FileKind } from '../uploads/file-kind.enum.js';
import {
  FileStorageService,
  type UploadedFileLike,
} from '../uploads/file-storage.service.js';
import {
  CreateCvDropDto,
  CvDropScope,
  ReceivedCvDropsQueryDto,
} from './dto/cv-drop.dto.js';
import { CvDrop } from './entities/cv-drop.entity.js';

@Injectable()
export class CvDropsService {
  constructor(
    @InjectRepository(CvDrop) private readonly drops: Repository<CvDrop>,
    @InjectRepository(EmployerProfile)
    private readonly employerProfiles: Repository<EmployerProfile>,
    private readonly students: StudentsService,
    private readonly employers: EmployersService,
    private readonly storage: FileStorageService,
    private readonly fair: FairService,
  ) {}

  /** Drop a CV to the pool or one company. Dropping again to the same place replaces it. */
  async drop(
    userId: string,
    dto: CreateCvDropDto,
    file?: UploadedFileLike,
  ): Promise<CvDrop> {
    this.fair.assertStudentWindowOpen('Dropping CVs');
    const student = await this.students.requireProfileByUser(userId);
    if (!file && !student.cvUrl) {
      throw new BadRequestException(
        'Attach a CV file, or upload one to your profile first',
      );
    }
    const employerId = dto.employerId ?? null;
    if (
      employerId &&
      !(await this.employerProfiles.existsBy({
        id: employerId,
        status: EmployerStatus.APPROVED,
      }))
    ) {
      throw new NotFoundException('Company not found');
    }

    const cvUrl = file
      ? await this.storage.save(file, FileKind.CV)
      : (student.cvUrl as string);

    const existing = await this.drops.findOneBy({
      studentId: student.id,
      employerId: employerId ?? IsNull(),
    });
    const drop =
      existing ?? this.drops.create({ studentId: student.id, employerId });
    drop.cvUrl = cvUrl;
    drop.note = dto.note ?? null;
    const saved = await this.drops.save(drop);
    return this.findOne(saved.id);
  }

  async mine(
    userId: string,
    query: PaginationQueryDto,
  ): Promise<Paginated<CvDrop>> {
    const student = await this.students.requireProfileByUser(userId);
    const [items, total] = await this.drops.findAndCount({
      where: { studentId: student.id },
      relations: { employer: true },
      order: { updatedAt: 'DESC' },
      skip: query.skip,
      take: query.limit,
    });
    return paginated(items, total, query);
  }

  /** CVs sent to my company plus the general pool. */
  async received(
    userId: string,
    query: ReceivedCvDropsQueryDto,
  ): Promise<Paginated<CvDrop>> {
    const employer = await this.employers.requireProfileByUser(userId);
    const scope = query.scope ?? CvDropScope.ALL;
    const where =
      scope === CvDropScope.COMPANY
        ? { employerId: employer.id }
        : scope === CvDropScope.POOL
          ? { employerId: IsNull() }
          : [{ employerId: employer.id }, { employerId: IsNull() }];

    const [items, total] = await this.drops.findAndCount({
      where,
      relations: { student: { user: true } },
      order: { updatedAt: 'DESC' },
      skip: query.skip,
      take: query.limit,
    });
    return paginated(items, total, query);
  }

  async remove(userId: string, id: string): Promise<void> {
    const student = await this.students.requireProfileByUser(userId);
    const drop = await this.drops.findOneBy({ id, studentId: student.id });
    if (!drop) throw new NotFoundException('CV drop not found');
    await this.drops.remove(drop);
  }

  private async findOne(id: string): Promise<CvDrop> {
    return this.drops.findOneOrFail({
      where: { id },
      relations: { employer: true },
    });
  }
}
