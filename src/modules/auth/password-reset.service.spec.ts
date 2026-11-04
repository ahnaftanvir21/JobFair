import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compare } from 'bcryptjs';
import { DataSource, Repository } from 'typeorm';
import { UserRole } from '../../common/enums/index.js';
import { MailService, type MailMessage } from '../mail/mail.service.js';
import { UsersService } from '../users/users.service.js';
import { PasswordReset } from './entities/password-reset.entity.js';
import {
  FORGOT_PASSWORD_MESSAGE,
  MAX_CODE_ATTEMPTS,
  PasswordResetService,
} from './password-reset.service.js';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const user = { id: 'u1', email: 'rahim@example.com', role: UserRole.STUDENT };

function setup() {
  let rows: PasswordReset[] = [];
  const sent: MailMessage[] = [];
  const passwordUpdates: { userId: string; hash: string }[] = [];

  const matches = (row: PasswordReset, where: Partial<PasswordReset>) =>
    Object.entries(where).every(
      ([k, v]) => (row as unknown as Record<string, unknown>)[k] === v,
    );

  const repo = {
    existsBy: vi.fn(async ({ userId }: { userId: string }) =>
      rows.some(
        (r) => r.userId === userId && Date.now() - r.createdAt.getTime() < 60_000,
      ),
    ),
    findOneBy: vi.fn(
      async (where: Partial<PasswordReset>) =>
        rows.find((r) => matches(r, where)) ?? null,
    ),
    delete: vi.fn(async (where: Partial<PasswordReset>) => {
      const before = rows.length;
      rows = rows.filter((r) => !matches(r, where));
      return { affected: before - rows.length };
    }),
    create: vi.fn((data: Partial<PasswordReset>) => data),
    save: vi.fn(async (data: Partial<PasswordReset>) => {
      const row = {
        id: `r${rows.length + 1}`,
        attempts: 0,
        createdAt: new Date(),
        ...data,
      } as PasswordReset;
      rows.push(row);
      return row;
    }),
    createQueryBuilder: vi.fn(() => {
      let id = '';
      const qb = {
        update: () => qb,
        set: () => qb,
        where: (_sql: string, params: { id: string }) => {
          id = params.id;
          return qb;
        },
        execute: async () => {
          const row = rows.find((r) => r.id === id);
          if (!row || row.attempts >= MAX_CODE_ATTEMPTS) return { affected: 0 };
          row.attempts++;
          return { affected: 1 };
        },
      };
      return qb;
    }),
  };

  const usersService = {
    findByEmail: vi.fn(async (email: string) =>
      email === user.email ? user : null,
    ),
    updatePassword: vi.fn(async (userId: string, hash: string) => {
      passwordUpdates.push({ userId, hash });
    }),
  };
  const mail = {
    send: vi.fn(async (m: MailMessage) => {
      sent.push(m);
    }),
  };
  const configValues: Record<string, unknown> = {
    'auth.bcryptRounds': 4,
    'mail.resetPasswordUrl': 'http://front/reset',
  };
  const config = { getOrThrow: (key: string) => configValues[key] };
  const dataSource = {
    transaction: async (fn: (m: unknown) => Promise<unknown>) =>
      fn({
        delete: (_e: unknown, where: Partial<PasswordReset>) =>
          repo.delete(where),
      }),
  };

  const service = new PasswordResetService(
    repo as unknown as Repository<PasswordReset>,
    usersService as unknown as UsersService,
    mail as unknown as MailService,
    config as unknown as ConfigService,
    dataSource as unknown as DataSource,
  );

  /** Reads the code and link token out of the last email sent. */
  async function lastEmail() {
    await vi.waitFor(() => expect(sent.length).toBeGreaterThan(0));
    const text = sent[sent.length - 1].text;
    return {
      code: /Your code: (\d{6})/.exec(text)![1],
      token: /token=([a-f0-9]{64})/.exec(text)![1],
      text,
    };
  }

  return { service, sent, passwordUpdates, getRows: () => rows, lastEmail };
}

describe('PasswordResetService', () => {
  it('emails a 6-digit code and a link, storing only hashes', async () => {
    const t = setup();
    const res = await t.service.requestReset({ email: user.email });
    expect(res.message).toBe(FORGOT_PASSWORD_MESSAGE);
    const { code, token, text } = await t.lastEmail();
    expect(text).toContain(`http://front/reset?token=${token}`);
    const [row] = t.getRows();
    expect(row.codeHash).toBe(sha256(code));
    expect(row.tokenHash).toBe(sha256(token));
    expect(Object.values(row)).not.toContain(code);
    expect(Object.values(row)).not.toContain(token);
    expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
  });

  it('gives the same answer for unknown emails and sends nothing', async () => {
    const t = setup();
    const res = await t.service.requestReset({ email: 'nobody@example.com' });
    expect(res.message).toBe(FORGOT_PASSWORD_MESSAGE);
    expect(t.sent).toHaveLength(0);
  });

  it('does not send a second email within a minute', async () => {
    const t = setup();
    await t.service.requestReset({ email: user.email });
    await t.lastEmail();
    await t.service.requestReset({ email: user.email });
    expect(t.sent).toHaveLength(1);
  });

  it('resets with email and code, and the code works only once', async () => {
    const t = setup();
    await t.service.requestReset({ email: user.email });
    const { code } = await t.lastEmail();
    await t.service.resetPassword({
      email: user.email,
      code,
      newPassword: 'newSecret123',
    });
    expect(t.passwordUpdates).toHaveLength(1);
    expect(await compare('newSecret123', t.passwordUpdates[0].hash)).toBe(true);
    await expect(
      t.service.resetPassword({
        email: user.email,
        code,
        newPassword: 'another123',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('resets with the link token', async () => {
    const t = setup();
    await t.service.requestReset({ email: user.email });
    const { token } = await t.lastEmail();
    await t.service.resetPassword({ token, newPassword: 'newSecret123' });
    expect(t.passwordUpdates[0]?.userId).toBe(user.id);
    expect(t.getRows()).toHaveLength(0);
  });

  it('locks the code after too many wrong tries, even if the right code follows', async () => {
    const t = setup();
    await t.service.requestReset({ email: user.email });
    const { code } = await t.lastEmail();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
      await expect(
        t.service.resetPassword({
          email: user.email,
          code: wrong,
          newPassword: 'whatever1',
        }),
      ).rejects.toThrow(/wrong/);
    }
    await expect(
      t.service.resetPassword({
        email: user.email,
        code,
        newPassword: 'newSecret123',
      }),
    ).rejects.toThrow(/expired/);
    expect(t.passwordUpdates).toHaveLength(0);
  });

  it('rejects an expired code', async () => {
    const t = setup();
    await t.service.requestReset({ email: user.email });
    const { code } = await t.lastEmail();
    t.getRows()[0].expiresAt = new Date(Date.now() - 1000);
    await expect(
      t.service.resetPassword({
        email: user.email,
        code,
        newPassword: 'newSecret123',
      }),
    ).rejects.toThrow(/expired/);
  });
});
