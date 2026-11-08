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
    if (user.role === UserRole.EMPLOYER) {
      // Approved companies only.
      if (kind !== FileKind.CV && kind !== FileKind.PICTURE) {
        const rows: unknown[] = await this.dataSource.query(
          `SELECT 1 FROM employer_profiles WHERE user_id = $1 AND status = 'approved'`,
          [user.id],
        );
        return rows.length > 0;
      }
      // CVs and photos: only of students who applied to this company's jobs
      // or sent their CV to it.
      const rows: unknown[] = await this.dataSource.query(
        `WITH company AS (
           SELECT id FROM employer_profiles WHERE user_id = $1 AND status = 'approved'
         ), sent AS (
           SELECT a.student_id, a.cv_url FROM applications a
             JOIN job_posts j ON j.id = a.job_post_id
            WHERE j.employer_id IN (SELECT id FROM company)
           UNION ALL
           SELECT d.student_id, d.cv_url FROM cv_drops d
            WHERE d.employer_id IN (SELECT id FROM company)
         )
         SELECT 1 FROM sent x JOIN student_profiles sp ON sp.id = x.student_id
          WHERE x.cv_url = $2 OR sp.cv_url = $2 OR sp.profile_picture_url = $2
          LIMIT 1`,
        [user.id, url],
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
