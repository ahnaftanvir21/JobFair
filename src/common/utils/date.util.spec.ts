import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FairService } from '../fair/fair.service.js';
import { isOnOrBeforeDeadline, todayInDhaka } from './date.util.js';

describe('date utils', () => {
  it('uses Dhaka time (UTC+6) for today', () => {
    // 20:00 UTC on 4 Dec is already 02:00 on 5 Dec in Dhaka.
    expect(todayInDhaka(new Date('2026-12-04T20:00:00Z'))).toBe('2026-12-05');
    expect(todayInDhaka(new Date('2026-12-04T17:59:00Z'))).toBe('2026-12-04');
  });

  it('keeps a job open through its deadline day', () => {
    const lastDay = new Date('2026-12-04T17:59:00Z'); // 23:59 in Dhaka
    const nextDay = new Date('2026-12-04T18:00:00Z'); // 00:00 next day in Dhaka
    expect(isOnOrBeforeDeadline('2026-12-04', lastDay)).toBe(true);
    expect(isOnOrBeforeDeadline('2026-12-04', nextDay)).toBe(false);
  });
});

describe('FairService', () => {
  function makeFair(student: string | null, employer: string | null) {
    const values: Record<string, Date | null> = {
      'fair.studentRegistrationDeadline': student ? new Date(student) : null,
      'fair.employerRegistrationDeadline': employer ? new Date(employer) : null,
    };
    return new FairService({
      get: (key: string) => values[key],
    } as unknown as ConfigService);
  }

  it('has no cutoff when no deadline is set', () => {
    const fair = makeFair(null, null);
    expect(() => fair.assertStudentWindowOpen('Applying')).not.toThrow();
    expect(() => fair.assertEmployerWindowOpen('Posting')).not.toThrow();
  });

  it('allows actions before the deadline', () => {
    const fair = makeFair('2099-01-01', '2099-01-01');
    expect(() => fair.assertStudentWindowOpen('Applying')).not.toThrow();
    expect(() => fair.assertEmployerWindowOpen('Posting')).not.toThrow();
  });

  it('blocks students and employers separately after their deadlines', () => {
    const fair = makeFair('2000-01-01', '2099-01-01');
    expect(() => fair.assertStudentWindowOpen('Applying for jobs')).toThrow(
      new ForbiddenException('Applying for jobs closed on 1 January 2000'),
    );
    expect(() => fair.assertEmployerWindowOpen('Posting')).not.toThrow();
  });
});
