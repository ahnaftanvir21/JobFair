import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import {
  EmploymentStatus,
  JobLocation,
  Workplace,
} from '../../../common/enums/index.js';
import { EmployerProfile } from '../../employers/entities/employer-profile.entity.js';
import type { JobQuestion } from './job-question.entity.js';

/** Sheet 2 "Job Post Button". */
@Entity('job_posts')
@Index(['isActive', 'deadline'])
export class JobPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  employerId: string;

  @ManyToOne(() => EmployerProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employer_id' })
  employer: Relation<EmployerProfile>;

  @Column({ type: 'varchar', length: 150 })
  positionName: string;

  @Column({ type: 'enum', enum: JobLocation })
  location: JobLocation;

  @Column({ type: 'enum', enum: Workplace })
  workplace: Workplace;

  @Column({ type: 'text' })
  educationRequirement: string;

  @Column({ type: 'text', nullable: true })
  additionalRequirements: string | null;

  @Column({ type: 'text' })
  responsibilities: string;

  @Column({ type: 'text' })
  skillsAndExpertise: string;

  @Column({ type: 'enum', enum: EmploymentStatus })
  employmentStatus: EmploymentStatus;

  @Column({ type: 'boolean', default: true })
  salaryNegotiable: boolean;

  /** Free text such as "30,000 - 40,000 BDT". Required when not negotiable. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  salaryAmount: string | null;

  @Column({ type: 'text', default: 'As per company policy' })
  compensationAndBenefits: string;

  /** Last day to apply, YYYY-MM-DD in Dhaka time. */
  @Column({ type: 'date' })
  deadline: string;

  /** False once the employer closes the post. */
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /** Screening or psychometric questions, any number per job. */
  @OneToMany('JobQuestion', 'jobPost', { cascade: true })
  questions: Relation<JobQuestion>[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
