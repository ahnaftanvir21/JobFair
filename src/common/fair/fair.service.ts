import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Central place for the fair-wide cutoff dates.
 * They are off unless STUDENT_DEADLINE or EMPLOYER_DEADLINE is set in .env.
 * Each job post's own deadline is separate and always applies.
 */
@Injectable()
export class FairService {
  constructor(private readonly config: ConfigService) {}

  get studentDeadline(): Date | null {
    return (
      this.config.get<Date | null>('fair.studentRegistrationDeadline') ?? null
    );
  }

  get employerDeadline(): Date | null {
    return (
      this.config.get<Date | null>('fair.employerRegistrationDeadline') ?? null
    );
  }

  /** Student registration, applying and CV drops. */
  assertStudentWindowOpen(action: string): void {
    this.assertOpen(this.studentDeadline, action);
  }

  /** Employer registration, new job posts and new candidate criteria. */
  assertEmployerWindowOpen(action: string): void {
    this.assertOpen(this.employerDeadline, action);
  }

  private assertOpen(deadline: Date | null, action: string): void {
    if (!deadline) return;
    if (Date.now() > deadline.getTime()) {
      const date = deadline.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Dhaka',
      });
      throw new ForbiddenException(`${action} closed on ${date}`);
    }
  }
}
