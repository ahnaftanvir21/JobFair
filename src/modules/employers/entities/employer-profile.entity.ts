import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';

/** Sheet 2 "Company Profile" plus the flyer's employer registration fields. */
@Entity('employer_profiles')
export class EmployerProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  @Column({ type: 'varchar', length: 200 })
  companyName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  websiteUrl: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  logoUrl: string | null;

  @Column({ type: 'varchar', length: 120 })
  industryType: string;

  @Column({ type: 'text' })
  about: string;

  @Column({ type: 'varchar', length: 120 })
  hrName: string;

  @Column({ type: 'varchar', length: 255 })
  hrEmail: string;

  @Column({ type: 'varchar', length: 20 })
  hrMobileNumber: string;

  /** Booth at the fair, for example "B-12". Set by the company. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  boothNumber: string | null;

  /** Flyer: "Any ongoing hiring?" Yes means job posts, No means candidate criteria. */
  @Column({ type: 'boolean', default: true })
  hasOngoingHiring: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
