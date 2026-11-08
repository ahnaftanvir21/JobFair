import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * One current student from the list the fair office uploads (no registration
 * number). After a current student verifies the AIUB email, the program and
 * faculty from this list fill in the profile and cannot be changed.
 */
@Entity('current_student_records')
export class CurrentStudentRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  aiubId: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  name: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  program: string | null;

  /** Matched to AIUB_FACULTIES when possible. */
  @Column({ type: 'varchar', length: 150, nullable: true })
  faculty: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
