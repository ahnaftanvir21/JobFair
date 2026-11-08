import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { paginated, type Paginated } from '../../common/dto/pagination.dto.js';
import { EducationLevel, StudyLevel } from '../../common/enums/index.js';
import { likePattern } from '../../common/utils/text.util.js';
import { assertNotNull } from '../../common/utils/validation.util.js';
import { FileKind } from '../uploads/file-kind.enum.js';
import {
  FileStorageService,
  type UploadedFileLike,
} from '../uploads/file-storage.service.js';
import {
  CreateEducationDto,
  CreateExperienceDto,
  CreateReferenceDto,
  CreateStudentProfileDto,
  REQUIRED_PROFILE_FIELDS,
  SearchStudentsQueryDto,
  UpdateEducationDto,
  UpdateExperienceDto,
  UpdateReferenceDto,
  UpdateStudentProfileDto,
} from './dto/index.js';
import { Education } from './entities/education.entity.js';
import { Experience } from './entities/experience.entity.js';
import { Reference } from './entities/reference.entity.js';
import { StudentProfile } from './entities/student-profile.entity.js';

const PG_UNIQUE_VIOLATION = '23505';

export interface ProfileCompleteness {
  /** True when the student can apply to jobs. */
  isComplete: boolean;
  /** What is still missing, e.g. ["address", "cv"]. */
  missing: string[];
}

/** Profile data collected at registration (everything except files). */
export type StudentRegistrationData = CreateStudentProfileDto & {
  isAlumni?: boolean;
  educations: CreateEducationDto[];
  experiences?: CreateExperienceDto[];
  references?: CreateReferenceDto[];
};

export type StudentProfileView = Omit<StudentProfile, 'user'> & {
  email: string;
  completeness: ProfileCompleteness;
};

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(StudentProfile)
    private readonly profiles: Repository<StudentProfile>,
    @InjectRepository(Education)
    private readonly educations: Repository<Education>,
    @InjectRepository(Experience)
    private readonly experiences: Repository<Experience>,
    @InjectRepository(Reference)
    private readonly references: Repository<Reference>,
    private readonly storage: FileStorageService,
  ) {}

  // ---------- Profile ----------

  /**
   * Creates the profile with its education, experience and references.
   * Runs inside the registration transaction, so a failure also undoes the account.
   */
  async createForUser(
    manager: EntityManager,
    userId: string,
    data: StudentRegistrationData,
  ): Promise<void> {
    const { educations, experiences = [], references = [], ...fields } = data;

    const levels = educations
      .map((e) => e.level)
      .filter((level) => level !== EducationLevel.PROFESSIONAL);
    const repeated = levels.find((level, i) => levels.indexOf(level) !== i);
    if (repeated) {
      throw new ConflictException(
        `${repeated.toUpperCase()} was added more than once`,
      );
    }
    for (const e of experiences) this.assertDateRange(e.startDate, e.endDate);

    if (await manager.existsBy(StudentProfile, { aiubId: fields.aiubId })) {
      throw new ConflictException('This AIUB ID is already registered');
    }

    const profile = await manager.save(
      manager.create(StudentProfile, { ...fields, userId }),
    );
    const studentId = profile.id;
    await manager.save(
      educations.map((e) =>
        manager.create(Education, { ...e, cgpa: this.cgpa(e.cgpa), studentId }),
      ),
    );
    await manager.save(
      experiences.map((e) => manager.create(Experience, { ...e, studentId })),
    );
    await manager.save(
      references.map((r) => manager.create(Reference, { ...r, studentId })),
    );
  }

  async update(
    userId: string,
    dto: UpdateStudentProfileDto,
  ): Promise<StudentProfileView> {
    assertNotNull(dto, REQUIRED_PROFILE_FIELDS);
    const profile = await this.requireProfileByUser(userId);
    if (
      profile.isAlumni &&
      dto.studyLevel &&
      dto.studyLevel !== StudyLevel.GRADUATED
    ) {
      throw new BadRequestException(
        'Alumni accounts stay as Graduated. Current students register with their AIUB student email.',
      );
    }
    await this.saveProfile(this.profiles.merge(profile, dto));
    return this.getOwnProfile(userId);
  }

  async getOwnProfile(userId: string): Promise<StudentProfileView> {
    const profile = await this.findFull({ userId });
    if (!profile) throw this.profileMissing();
    return this.toView(profile);
  }

  /** Full profile for employers. */
  async getById(id: string): Promise<StudentProfileView> {
    const profile = await this.findFull({ id });
    if (!profile) throw new NotFoundException('Student not found');
    return this.toView(profile);
  }

  async setPicture(
    userId: string,
    file: UploadedFileLike | undefined,
  ): Promise<StudentProfileView> {
    const profile = await this.requireProfileByUser(userId);
    const url = await this.storage.save(file, FileKind.PICTURE);
    const old = profile.profilePictureUrl;
    await this.profiles.update(profile.id, { profilePictureUrl: url });
    await this.storage.remove(old);
    return this.getOwnProfile(userId);
  }

  /** Old CVs are kept because earlier applications and CV drops may point at them. */
  async setCv(
    userId: string,
    file: UploadedFileLike | undefined,
  ): Promise<StudentProfileView> {
    const profile = await this.requireProfileByUser(userId);
    const url = await this.storage.save(file, FileKind.CV);
    await this.profiles.update(profile.id, { cvUrl: url });
    return this.getOwnProfile(userId);
  }

  // ---------- Used by other modules ----------

  async requireProfileByUser(userId: string): Promise<StudentProfile> {
    const profile = await this.profiles.findOneBy({ userId });
    if (!profile) throw this.profileMissing();
    return profile;
  }

  /** Throws unless the profile has everything needed to apply for a job. */
  async requireCompleteProfile(
    userId: string,
    options: { cvProvided?: boolean } = {},
  ): Promise<StudentProfile> {
    const profile = await this.requireProfileByUser(userId);
    const educationCount = await this.educations.countBy({
      studentId: profile.id,
    });
    const missing = this.completeness(profile, educationCount).missing.filter(
      (item) => !(item === 'cv' && options.cvProvided),
    );
    if (missing.length) {
      throw new BadRequestException(
        `Complete your profile first. Missing: ${missing.join(', ')}`,
      );
    }
    return profile;
  }

  completeness(
    profile: Pick<StudentProfile, 'address' | 'gender' | 'cvUrl'>,
    educationCount: number,
  ): ProfileCompleteness {
    const missing: string[] = [];
    if (!profile.address) missing.push('address');
    if (!profile.gender) missing.push('gender');
    if (educationCount === 0) missing.push('education');
    if (!profile.cvUrl) missing.push('cv');
    return { isComplete: missing.length === 0, missing };
  }

  // ---------- Search (employers) ----------

  async search(
    query: SearchStudentsQueryDto,
  ): Promise<Paginated<StudentProfileView>> {
    const qb = this.profiles
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.user', 'u')
      .orderBy('s.createdAt', 'DESC')
      .skip(query.skip)
      .take(query.limit);

    if (query.q) {
      qb.andWhere('(s.name ILIKE :q OR s.aiubId ILIKE :q)', {
        q: likePattern(query.q),
      });
    }
    if (query.studyLevel) {
      qb.andWhere('s.studyLevel = :studyLevel', {
        studyLevel: query.studyLevel,
      });
    }
    if (query.preferredJobType) {
      qb.andWhere('s.preferredJobType = :jobType', {
        jobType: query.preferredJobType,
      });
    }
    if (query.industry) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM unnest(s.preferred_industry_types) AS i WHERE i ILIKE :industry)',
        { industry: likePattern(query.industry) },
      );
    }
    if (query.hasCv !== undefined) {
      qb.andWhere(query.hasCv ? 's.cvUrl IS NOT NULL' : 's.cvUrl IS NULL');
    }

    const [items, total] = await qb.getManyAndCount();
    const counts = await this.educationCounts(items.map((s) => s.id));
    return paginated(
      items.map((s) =>
        this.toView(
          { ...s, educations: [], experiences: [], references: [] },
          counts.get(s.id) ?? 0,
        ),
      ),
      total,
      query,
    );
  }

  // ---------- Education ----------

  async addEducation(userId: string, dto: CreateEducationDto) {
    const profile = await this.requireProfileByUser(userId);
    await this.assertEducationLevelFree(profile.id, dto.level);
    return this.educations.save(
      this.educations.create({
        ...dto,
        cgpa: this.cgpa(dto.cgpa),
        studentId: profile.id,
      }),
    );
  }

  async updateEducation(userId: string, id: string, dto: UpdateEducationDto) {
    assertNotNull(dto, ['level', 'institutionName']);
    const profile = await this.requireProfileByUser(userId);
    const row = await this.findOwned(
      this.educations,
      id,
      profile.id,
      'Education',
    );
    if (dto.level && dto.level !== row.level) {
      await this.assertEducationLevelFree(profile.id, dto.level);
    }
    const { cgpa, ...rest } = dto;
    this.educations.merge(row, rest);
    if (cgpa !== undefined) row.cgpa = this.cgpa(cgpa);
    return this.educations.save(row);
  }

  async removeEducation(userId: string, id: string): Promise<void> {
    const profile = await this.requireProfileByUser(userId);
    const row = await this.findOwned(
      this.educations,
      id,
      profile.id,
      'Education',
    );
    await this.educations.remove(row);
  }

  // ---------- Experience ----------

  async addExperience(userId: string, dto: CreateExperienceDto) {
    const profile = await this.requireProfileByUser(userId);
    this.assertDateRange(dto.startDate, dto.endDate);
    return this.experiences.save(
      this.experiences.create({ ...dto, studentId: profile.id }),
    );
  }

  async updateExperience(userId: string, id: string, dto: UpdateExperienceDto) {
    assertNotNull(dto, [
      'companyName',
      'industryType',
      'jobType',
      'designation',
      'startDate',
    ]);
    const profile = await this.requireProfileByUser(userId);
    const row = await this.findOwned(
      this.experiences,
      id,
      profile.id,
      'Experience',
    );
    this.experiences.merge(row, dto);
    this.assertDateRange(row.startDate, row.endDate);
    return this.experiences.save(row);
  }

  async removeExperience(userId: string, id: string): Promise<void> {
    const profile = await this.requireProfileByUser(userId);
    const row = await this.findOwned(
      this.experiences,
      id,
      profile.id,
      'Experience',
    );
    await this.experiences.remove(row);
  }

  // ---------- References ----------

  async addReference(userId: string, dto: CreateReferenceDto) {
    const profile = await this.requireProfileByUser(userId);
    return this.references.save(
      this.references.create({ ...dto, studentId: profile.id }),
    );
  }

  async updateReference(userId: string, id: string, dto: UpdateReferenceDto) {
    assertNotNull(dto, [
      'name',
      'designation',
      'organization',
      'email',
      'mobile',
      'relation',
    ]);
    const profile = await this.requireProfileByUser(userId);
    const row = await this.findOwned(
      this.references,
      id,
      profile.id,
      'Reference',
    );
    return this.references.save(this.references.merge(row, dto));
  }

  async removeReference(userId: string, id: string): Promise<void> {
    const profile = await this.requireProfileByUser(userId);
    const row = await this.findOwned(
      this.references,
      id,
      profile.id,
      'Reference',
    );
    await this.references.remove(row);
  }

  // ---------- Helpers ----------

  private findFull(where: { id?: string; userId?: string }) {
    return this.profiles.findOne({
      where,
      relations: {
        user: true,
        educations: true,
        experiences: true,
        references: true,
      },
      order: {
        educations: { level: 'ASC' },
        experiences: { startDate: 'DESC' },
      },
    });
  }

  private toView(
    profile: StudentProfile,
    educationCount?: number,
  ): StudentProfileView {
    const { user, ...rest } = profile;
    return {
      ...rest,
      email: user?.email,
      completeness: this.completeness(
        profile,
        educationCount ?? profile.educations?.length ?? 0,
      ),
    };
  }

  private async educationCounts(ids: string[]): Promise<Map<string, number>> {
    if (!ids.length) return new Map();
    const rows = await this.educations
      .createQueryBuilder('e')
      .select('e.studentId', 'studentId')
      .addSelect('COUNT(*)', 'count')
      .where('e.studentId IN (:...ids)', { ids })
      .groupBy('e.studentId')
      .getRawMany<{ studentId: string; count: string }>();
    return new Map(rows.map((r) => [r.studentId, Number(r.count)]));
  }

  private async saveProfile(profile: StudentProfile): Promise<void> {
    try {
      await this.profiles.save(profile);
    } catch (err) {
      if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        throw new ConflictException('This AIUB ID is already registered');
      }
      throw err;
    }
  }

  private async findOwned<T extends { id: string; studentId: string }>(
    repo: Repository<T>,
    id: string,
    studentId: string,
    label: string,
  ): Promise<T> {
    const row = await repo.findOne({ where: { id, studentId } as never });
    if (!row) throw new NotFoundException(`${label} not found`);
    return row;
  }

  /** SSC, HSC, BSc, MSc 1 and MSc 2 can each appear once. Professional can repeat. */
  private async assertEducationLevelFree(
    studentId: string,
    level: EducationLevel,
  ): Promise<void> {
    if (level === EducationLevel.PROFESSIONAL) return;
    if (await this.educations.existsBy({ studentId, level })) {
      throw new ConflictException(
        `You already added ${level.toUpperCase()}. Edit that entry instead.`,
      );
    }
  }

  private assertDateRange(start: string, end?: string | null): void {
    if (end && end < start) {
      throw new BadRequestException('endDate cannot be before startDate');
    }
  }

  private cgpa(value: number | null | undefined): string | null {
    return value === undefined || value === null ? null : value.toFixed(2);
  }

  private profileMissing(): NotFoundException {
    return new NotFoundException('Student profile not found');
  }
}
