import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository, type SelectQueryBuilder } from 'typeorm';
import { paginated, type Paginated } from '../../common/dto/pagination.dto.js';
import { likePattern } from '../../common/utils/text.util.js';
import { StudentProfile } from '../students/entities/student-profile.entity.js';
import { User } from '../users/entities/user.entity.js';
import {
  normalizeRegistration,
  parseAlumniSheet,
  readAlumniFile,
  type AlumniListProblem,
  type AlumniUpload,
} from './alumni-list.parser.js';
import {
  AdminAlumniQueryDto,
  AlumniStatusFilter,
  CheckAlumniResponseDto,
} from './dto/alumni.dto.js';
import { AlumniRecord } from './entities/alumni-record.entity.js';

/** Wrong registration numbers allowed before the AIUB ID is locked for a while. */
export const ALUMNI_MAX_ATTEMPTS = 5;
export const ALUMNI_LOCK_MINUTES = 15;
/** Skipped rows listed in the upload result. */
const MAX_PROBLEMS_SHOWN = 50;
const CHUNK = 500;

export const ALUMNI_NO_MATCH =
  "These details don't match the AIUB alumni list. Check your AIUB ID and registration number, or contact the Office of Placement & Alumni (opa@aiub.edu).";
export const ALUMNI_ALREADY_REGISTERED =
  'An account already exists for this AIUB ID. Log in, or use Forgot password if it is yours.';

export interface AlumniImportResult {
  /** New IDs added to the list. */
  added: number;
  /** IDs already on the list whose number, name, program, faculty or convocation changed. */
  updated: number;
  /** IDs already on the list with the same details. */
  unchanged: number;
  /** Rows that could not be used. */
  skipped: number;
  /** Why rows were skipped (first 50). */
  problems: AlumniListProblem[];
  /** IDs on the list after this upload. */
  totalInList: number;
}

export interface AdminAlumniItem {
  id: string;
  aiubId: string;
  /** As written in the uploaded sheet. Null if it cannot be shown (upload the list again). */
  registrationNumber: string | null;
  name: string | null;
  program: string | null;
  faculty: string | null;
  convocation: string | null;
  createdAt: Date;
  updatedAt: Date;
  lockedUntil: Date | null;
  /** The account that uses this AIUB ID, if any. */
  account: {
    email: string;
    name: string;
    isAlumni: boolean;
    registeredAt: Date;
  } | null;
}

type AlumniRaw = {
  id: string;
  aiubId: string;
  registrationNumberEnc: string | null;
  name: string | null;
  program: string | null;
  faculty: string | null;
  convocation: string | null;
  createdAt: Date;
  updatedAt: Date;
  lockedUntil: Date | null;
  email: string | null;
  studentName: string | null;
  isAlumni: boolean | null;
  registeredAt: Date | null;
};

@Injectable()
export class AlumniService {
  private readonly secret: string;

  constructor(
    @InjectRepository(AlumniRecord)
    private readonly repo: Repository<AlumniRecord>,
    @InjectRepository(StudentProfile)
    private readonly students: Repository<StudentProfile>,
    private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>('auth.jwtSecret');
  }

  // ---------- Registration ----------

  /**
   * Checks an AIUB ID and registration number against the list.
   * Too many wrong numbers lock the ID for 15 minutes.
   */
  async check(
    aiubId: string,
    registrationNumber: string,
  ): Promise<CheckAlumniResponseDto> {
    const record = await this.repo.findOneBy({ aiubId });
    if (!record) throw new BadRequestException(ALUMNI_NO_MATCH);
    if (record.lockedUntil && record.lockedUntil > new Date()) {
      throw this.lockedError(record.lockedUntil);
    }
    if (!this.sameHash(record, registrationNumber)) {
      await this.countWrongTry(record);
      throw new BadRequestException(ALUMNI_NO_MATCH);
    }
    if (record.failedAttempts > 0 || record.lockedUntil) {
      await this.repo.update(record.id, { failedAttempts: 0, lockedUntil: null });
    }
    if (await this.students.existsBy({ aiubId })) {
      throw new ConflictException(ALUMNI_ALREADY_REGISTERED);
    }
    return {
      message: 'Details match the alumni list.',
      name: record.name,
      program: record.program,
      faculty: record.faculty,
      convocation: record.convocation,
    };
  }

  // ---------- Admin ----------

  /**
   * Adds new IDs and updates changed ones. IDs missing from the file stay on
   * the list, so the list can be uploaded in parts or again later.
   */
  async importFile(file: AlumniUpload | undefined): Promise<AlumniImportResult> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Choose the alumni list file to upload');
    }
    const { rows, problems } = parseAlumniSheet(await readAlumniFile(file));
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
            await manager.findBy(AlumniRecord, {
              aiubId: In(chunk.map((r) => r.aiubId)),
            })
          ).map((r) => [r.aiubId, r]),
        );
        const changes: Partial<AlumniRecord>[] = [];
        for (const row of chunk) {
          const registrationHash = this.hash(row.aiubId, row.registrationNumber);
          const old = existing.get(row.aiubId);
          if (!old) {
            added++;
            changes.push({
              aiubId: row.aiubId,
              registrationHash,
              registrationNumberEnc: this.encrypt(row.registrationText),
              name: row.name,
              program: row.program,
              faculty: row.faculty,
              convocation: row.convocation,
            });
            continue;
          }
          const numberChanged = old.registrationHash !== registrationHash;
          // A sheet without a column keeps what an earlier upload set.
          const details = {
            name: row.name ?? old.name,
            program: row.program ?? old.program,
            faculty: row.faculty ?? old.faculty,
            convocation: row.convocation ?? old.convocation,
          };
          const detailsChanged = (
            Object.keys(details) as (keyof typeof details)[]
          ).some((k) => details[k] !== old[k]);
          // Rows from before numbers were kept get theirs filled in.
          const missingNumber = this.decrypt(old.registrationNumberEnc) === null;
          if (!numberChanged && !missingNumber && !detailsChanged) {
            unchanged++;
            continue;
          }
          updated++;
          changes.push({
            aiubId: row.aiubId,
            registrationHash,
            registrationNumberEnc:
              numberChanged || missingNumber
                ? this.encrypt(row.registrationText)
                : old.registrationNumberEnc,
            ...details,
            // A corrected number starts with a clean slate.
            failedAttempts: numberChanged ? 0 : old.failedAttempts,
            lockedUntil: numberChanged ? null : old.lockedUntil,
          });
        }
        if (changes.length) {
          await manager.upsert(AlumniRecord, changes, ['aiubId']);
        }
      }
      // Alumni who already registered get the list's program and faculty.
      await manager.query(
        `UPDATE student_profiles s
            SET program = COALESCE(a.program, s.program),
                faculty = COALESCE(a.faculty, s.faculty),
                academics_from_list = true
           FROM alumni_records a
          WHERE s.aiub_id = a.aiub_id AND s.is_alumni
            AND (a.program IS NOT NULL OR a.faculty IS NOT NULL)
            AND (NOT s.academics_from_list
              OR s.program IS DISTINCT FROM COALESCE(a.program, s.program)
              OR s.faculty IS DISTINCT FROM COALESCE(a.faculty, s.faculty))`,
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
  ): Promise<Paginated<AdminAlumniItem> & { totalInList: number; registered: number }> {
    const qb = this.baseQuery();
    if (query.status === AlumniStatusFilter.REGISTERED) {
      qb.andWhere('s.id IS NOT NULL');
    } else if (query.status === AlumniStatusFilter.NOT_REGISTERED) {
      qb.andWhere('s.id IS NULL');
    }
    if (query.q?.trim()) {
      qb.andWhere('(a.aiubId ILIKE :q OR a.name ILIKE :q OR a.program ILIKE :q OR u.email ILIKE :q)', {
        q: likePattern(query.q),
      });
    }
    const [total, raw, totalInList, registered] = await Promise.all([
      qb.clone().getCount(),
      qb
        .orderBy('a.aiubId', 'ASC')
        .offset(query.skip)
        .limit(query.limit)
        .getRawMany<AlumniRaw>(),
      this.repo.count(),
      this.baseQuery().andWhere('s.id IS NOT NULL').getCount(),
    ]);
    const items = raw.map<AdminAlumniItem>((r) => ({
      id: r.id,
      aiubId: r.aiubId,
      registrationNumber: this.decrypt(r.registrationNumberEnc),
      name: r.name,
      program: r.program,
      faculty: r.faculty,
      convocation: r.convocation,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      lockedUntil:
        r.lockedUntil && new Date(r.lockedUntil) > new Date() ? r.lockedUntil : null,
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

  /** Removes one ID from the list. An account already made with it stays. */
  async remove(id: string): Promise<void> {
    const { affected } = await this.repo.delete(id);
    if (!affected) throw new NotFoundException('This ID is not on the alumni list');
  }

  // ---------- Helpers ----------

  private baseQuery(): SelectQueryBuilder<AlumniRecord> {
    return this.repo
      .createQueryBuilder('a')
      .leftJoin(StudentProfile, 's', 's.aiubId = a.aiubId')
      .leftJoin(User, 'u', 'u.id = s.userId')
      .select('a.id', 'id')
      .addSelect('a.aiubId', 'aiubId')
      .addSelect('a.registrationNumberEnc', 'registrationNumberEnc')
      .addSelect('a.name', 'name')
      .addSelect('a.program', 'program')
      .addSelect('a.faculty', 'faculty')
      .addSelect('a.convocation', 'convocation')
      .addSelect('a.createdAt', 'createdAt')
      .addSelect('a.updatedAt', 'updatedAt')
      .addSelect('a.lockedUntil', 'lockedUntil')
      .addSelect('u.email', 'email')
      .addSelect('s.name', 'studentName')
      .addSelect('s.isAlumni', 'isAlumni')
      .addSelect('s.createdAt', 'registeredAt');
  }

  private hash(aiubId: string, registrationNumber: string): string {
    return createHmac('sha256', this.secret)
      .update(`alumni:${aiubId}:${normalizeRegistration(registrationNumber)}`)
      .digest('hex');
  }

  /** Key for the stored registration numbers, derived from JWT_SECRET. */
  private get key(): Buffer {
    return createHash('sha256').update(`alumni-registration:${this.secret}`).digest();
  }

  /** AES-256-GCM; stored as "v1:" + base64(iv, tag, ciphertext). */
  private encrypt(text: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return `v1:${Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')}`;
  }

  /** Null when missing or unreadable (for example after JWT_SECRET changed). */
  private decrypt(stored: string | null): string | null {
    if (!stored?.startsWith('v1:')) return null;
    try {
      const raw = Buffer.from(stored.slice(3), 'base64');
      const decipher = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    } catch {
      return null;
    }
  }

  private sameHash(record: AlumniRecord, registrationNumber: string): boolean {
    const given = Buffer.from(this.hash(record.aiubId, registrationNumber), 'hex');
    const stored = Buffer.from(record.registrationHash, 'hex');
    return given.length === stored.length && timingSafeEqual(given, stored);
  }

  /** Counts a wrong number atomically; the 5th in a row locks the ID. */
  private async countWrongTry(record: AlumniRecord): Promise<void> {
    const result: unknown = await this.dataSource.query(
      `UPDATE alumni_records SET failed_attempts = failed_attempts + 1
        WHERE id = $1 RETURNING failed_attempts`,
      [record.id],
    );
    // For UPDATE ... RETURNING the driver answers [rows, count].
    const rows = (
      Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result
    ) as { failed_attempts: number }[];
    if ((rows[0]?.failed_attempts ?? 0) >= ALUMNI_MAX_ATTEMPTS) {
      const until = new Date(Date.now() + ALUMNI_LOCK_MINUTES * 60_000);
      await this.repo.update(record.id, { failedAttempts: 0, lockedUntil: until });
      throw this.lockedError(until);
    }
  }

  private lockedError(until: Date): HttpException {
    const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
    return new HttpException(
      `Too many wrong registration numbers for this AIUB ID. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
