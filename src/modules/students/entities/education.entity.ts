import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { EducationLevel } from '../../../common/enums/index.js';
import type { StudentProfile } from './student-profile.entity.js';

/** One row of "Educational Qualification": SSC, HSC, BSc, MSc 1, MSc 2, Professional. */
@Entity('educations')
export class Education {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  studentId: string;

  @ManyToOne('StudentProfile', 'educations', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student: Relation<StudentProfile>;

  @Column({ type: 'enum', enum: EducationLevel })
  level: EducationLevel;

  /** School or college name. */
  @Column({ type: 'varchar', length: 200 })
  institutionName: string;

  @Column({ type: 'numeric', precision: 4, scale: 2, nullable: true })
  cgpa: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  subject: string | null;

  @Column({ type: 'smallint', nullable: true })
  passingYear: number | null;

  /** Degree title, mainly for the "Professional Degree" row. */
  @Column({ type: 'varchar', length: 150, nullable: true })
  degreeName: string | null;
}
