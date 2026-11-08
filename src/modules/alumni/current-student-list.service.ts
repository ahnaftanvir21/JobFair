import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository, type SelectQueryBuilder } from 'typeorm';
import { paginated, type Paginated } from '../../common/dto/pagination.dto.js';
import { likePattern } from '../../common/utils/text.util.js';
import { StudentProfile } from '../students/entities/student-profile.entity.js';
import { User } from '../users/entities/user.entity.js';
import {
  parseAlumniSheet,
  readAlumniFile,
  type AlumniListProblem,
  type AlumniUpload,
} from './alumni-list.parser.js';
import { AdminAlumniQueryDto, AlumniStatusFilter } from './dto/alumni.dto.js';
import { CurrentStudentRecord } from './entities/current-student-record.entity.js';

const MAX_PROBLEMS_SHOWN = 50;
const CHUNK = 500;

export interface CurrentListImportResult {
  added: number;
  updated: number;
  unchanged: number;
  skipped: number;
  problems: AlumniListProblem[];
  totalInList: number;
}

export interface AdminCurrentStudentItem {
  id: string;
  aiubId: string;
  name: string | null;
  program: string | null;
  faculty: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** The account that uses this AIUB ID, if any. */
  account: {
    email: string;
    name: string;
    isAlumni: boolean;
    registeredAt: Date;
  } | null;
}

type Raw = Omit<AdminCurrentStudentItem, 'account'> & {
  email: string | null;
  studentName: string | null;
  isAlumni: boolean | null;
  registeredAt: Date | null;
};

/** The current student list: name, program and faculty by AIUB ID. */
@Injectable()
export class CurrentStudentListService {
  constructor(
    @InjectRepository(CurrentStudentRecord)
    private readonly repo: Repository<CurrentStudentRecord>,
    private readonly dataSource: DataSource,
  ) {}

  find(aiubId: string): Promise<CurrentStudentRecord | null> {
    return this.repo.findOneBy({ aiubId });
  }

  /**
   * Adds new IDs and updates changed ones; IDs missing from the file stay.
   * Students who already registered get the list's program and faculty.
   */
  async importFile(
    file: AlumniUpload | undefined,
  ): Promise<CurrentListImportResult> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Choose the student list file to upload');
    }
    const options = { registration: false };
    const { rows, problems } = parseAlumniSheet(
      await readAlumniFile(file, options),
      options,
    );
    if (!rows.length) {
      const first = problems
        .slice(0, 3)
        .map((p) => `row ${p.row}: ${p.message}`)
        .join('; ');
      throw new BadRequestException(
        first ? `No usable rows in the file (${first}).` : 'The file has no rows under the headings.',
      );
    }

    let added = 0;
    let updated = 0;
    let unchanged = 0;
    await this.dataSource.transaction(async (manager) => {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const existing = new Map(
          (
            await manager.findBy(CurrentStudentRecord, {
              aiubId: In(chunk.map((r) => r.aiubId)),
            })
          ).map((r) => [r.aiubId, r]),
        );
        const changes: Partial<CurrentStudentRecord>[] = [];
        for (const row of chunk) {
          const old = existing.get(row.aiubId);
          // A sheet without a column keeps what an earlier upload set.
          const details = {
            name: row.name ?? old?.name ?? null,
            program: row.program ?? old?.program ?? null,
            faculty: row.faculty ?? old?.faculty ?? null,
          };
          if (!old) added++;
          else if (
            details.name === old.name &&
            details.program === old.program &&
            details.faculty === old.faculty
          ) {
            unchanged++;
            continue;
          } else updated++;
          changes.push({ aiubId: row.aiubId, ...details });
        }
        if (changes.length) {
          await manager.upsert(CurrentStudentRecord, changes, ['aiubId']);
        }
      }
      await manager.query(
        `UPDATE student_profiles s
            SET program = COALESCE(c.program, s.program),
                faculty = COALESCE(c.faculty, s.faculty),
                academics_from_list = true
           FROM current_student_records c
          WHERE s.aiub_id = c.aiub_id AND NOT s.is_alumni
            AND (c.program IS NOT NULL OR c.faculty IS NOT NULL)
            AND (NOT s.academics_from_list
              OR s.program IS DISTINCT FROM COALESCE(c.program, s.program)
              OR s.faculty IS DISTINCT FROM COALESCE(c.faculty, s.faculty))`,
      );
    });

    return {
      added,
      updated,
      unchanged,
      skipped: problems.length,
      problems: problems.slice(0, MAX_PROBLEMS_SHOWN),
      totalInList: await this.repo.count(),
    };
  }

  async list(
    query: AdminAlumniQueryDto,
  ): Promise<Paginated<AdminCurrentStudentItem> & { totalInList: number; registered: number }> {
    const qb = this.baseQuery();
    if (query.status === AlumniStatusFilter.REGISTERED) {
      qb.andWhere('s.id IS NOT NULL');
    } else if (query.status === AlumniStatusFilter.NOT_REGISTERED) {
      qb.andWhere('s.id IS NULL');
    }
    if (query.q?.trim()) {
      qb.andWhere(
        '(c.aiubId ILIKE :q OR c.name ILIKE :q OR c.program ILIKE :q OR u.email ILIKE :q)',
        { q: likePattern(query.q) },
      );
    }
    const [total, raw, totalInList, registered] = await Promise.all([
      qb.clone().getCount(),
      qb
        .orderBy('c.aiubId', 'ASC')
        .offset(query.skip)
        .limit(query.limit)
        .getRawMany<Raw>(),
      this.repo.count(),
      this.baseQuery().andWhere('s.id IS NOT NULL').getCount(),
    ]);
    const items = raw.map<AdminCurrentStudentItem>((r) => ({
      id: r.id,
      aiubId: r.aiubId,
      name: r.name,
      program: r.program,
      faculty: r.faculty,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      account:
        r.email && r.registeredAt
          ? {
              email: r.email,
              name: r.studentName ?? '',
              isAlumni: !!r.isAlumni,
              registeredAt: r.registeredAt,
            }
          : null,
    }));
    return { ...paginated(items, total, query), totalInList, registered };
  }

  /** Removes one ID from the list. An account already made with it stays as it is. */
  async remove(id: string): Promise<void> {
    const { affected } = await this.repo.delete(id);
    if (!affected) throw new NotFoundException('This ID is not on the student list');
  }

  private baseQuery(): SelectQueryBuilder<CurrentStudentRecord> {
    return this.repo
      .createQueryBuilder('c')
      .leftJoin(StudentProfile, 's', 's.aiubId = c.aiubId')
      .leftJoin(User, 'u', 'u.id = s.userId')
      .select('c.id', 'id')
      .addSelect('c.aiubId', 'aiubId')
      .addSelect('c.name', 'name')
      .addSelect('c.program', 'program')
      .addSelect('c.faculty', 'faculty')
      .addSelect('c.createdAt', 'createdAt')
      .addSelect('c.updatedAt', 'updatedAt')
      .addSelect('u.email', 'email')
      .addSelect('s.name', 'studentName')
      .addSelect('s.isAlumni', 'isAlumni')
      .addSelect('s.createdAt', 'registeredAt');
  }
}
