import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, LessThan, Repository } from 'typeorm';
import { MailService } from '../mail/mail.service.js';
import { UsersService } from '../users/users.service.js';
import { SignupEmailCode } from './entities/signup-email-code.entity.js';
import {
  MAX_VERIFY_ATTEMPTS,
  VERIFY_TTL_MINUTES,
} from './email-verification.service.js';

/** How long the email token from a right code can be used to register. */
export const EMAIL_TOKEN_TTL_MINUTES = 120;
const RESEND_COOLDOWN_MS = 60_000;

const INVALID_CODE_MESSAGE =
  'The code is wrong or has expired. Ask for a new one.';
const EXPIRED_PROOF_MESSAGE =
  'Your email check has expired. Go back to step 1 and verify your email again.';
export const EMAIL_TAKEN_MESSAGE =
  'An account with this email already exists. Log in, or use Forgot password if it is yours.';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

function sameHash(a: string, b: string): boolean {
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/** Checks an email address before the account is created. */
@Injectable()
export class SignupEmailService {
  private readonly logger = new Logger(SignupEmailService.name);

  constructor(
    @InjectRepository(SignupEmailCode)
    private readonly repo: Repository<SignupEmailCode>,
    private readonly usersService: UsersService,
    private readonly mail: MailService,
  ) {}

  /** Emails a 6-digit code. At most once a minute per email; a new code replaces the old one. */
  async sendCode(email: string): Promise<{ message: string }> {
    if (await this.usersService.emailExists(email)) {
      throw new ConflictException(EMAIL_TAKEN_MESSAGE);
    }
    const last = await this.repo.findOneBy({ email });
    if (last && last.sentAt.getTime() > Date.now() - RESEND_COOLDOWN_MS) {
      throw new HttpException(
        'We just sent a code. Wait a minute before asking for another one.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const now = new Date();
    await this.repo.upsert(
      {
        email,
        codeHash: sha256(code),
        proofHash: null,
        attempts: 0,
        sentAt: now,
        expiresAt: new Date(now.getTime() + VERIFY_TTL_MINUTES * 60_000),
      },
      ['email'],
    );
    this.sendEmail(email, code).catch((err: Error) =>
      this.logger.error(
        `Could not send sign-up code to ${email}: ${err.message}`,
      ),
    );
    return {
      message: `We sent a 6-digit code to ${email}. It expires in ${VERIFY_TTL_MINUTES} minutes.`,
    };
  }

  /** Checks the code. A right code returns the email token used to register. */
  async checkCode(
    email: string,
    code: string,
  ): Promise<{ message: string; emailToken: string }> {
    const row = await this.repo.findOneBy({ email });
    if (
      !row ||
      row.proofHash ||
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
      .where('id = :id AND attempts < :max AND proof_hash IS NULL', {
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
    const emailToken = randomBytes(32).toString('hex');
    await this.repo.update(row.id, {
      proofHash: sha256(emailToken),
      expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MINUTES * 60_000),
    });
    return { message: 'Email verified.', emailToken };
  }

  /** Uses up the email token during registration. Throws if it is wrong or expired. */
  async consumeToken(
    email: string,
    emailToken: string,
    manager: EntityManager,
  ): Promise<void> {
    const { affected } = await manager
      .createQueryBuilder()
      .delete()
      .from(SignupEmailCode)
      .where('email = :email AND proof_hash = :hash AND expires_at > now()', {
        email,
        hash: sha256(emailToken),
      })
      .execute();
    if (!affected) throw new BadRequestException(EXPIRED_PROOF_MESSAGE);
  }

  /** Removes codes nobody used. */
  async removeExpired(): Promise<void> {
    await this.repo.delete({ expiresAt: LessThan(new Date()) });
  }

  private async sendEmail(to: string, code: string) {
    await this.mail.send({
      to,
      subject: 'Your AIUB Job Fair 2026 email code',
      text:
        `Use this code to verify your email for AIUB Job Fair 2026.\n\n` +
        `Your code: ${code}\n\n` +
        `Enter it on the registration page. It expires in ${VERIFY_TTL_MINUTES} minutes.\n` +
        `If you did not start a registration, ignore this email.`,
      html:
        `<p>Use this code to verify your email for AIUB Job Fair 2026.</p><p>Your code:</p>` +
        `<p><strong style="font-size:20px;letter-spacing:3px">${code}</strong></p>` +
        `<p>Enter it on the registration page. It expires in ${VERIFY_TTL_MINUTES} minutes.</p>` +
        `<p>If you did not start a registration, ignore this email.</p>`,
    });
  }
}
