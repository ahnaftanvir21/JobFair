import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { ExperienceJobType } from '../../../common/enums/index.js';
import type { StudentProfile } from './student-profile.entity.js';

/** One "Experience" block. A student may add several. */
@Entity('experiences')
export class Experience {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  studentId: string;

  @ManyToOne('StudentProfile', 'experiences', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student: Relation<StudentProfile>;

  @Column({ type: 'varchar', length: 200 })
  companyName: string;

  @Column({ type: 'varchar', length: 120 })
  industryType: string;

  @Column({ type: 'enum', enum: ExperienceJobType })
  jobType: ExperienceJobType;

  @Column({ type: 'varchar', length: 120 })
  designation: string;

  /** YYYY-MM-DD */
  @Column({ type: 'date' })
  startDate: string;

  /** YYYY-MM-DD, or null while the job is continuing. */
  @Column({ type: 'date', nullable: true })
  endDate: string | null;

  @Column({ type: 'text', nullable: true })
  responsibilities: string | null;
}
