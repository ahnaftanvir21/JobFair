import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { compare, hash } from 'bcryptjs';
import { Repository } from 'typeorm';
import { UserRole } from '../../common/enums/index.js';
import { User } from '../users/entities/user.entity.js';

/**
 * Creates the admin account from ADMIN_EMAIL and ADMIN_PASSWORD when the
 * server starts, so no terminal is needed on the host. Changing
 * ADMIN_PASSWORD and restarting changes the password (and logs the admin out
 * everywhere). Admin accounts can't be created through the API.
 */
@Injectable()
export class AdminAccountService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminAccountService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = this.config.get<string | null>('auth.adminEmail');
    const password = this.config.get<string | null>('auth.adminPassword');
    if (!email || !password) {
      this.logger.warn(
        'No admin account: set ADMIN_EMAIL and ADMIN_PASSWORD to create one.',
      );
      return;
    }
    if (password.length < 8 || password.length > 72) {
      this.logger.error('ADMIN_PASSWORD must be 8 to 72 characters. No admin account was set up.');
      return;
    }
    try {
      await this.ensureAdmin(email, password);
    } catch (err) {
      this.logger.error(`Could not set up the admin account: ${String(err)}`);
    }
  }

  private async ensureAdmin(email: string, password: string): Promise<void> {
    const rounds = this.config.getOrThrow<number>('auth.bcryptRounds');
    const existing = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email })
      .getOne();

    if (!existing) {
      await this.users.save(
        this.users.create({
          email,
          passwordHash: await hash(password, rounds),
          role: UserRole.ADMIN,
          emailVerified: true,
        }),
      );
      this.logger.log(`Admin account created for ${email}`);
      return;
    }
    if (existing.role !== UserRole.ADMIN) {
      this.logger.error(
        `ADMIN_EMAIL ${email} already belongs to a ${existing.role} account. Use another email for the admin.`,
      );
      return;
    }
    if (!(await compare(password, existing.passwordHash))) {
      await this.users.update(existing.id, {
        passwordHash: await hash(password, rounds),
        tokenVersion: () => 'token_version + 1',
        emailVerified: true,
      });
      this.logger.log(`Admin password updated from ADMIN_PASSWORD for ${email}`);
    }
  }
}
