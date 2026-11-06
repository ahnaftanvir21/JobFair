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
import { EmployerStatus } from '../../../common/enums/index.js';
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

  /**
   * Admin review. Only approved companies can post jobs or criteria, see
   * students and applicants, and appear to students and visitors.
   * New registrations save pending explicitly; the column default is approved
   * so companies made before reviews existed stay approved.
   */
  @Column({
    type: 'enum',
    enum: EmployerStatus,
    default: EmployerStatus.APPROVED,
  })
  status: EmployerStatus;

  /** Why the admin rejected the registration. Cleared when approved. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  rejectionReason: string | null;

  /** When an admin last approved or rejected the company. */
  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  /** Flyer: "Any ongoing hiring?" Yes means job posts, No means candidate criteria. */
  @Column({ type: 'boolean', default: true })
  hasOngoingHiring: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
