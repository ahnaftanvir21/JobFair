import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcryptjs';
import { DataSource, MoreThan, Repository } from 'typeorm';
import { MailService } from '../mail/mail.service.js';
import { UsersService } from '../users/users.service.js';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/index.js';
import { PasswordReset } from './entities/password-reset.entity.js';

export const RESET_TTL_MINUTES = 15;
/** Wrong codes allowed before the request stops working. */
export const MAX_CODE_ATTEMPTS = 5;
/** A new email is sent at most once per minute per account. */
const RESEND_COOLDOWN_MS = 60_000;

export const FORGOT_PASSWORD_MESSAGE =
  `If an account exists for this email, we sent a 6-digit code and a reset link. ` +
  `They expire in ${RESET_TTL_MINUTES} minutes.`;
const INVALID_CODE_MESSAGE = 'The code is wrong or has expired. Request a new one.';
const INVALID_LINK_MESSAGE = 'The reset link is invalid or has expired. Request a new one.';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function sameHash(a: string, b: string): boolean {
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @InjectRepository(PasswordReset)
    private readonly resetsRepo: Repository<PasswordReset>,
    private readonly usersService: UsersService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Always answers the same way, so nobody can find out which emails have accounts.
   * The email is sent in the background for the same reason (equal response time).
   */
  async requestReset(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(dto.email);
    if (user) {
      const recent = await this.resetsRepo.existsBy({
        userId: user.id,
        createdAt: MoreThan(new Date(Date.now() - RESEND_COOLDOWN_MS)),
      });
      if (!recent) {
        const { code, token } = await this.createReset(user.id);
        this.sendResetEmail(user.email, code, token).catch((err: Error) =>
          this.logger.error(`Could not send reset email to ${user.email}: ${err.message}`),
        );
      }
    }
    return { message: FORGOT_PASSWORD_MESSAGE };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const reset = dto.token
      ? await this.findByToken(dto.token)
      : await this.findByCode(dto.email!, dto.code!);

    const passwordHash = await hash(
      dto.newPassword,
      this.config.getOrThrow<number>('auth.bcryptRounds'),
    );
    await this.dataSource.transaction(async (manager) => {
      // Deleting first means two requests with the same code cannot both succeed.
      const { affected } = await manager.delete(PasswordReset, { id: reset.id });
      if (!affected) throw new BadRequestException(INVALID_CODE_MESSAGE);
      await this.usersService.updatePassword(reset.userId, passwordHash, manager);
      // Any other open reset requests for this account are no longer needed.
      await manager.delete(PasswordReset, { userId: reset.userId });
    });
    return { message: 'Password changed. Log in with your new password.' };
  }

  /** Replaces any earlier request, so only the newest code and link work. */
  private async createReset(userId: string) {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const token = randomBytes(32).toString('hex');
    await this.resetsRepo.delete({ userId });
    await this.resetsRepo.save(
      this.resetsRepo.create({
        userId,
        codeHash: sha256(code),
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
      }),
    );
    return { code, token };
  }

  private async findByToken(token: string): Promise<PasswordReset> {
    const reset = await this.resetsRepo.findOneBy({ tokenHash: sha256(token) });
    if (!reset || reset.expiresAt <= new Date()) {
      throw new BadRequestException(INVALID_LINK_MESSAGE);
    }
    return reset;
  }

  private async findByCode(email: string, code: string): Promise<PasswordReset> {
    const user = await this.usersService.findByEmail(email);
    const reset = user
      ? await this.resetsRepo.findOneBy({ userId: user.id })
      : null;
    if (
      !reset ||
      reset.expiresAt <= new Date() ||
      reset.attempts >= MAX_CODE_ATTEMPTS
    ) {
      throw new BadRequestException(INVALID_CODE_MESSAGE);
    }
    // Count the attempt atomically, so parallel guesses cannot go past the limit.
    const { affected } = await this.resetsRepo
      .createQueryBuilder()
      .update()
      .set({ attempts: () => 'attempts + 1' })
      .where('id = :id AND attempts < :max', {
        id: reset.id,
        max: MAX_CODE_ATTEMPTS,
      })
      .execute();
    if (!affected) throw new BadRequestException(INVALID_CODE_MESSAGE);

    if (!sameHash(sha256(code), reset.codeHash)) {
      const left = MAX_CODE_ATTEMPTS - reset.attempts - 1;
      throw new BadRequestException(
        left > 0
          ? `The code is wrong. ${left} ${left === 1 ? 'try' : 'tries'} left.`
          : 'The code was wrong too many times. Request a new one.',
      );
    }
    return reset;
  }

  private async sendResetEmail(to: string, code: string, token: string) {
    const base = this.config.getOrThrow<string>('mail.resetPasswordUrl');
    const link = `${base}${base.includes('?') ? '&' : '?'}token=${token}`;
    await this.mail.send({
      to,
      subject: 'Reset your AIUB Job Fair password',
      text:
        `We received a request to reset your AIUB Job Fair password.\n\n` +
        `Your code: ${code}\n\n` +
        `Or open this link to set a new password:\n${link}\n\n` +
        `The code and link expire in ${RESET_TTL_MINUTES} minutes and work once.\n` +
        `If you did not ask for this, ignore this email. Your password stays the same.`,
      html:
        `<p>We received a request to reset your AIUB Job Fair password.</p>` +
        `<p>Your code: <strong style="font-size:20px;letter-spacing:3px">${code}</strong></p>` +
        `<p>Or <a href="${link}">click here to set a new password</a>.</p>` +
        `<p>The code and link expire in ${RESET_TTL_MINUTES} minutes and work once.</p>` +
        `<p>If you did not ask for this, ignore this email. Your password stays the same.</p>`,
    });
  }
}
