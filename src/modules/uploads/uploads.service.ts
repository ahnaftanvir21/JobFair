import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../common/enums/index.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { FileKind } from './file-kind.enum.js';

/** Decides who may download a stored file. */
@Injectable()
export class UploadsService {
  constructor(private readonly dataSource: DataSource) {}

  async canAccess(
    user: AuthUser,
    kind: FileKind,
    url: string,
  ): Promise<boolean> {
    if (user.role === UserRole.ADMIN) return true;

    // Employers can browse all students, so they can read every file,
    // but only once an admin has approved the company.
    if (user.role === UserRole.EMPLOYER) {
      const rows: unknown[] = await this.dataSource.query(
        `SELECT 1 FROM employer_profiles WHERE user_id = $1 AND status = 'approved'`,
        [user.id],
      );
      return rows.length > 0;
    }

    // Pictures and criteria attachments are visible to every logged-in student.
    if (kind !== FileKind.CV) return true;

    // A student can read only their own CVs.
    const rows: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM student_profiles sp
        WHERE sp.user_id = $1
          AND (
            sp.cv_url = $2
            OR EXISTS (SELECT 1 FROM applications a WHERE a.student_id = sp.id AND a.cv_url = $2)
            OR EXISTS (SELECT 1 FROM cv_drops d WHERE d.student_id = sp.id AND d.cv_url = $2)
          )
        LIMIT 1`,
      [user.id, url],
    );
    return rows.length > 0;
  }
}
