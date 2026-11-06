import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Email check before an account exists (company sign-up asks for it right
 * after email and password). The email gets a 6-digit code; the right code
 * returns a one-time email token that registration accepts as proof.
 * Only hashes are stored, one row per email.
 */
@Entity('signup_email_codes')
export class SignupEmailCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ name: 'code_hash', type: 'varchar', length: 64 })
  codeHash: string;

  /** Set once the code is right: hash of the email token handed back. */
  @Column({ name: 'proof_hash', type: 'varchar', length: 64, nullable: true })
  proofHash: string | null;

  /** Wrong codes entered so far. The code is dead after too many. */
  @Column({ type: 'int', default: 0 })
  attempts: number;

  /** When the code (or, once verified, the email token) stops working. */
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'sent_at', type: 'timestamptz' })
  sentAt: Date;
}
