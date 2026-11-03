import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { QuestionType } from '../../../common/enums/index.js';
import type { JobPost } from './job-post.entity.js';

/** A screening or psychometric question the employer adds to a job post. */
@Entity('job_questions')
export class JobQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  jobPostId: string;

  @ManyToOne('JobPost', 'questions', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_post_id' })
  jobPost: Relation<JobPost>;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'enum', enum: QuestionType, default: QuestionType.TEXT })
  type: QuestionType;

  /** Choices for single-choice questions. Empty for text questions. */
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  options: string[];

  @Column({ type: 'boolean', default: true })
  isRequired: boolean;

  /** Display order on the apply form, starting at 1. */
  @Column({ name: 'sort_order', type: 'smallint' })
  order: number;
}
