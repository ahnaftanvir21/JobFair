import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * One graduate from the alumni list the fair office uploads.
 * An alumnus registers with a personal email by giving the AIUB ID and
 * registration number from this list. The account is linked by AIUB ID
 * (student_profiles.aiub_id), which is unique, so each row can only be used once.
 */
@Entity('alumni_records')
export class AlumniRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  aiubId: string;

  /** HMAC of the AIUB ID and registration number, used to check sign-ups. */
  @Column({ type: 'varchar', length: 64 })
  registrationHash: string;

  /**
   * The registration number as written in the sheet, encrypted (AES-256-GCM),
   * so the admin page can show it. Null for rows uploaded before this existed.
   */
  @Column({ type: 'varchar', length: 200, nullable: true })
  registrationNumberEnc: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  name: string | null;

  /** From the list's Program column; copied to the alumnus's profile. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  program: string | null;

  /** From the list's Faculty column, matched to AIUB_FACULTIES when possible. */
  @Column({ type: 'varchar', length: 150, nullable: true })
  faculty: string | null;

  /** E.g. "10th Convocation". */
  @Column({ type: 'varchar', length: 60, nullable: true })
  convocation: string | null;

  /** Wrong registration numbers in a row; reset by a right one. */
  @Column({ type: 'int', default: 0 })
  failedAttempts: number;

  /** Set after too many wrong numbers. */
  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
