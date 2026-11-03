import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { ReferenceRelation } from '../../../common/enums/index.js';
import type { StudentProfile } from './student-profile.entity.js';

@Entity('student_references')
export class Reference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  studentId: string;

  @ManyToOne('StudentProfile', 'references', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student: Relation<StudentProfile>;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 120 })
  designation: string;

  @Column({ type: 'varchar', length: 200 })
  organization: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 20 })
  mobile: string;

  @Column({ type: 'enum', enum: ReferenceRelation })
  relation: ReferenceRelation;
}
