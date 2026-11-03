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
import { PreferredJobType, StudyLevel } from '../../../common/enums/index.js';
import { EmployerProfile } from '../../employers/entities/employer-profile.entity.js';

/** Flyer "No ongoing hiring" branch: an employer posts desired candidate criteria. */
@Entity('candidate_criteria')
export class CandidateCriteria {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  employerId: string;

  @ManyToOne(() => EmployerProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employer_id' })
  employer: Relation<EmployerProfile>;

  @Column({ type: 'varchar', length: 150 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  /** Used for matching. Null means any. */
  @Column({ type: 'enum', enum: PreferredJobType, nullable: true })
  preferredJobType: PreferredJobType | null;

  /** Used for matching. Null means any. */
  @Column({ type: 'enum', enum: StudyLevel, nullable: true })
  studyLevel: StudyLevel | null;

  /** Used for matching against students' preferred industries. Null means any. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  industryType: string | null;

  @Column({ type: 'text', nullable: true })
  skills: string | null;

  /** Optional PDF describing the criteria. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  attachmentUrl: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
