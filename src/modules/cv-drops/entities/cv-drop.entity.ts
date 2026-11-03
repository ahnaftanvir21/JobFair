import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { EmployerProfile } from '../../employers/entities/employer-profile.entity.js';
import { StudentProfile } from '../../students/entities/student-profile.entity.js';

/** Flyer "No" branch: a student just drops a CV without applying to a job. */
@Entity('cv_drops')
export class CvDrop {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  studentId: string;

  @ManyToOne(() => StudentProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student: Relation<StudentProfile>;

  /** Company the CV is aimed at. Null means the general pool every employer sees. */
  @Column({ type: 'uuid', nullable: true })
  employerId: string | null;

  @ManyToOne(() => EmployerProfile, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'employer_id' })
  employer: Relation<EmployerProfile> | null;

  @Column({ type: 'varchar', length: 255 })
  cvUrl: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
