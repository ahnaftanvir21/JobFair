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
    // Pictures, logos and criteria attachments are visible to every logged-in user.
    if (kind !== FileKind.CV) return true;

    // Employers can browse all students, so they can read every CV.
    if (user.role === UserRole.EMPLOYER) return true;

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
