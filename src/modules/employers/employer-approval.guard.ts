import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { ALLOW_PENDING_EMPLOYER_KEY } from '../../common/decorators/allow-pending-employer.decorator.js';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';
import { EmployerStatus, UserRole } from '../../common/enums/index.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { EmployerProfile } from './entities/employer-profile.entity.js';

/**
 * Global guard, runs after the role check: employers can use logged-in routes
 * only after an admin approved their company. Routes marked
 * @AllowPendingEmployer() (own profile and logo) stay open meanwhile.
 * Public routes decide visibility themselves.
 */
@Injectable()
export class EmployerApprovalGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (user?.role !== UserRole.EMPLOYER) return true;

    const targets = [context.getHandler(), context.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets) ||
      this.reflector.getAllAndOverride<boolean>(
        ALLOW_PENDING_EMPLOYER_KEY,
        targets,
      )
    ) {
      return true;
    }

    const profile = await this.dataSource
      .getRepository(EmployerProfile)
      .findOne({
        where: { userId: user.id },
        select: { id: true, status: true, rejectionReason: true },
      });
    // No profile: the route itself answers "Company profile not found".
    if (!profile || profile.status === EmployerStatus.APPROVED) return true;

    throw new ForbiddenException(
      profile.status === EmployerStatus.REJECTED
        ? `Your company registration was rejected${
            profile.rejectionReason ? `: ${profile.rejectionReason}` : ''
          }. Update your company profile to send it for review again.`
        : 'Your company is waiting for admin approval. You can edit your company profile and logo meanwhile.',
    );
  }
}
