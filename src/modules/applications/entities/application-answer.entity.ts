import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  type Relation,
} from 'typeorm';
import { JobQuestion } from '../../jobs/entities/job-question.entity.js';
import type { Application } from './application.entity.js';

/** A student's answer to one job question, saved with the application. */
@Entity('application_answers')
@Unique(['applicationId', 'questionId'])
export class ApplicationAnswer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  applicationId: string;

  @ManyToOne('Application', 'answers', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'application_id' })
  application: Relation<Application>;

  @Column({ type: 'uuid' })
  questionId: string;

  @ManyToOne(() => JobQuestion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question: Relation<JobQuestion>;

  @Column({ type: 'text' })
  answer: string;
}
