import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Sends email through SMTP. Without SMTP_HOST (development), each email is
 * saved as a file in the outbox folder and logged, so flows can be tested
 * without a mail account.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;

  constructor(private readonly config: ConfigService) {
    const host = config.get<string | null>('mail.smtpHost');
    const user = config.get<string | null>('mail.smtpUser');
    this.transporter = host
      ? createTransport({
          host,
          port: config.getOrThrow<number>('mail.smtpPort'),
          secure: config.getOrThrow<boolean>('mail.smtpSecure'),
          auth: user
            ? { user, pass: config.get<string>('mail.smtpPass') ?? '' }
            : undefined,
        })
      : null;
  }

  async send(message: MailMessage): Promise<void> {
    const from = this.config.getOrThrow<string>('mail.from');
    if (this.transporter) {
      await this.transporter.sendMail({ from, ...message });
      return;
    }
    await this.saveToOutbox(from, message);
  }

  private async saveToOutbox(from: string, message: MailMessage) {
    const dir = resolve(this.config.getOrThrow<string>('mail.outboxDir'));
    await mkdir(dir, { recursive: true });
    const safeTo = message.to.replace(/[^a-z0-9@._-]/gi, '_');
    const file = join(dir, `${Date.now()}-${safeTo}.txt`);
    const content =
      `From: ${from}\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`;
    await writeFile(file, content, 'utf8');
    this.logger.log(
      `SMTP not configured. Email to ${message.to} saved to ${file}\n${message.text}`,
    );
  }
}
