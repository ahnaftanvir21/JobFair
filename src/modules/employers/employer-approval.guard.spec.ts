import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { ALLOW_PENDING_EMPLOYER_KEY } from '../../common/decorators/allow-pending-employer.decorator.js';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';
import { EmployerStatus, UserRole } from '../../common/enums/index.js';
import { EmployerApprovalGuard } from './employer-approval.guard.js';

function setup(opts: {
  role?: UserRole;
  profile?: { status: EmployerStatus; rejectionReason?: string | null } | null;
  meta?: Record<string, boolean>;
}) {
  const findOne = vi.fn(async () => opts.profile ?? null);
  const dataSource = {
    getRepository: () => ({ findOne }),
  } as unknown as DataSource;
  const reflector = {
    getAllAndOverride: (key: string) => opts.meta?.[key] ?? false,
  } as unknown as Reflector;
  const user = opts.role ? { id: 'u1', email: 'a@b.com', role: opts.role } : undefined;
  const context = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return {
    run: () => new EmployerApprovalGuard(reflector, dataSource).canActivate(context),
    findOne,
  };
}

describe('EmployerApprovalGuard', () => {
  it('ignores students, admins and visitors without a database lookup', async () => {
    for (const role of [UserRole.STUDENT, UserRole.ADMIN, undefined]) {
      const t = setup({ role });
      await expect(t.run()).resolves.toBe(true);
      expect(t.findOne).not.toHaveBeenCalled();
    }
  });

  it('lets approved employers through', async () => {
    const t = setup({
      role: UserRole.EMPLOYER,
      profile: { status: EmployerStatus.APPROVED },
    });
    await expect(t.run()).resolves.toBe(true);
  });

  it('blocks pending employers with a waiting message', async () => {
    const t = setup({
      role: UserRole.EMPLOYER,
      profile: { status: EmployerStatus.PENDING },
    });
    await expect(t.run()).rejects.toThrow(
      /waiting for admin approval/,
    );
  });

  it('blocks rejected employers and shows the reason', async () => {
    const t = setup({
      role: UserRole.EMPLOYER,
      profile: { status: EmployerStatus.REJECTED, rejectionReason: 'Fake website' },
    });
    await expect(t.run()).rejects.toThrow(
      new ForbiddenException(
        'Your company registration was rejected: Fake website. Update your company profile to send it for review again.',
      ),
    );
  });

  it('lets pending employers use routes marked for them, and public routes', async () => {
    for (const key of [ALLOW_PENDING_EMPLOYER_KEY, IS_PUBLIC_KEY]) {
      const t = setup({
        role: UserRole.EMPLOYER,
        profile: { status: EmployerStatus.PENDING },
        meta: { [key]: true },
      });
      await expect(t.run()).resolves.toBe(true);
    }
  });
});
