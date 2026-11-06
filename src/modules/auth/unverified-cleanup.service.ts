import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FileStorageService } from '../uploads/file-storage.service.js';
import {
  EmailVerificationService,
  VERIFY_TTL_MINUTES,
} from './email-verification.service.js';
import { SignupEmailService } from './signup-email.service.js';

const EVERY_MS = 5 * 60_000;

/**
 * Deletes company accounts that did not verify their email within 30 minutes
 * (the life of the code), with their company profile and logo. Also clears
 * old sign-up codes. Runs at start-up and every 5 minutes.
 */
@Injectable()
export class UnverifiedCleanupService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(UnverifiedCleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: FileStorageService,
    private readonly emailVerification: EmailVerificationService,
    private readonly signupEmail: SignupEmailService,
  ) {}

  onApplicationBootstrap() {
    void this.run();
    this.timer = setInterval(() => void this.run(), EVERY_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  async run(): Promise<number> {
    try {
      await this.signupEmail.removeExpired();
      if (!this.emailVerification.required) return 0;
      type Row = { email: string; logo_url: string | null };
      // For DELETE ... RETURNING the driver answers [rows, count].
      const result: [Row[], number] | Row[] = await this.dataSource.query(
        `DELETE FROM users u
             USING employer_profiles e
            WHERE e.user_id = u.id
              AND u.role = 'employer'
              AND u.email_verified = false
              AND u.created_at < now() - make_interval(mins => $1)
        RETURNING u.email, e.logo_url`,
        [VERIFY_TTL_MINUTES],
      );
      const rows: Row[] = Array.isArray(result[0])
        ? result[0]
        : (result as Row[]);
      for (const row of rows) await this.storage.remove(row.logo_url);
      if (rows.length) {
        this.logger.log(
          `Deleted ${rows.length} company account(s) that did not verify their email: ${rows.map((r) => r.email).join(', ')}`,
        );
      }
      return rows.length;
    } catch (err) {
      this.logger.error(`Cleanup failed: ${(err as Error).message}`);
      return 0;
    }
  }
}
