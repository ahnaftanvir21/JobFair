import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '../../../common/enums/index.js';

/** Login account shared by students and employers (email + password). */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stored lower-case so login is case-insensitive. */
  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  /** Never returned by default queries. */
  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    select: false,
  })
  passwordHash: string;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  /**
   * Goes up by one on every password reset. Each login token carries the
   * version it was issued with, so older tokens stop working. Hidden by default.
   */
  @Column({ name: 'token_version', type: 'int', default: 0, select: false })
  tokenVersion: number;

  /**
   * Set once the owner proves the email is theirs (code, link or password
   * reset). New registrations save false explicitly; the column default is
   * true so accounts made before email checks existed count as verified.
   */
  @Column({ name: 'email_verified', type: 'boolean', default: true })
  emailVerified: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
