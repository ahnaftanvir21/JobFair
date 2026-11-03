import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import {
  Gender,
  PreferredJobType,
  StudyLevel,
} from '../../../common/enums/index.js';
import { User } from '../../users/entities/user.entity.js';
import type { Education } from './education.entity.js';
import type { Experience } from './experience.entity.js';
import type { Reference } from './reference.entity.js';

/** Sheet 1 "Profile Creation" plus the flyer's student registration fields. */
@Entity('student_profiles')
export class StudentProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  // Step 1: flyer registration
  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  aiubId: string;

  @Column({ type: 'varchar', length: 20 })
  mobileNumber: string;

  @Column({ type: 'enum', enum: PreferredJobType })
  preferredJobType: PreferredJobType;

  @Column({ type: 'enum', enum: StudyLevel })
  studyLevel: StudyLevel;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  preferredIndustryTypes: string[];

  @Column({ type: 'boolean' })
  seminarParticipation: boolean;

  // Step 2: full profile
  @Column({ type: 'varchar', length: 255, nullable: true })
  profilePictureUrl: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  address: string | null;

  @Column({ type: 'enum', enum: Gender, nullable: true })
  gender: Gender | null;

  @Column({ type: 'text', nullable: true })
  extracurricularActivities: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  linkedinUrl: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  githubUrl: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  cvUrl: string | null;

  @OneToMany('Education', 'student')
  educations: Relation<Education>[];

  @OneToMany('Experience', 'student')
  experiences: Relation<Experience>[];

  @OneToMany('Reference', 'student')
  references: Relation<Reference>[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
