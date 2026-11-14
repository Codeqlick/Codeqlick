import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { AppConfigService } from '../../config/app-config.service.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  /** Branded alternative to `text` (see email-layout.ts). */
  html?: string;
  replyTo?: string;
  /** A calendar invitation (iCalendar text), shown by mail apps as "add to calendar". */
  icalEvent?: { method: 'REQUEST' | 'CANCEL'; content: string };
  /** Extra headers, e.g. `List-Unsubscribe` (architecture 4.14). */
  headers?: Record<string, string>;
}

/** The subset of a Nodemailer transporter we rely on (avoids its generic types). */
interface MailTransport {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
    replyTo?: string;
    icalEvent?: { method: string; content: string; filename: string };
    headers?: Record<string, string>;
  }): Promise<unknown>;
}

/** Thin abstraction over Nodemailer. In NODE_ENV=test nothing leaves the process. */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: MailTransport;
  private readonly from: string;
  private readonly outbox: string | undefined;

  constructor(config: AppConfigService) {
    this.from = config.mailFrom;
    this.outbox = config.mailOutboxDir;
    if (config.isTest) {
      this.transporter = createTransport({ jsonTransport: true });
    } else {
      const smtp = config.smtp;
      this.transporter = createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: smtp.user ? { user: smtp.user, pass: smtp.password ?? '' } : undefined,
      });
    }
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      replyTo: message.replyTo,
      icalEvent: message.icalEvent && { ...message.icalEvent, filename: 'invite.ics' },
      headers: message.headers,
    });
    if (this.outbox) await this.keep(message);
    this.logger.debug(`Mail sent to ${message.to}: ${message.subject}`);
  }

  /** Tests: the email as `<time>-<random>.json` in the outbox folder, for browser tests. */
  private async keep(message: MailMessage): Promise<void> {
    const folder = this.outbox!;
    await mkdir(folder, { recursive: true });
    const name = `${Date.now()}-${randomBytes(4).toString('hex')}.json`;
    await writeFile(
      join(folder, name),
      JSON.stringify({ to: message.to, subject: message.subject, text: message.text }),
    );
  }
}
