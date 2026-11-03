import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { ApplicationStatus, JoiningDate } from '../../../common/enums/index.js';
import { JobPost } from '../../jobs/entities/job-post.entity.js';
import { StudentProfile } from '../../students/entities/student-profile.entity.js';
import type { ApplicationAnswer } from './application-answer.entity.js';

/** Sheet 2 "Student Interface". Salary expectation was struck out, so it is omitted. */
@Entity('applications')
@Unique(['studentId', 'jobPostId'])
export class Application {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  jobPostId: string;

  @ManyToOne(() => JobPost, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_post_id' })
  jobPost: Relation<JobPost>;

  @Column({ type: 'uuid' })
  studentId: string;

  @ManyToOne(() => StudentProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student: Relation<StudentProfile>;

  /** One answer per question on the job post. */
  @OneToMany('ApplicationAnswer', 'application', { cascade: true })
  answers: Relation<ApplicationAnswer>[];

  @Column({ type: 'enum', enum: JoiningDate })
  joiningDate: JoiningDate;

  /** CV uploaded with the application, or the profile CV at the time of applying. */
  @Column({ type: 'varchar', length: 255 })
  cvUrl: string;

  @Column({
    type: 'enum',
    enum: ApplicationStatus,
    default: ApplicationStatus.SUBMITTED,
  })
  status: ApplicationStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
