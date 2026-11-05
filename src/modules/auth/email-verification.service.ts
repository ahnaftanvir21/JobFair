import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { MailService } from '../mail/mail.service.js';
import { UsersService } from '../users/users.service.js';
import type { AuthUserDto } from './dto/index.js';
import { EmailVerification } from './entities/email-verification.entity.js';

export const VERIFY_TTL_MINUTES = 30;
/** Wrong codes allowed before the code stops working. */
export const MAX_VERIFY_ATTEMPTS = 5;
/** A new email is sent at most once per minute per account. */
const RESEND_COOLDOWN_MS = 60_000;

const INVALID_CODE_MESSAGE =
  'The code is wrong or has expired. Ask for a new one.';
const INVALID_LINK_MESSAGE =
  'The verification link is invalid or has expired. Log in and ask for a new code.';
export const VERIFIED_MESSAGE = 'Email verified. Your account is ready.';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

function sameHash(a: string, b: string): boolean {
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    @InjectRepository(EmailVerification)
    private readonly repo: Repository<EmailVerification>,
    private readonly usersService: UsersService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  /** True unless REQUIRE_EMAIL_VERIFICATION=false. */
  get required(): boolean {
    return this.config.get<boolean>('auth.requireEmailVerification') ?? true;
  }

  /**
   * Creates a new code and link (replacing any earlier one) and emails them.
   * The email goes out in the background so registration stays fast.
   */
  async start(user: { id: string; email: string }): Promise<void> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const token = randomBytes(32).toString('hex');
    await this.repo.delete({ userId: user.id });
    await this.repo.save(
      this.repo.create({
        userId: user.id,
        codeHash: sha256(code),
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + VERIFY_TTL_MINUTES * 60_000),
      }),
    );
    this.sendEmail(user.email, code, token).catch((err: Error) =>
      this.logger.error(
        `Could not send verification email to ${user.email}: ${err.message}`,
      ),
    );
  }

  /** Sends a fresh code to a logged-in account that is not verified yet. */
  async resend(authUser: AuthUser): Promise<{ message: string }> {
    const user = await this.usersService.findById(authUser.id);
    if (!user) throw new BadRequestException('Account no longer exists');
    if (user.emailVerified) {
      throw new BadRequestException('Your email is already verified');
    }
    const last = await this.repo.findOneBy({ userId: user.id });
    if (last && last.createdAt.getTime() > Date.now() - RESEND_COOLDOWN_MS) {
      throw new HttpException(
        'We just sent a code. Wait a minute before asking for another one.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.start(user);
    return {
      message: `We sent a new 6-digit code to ${user.email}. It expires in ${VERIFY_TTL_MINUTES} minutes.`,
    };
  }

  /** Checks the 6-digit code for the logged-in account. */
  async verifyCode(
    authUser: AuthUser,
    code: string,
  ): Promise<{ message: string; user: AuthUserDto }> {
    const user = await this.usersService.findById(authUser.id);
    if (!user) throw new BadRequestException('Account no longer exists');
    if (!user.emailVerified) {
      const row = await this.repo.findOneBy({ userId: user.id });
      if (
        !row ||
        row.expiresAt <= new Date() ||
        row.attempts >= MAX_VERIFY_ATTEMPTS
      ) {
        throw new BadRequestException(INVALID_CODE_MESSAGE);
      }
      // Count the attempt atomically, so parallel guesses cannot pass the limit.
      const { affected } = await this.repo
        .createQueryBuilder()
        .update()
        .set({ attempts: () => 'attempts + 1' })
        .where('id = :id AND attempts < :max', {
          id: row.id,
          max: MAX_VERIFY_ATTEMPTS,
        })
        .execute();
      if (!affected) throw new BadRequestException(INVALID_CODE_MESSAGE);
      if (!sameHash(sha256(code), row.codeHash)) {
        const left = MAX_VERIFY_ATTEMPTS - row.attempts - 1;
        throw new BadRequestException(
          left > 0
            ? `The code is wrong. ${left} ${left === 1 ? 'try' : 'tries'} left.`
            : 'The code was wrong too many times. Ask for a new one.',
        );
      }
      await this.markVerified(user.id);
    }
    return {
      message: VERIFIED_MESSAGE,
      user: { id: user.id, email: user.email, role: user.role, emailVerified: true },
    };
  }

  /** Checks the token from the email link. Works without logging in. */
  async verifyToken(token: string): Promise<{ message: string }> {
    const row = await this.repo.findOneBy({ tokenHash: sha256(token) });
    if (!row || row.expiresAt <= new Date()) {
      throw new BadRequestException(INVALID_LINK_MESSAGE);
    }
    await this.markVerified(row.userId);
    return { message: VERIFIED_MESSAGE };
  }

  private async markVerified(userId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.usersService.markEmailVerified(userId, manager);
      await manager.delete(EmailVerification, { userId });
    });
  }

  private verifyUrl(token: string): string {
    // The verify page sits next to the reset page on the frontend.
    const reset = this.config.getOrThrow<string>('mail.resetPasswordUrl');
    let base: string;
    try {
      base = `${new URL(reset).origin}/verify-email`;
    } catch {
      base = 'http://localhost:5173/verify-email';
    }
    return `${base}?token=${token}`;
  }

  private async sendEmail(to: string, code: string, token: string) {
    const link = this.verifyUrl(token);
    await this.mail.send({
      to,
      subject: 'Verify your email for AIUB Job Fair 2026',
      text:
        `Welcome to AIUB Job Fair 2026.\n\n` +
        `Your verification code: ${code}\n\n` +
        `Or open this link to verify your email:\n${link}\n\n` +
        `The code and link expire in ${VERIFY_TTL_MINUTES} minutes.\n` +
        `If you did not create an account, ignore this email.`,
      html:
        `<p>Welcome to AIUB Job Fair 2026.</p>` +
        `<p>Your verification code: <strong style="font-size:20px;letter-spacing:3px">${code}</strong></p>` +
        `<p>Or <a href="${link}">click here to verify your email</a>.</p>` +
        `<p>The code and link expire in ${VERIFY_TTL_MINUTES} minutes.</p>` +
        `<p>If you did not create an account, ignore this email.</p>`,
    });
  }
}
