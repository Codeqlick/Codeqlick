import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { AppConfigService } from '../../config/app-config.service.js';
import { brandText, type MailBrand } from './email-layout.js';

export interface MailMessage {
  to: string;
  /**
   * Whose email it is (architecture 4.18, decision 128), derived from the recipient's realm and
   * never from a request: Neoqlick's goes out from its own sender and mailbox. Default: Codeqlick.
   */
  brand?: MailBrand;
  subject: string;
  text: string;
  /** Branded alternative to `text` (see email-layout.ts). */
  html?: string;
  replyTo?: string;
  /** A calendar invitation (iCalendar text), shown by mail apps as "add to calendar". */
  icalEvent?: { method: 'REQUEST' | 'CANCEL'; content: string };
  /** Extra headers, e.g. `List-Unsubscribe` (architecture 4.14). */
  headers?: Record<string, string>;
  /**
   * One-click unsubscribe URL of an optional email (architecture 4.3, decision 70): sent as the
   * RFC 8058 `List-Unsubscribe` and `List-Unsubscribe-Post` headers. Transactional emails have none.
   */
  listUnsubscribe?: string;
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

/** The domain of a From address (`Codeqlick <hello@codeqlick.com>` → codeqlick.com). */
export function mailDomain(from: string): string | undefined {
  const domain = /@([a-z0-9.-]+\.[a-z]{2,})>?\s*$/i.exec(from)?.[1];
  return domain?.toLowerCase();
}

/** The address of a From (`Codeqlick <hello@codeqlick.com>` → hello@codeqlick.com). */
export function mailAddress(from: string): string {
  return /<([^>]+)>/.exec(from)?.[1]?.trim() ?? from.trim();
}

/** One brand's way out: its From, its Reply-To and its SMTP connection. */
interface Sender {
  from: string;
  replyTo?: string;
  transporter: MailTransport;
}

/** Thin abstraction over Nodemailer. In NODE_ENV=test nothing leaves the process. */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly codeqlick: Sender;
  private readonly neoqlick: Sender;
  private readonly outbox: string | undefined;

  constructor(config: AppConfigService) {
    this.outbox = config.mailOutboxDir;
    const smtp = config.smtp;
    const neoqlickMail = config.neoqlickMail;
    const transport = (
      from: string,
      auth: { user: string; pass: string } | undefined,
    ): MailTransport =>
      config.isTest
        ? createTransport({ jsonTransport: true })
        : createTransport({
            // EHLO with the sending domain, not the container's random hostname (spam filters
            // score a name that isn't a domain); Message-IDs already end in the From's domain.
            name: mailDomain(from),
            host: smtp.host,
            port: smtp.port,
            secure: smtp.secure,
            auth,
          });
    const defaultAuth = smtp.user ? { user: smtp.user, pass: smtp.password ?? '' } : undefined;

    this.codeqlick = {
      from: config.mailFrom,
      transporter: transport(config.mailFrom, defaultAuth),
    };

    // Neoqlick's own mailbox (decision 128). While it isn't set up (MAIL_FROM_NEOQLICK unset) its
    // emails go out as "Neoqlick" from the default mailbox, so nothing breaks, and a warning says so.
    const neoFrom = neoqlickMail.from ?? `Neoqlick <${mailAddress(config.mailFrom)}>`;
    if (!neoqlickMail.from && !config.isTest) {
      this.logger.warn(
        "MAIL_FROM_NEOQLICK is not set: Neoqlick's emails use the default mailbox until Neoqlick's own exists",
      );
    }
    const neoAuth = neoqlickMail.user
      ? { user: neoqlickMail.user, pass: neoqlickMail.password ?? '' }
      : defaultAuth;
    this.neoqlick = {
      from: neoFrom,
      // Replies go to Neoqlick's own address, never to Codeqlick's.
      replyTo: neoqlickMail.from ? mailAddress(neoqlickMail.from) : undefined,
      transporter: transport(neoFrom, neoAuth),
    };
  }

  async send(message: MailMessage): Promise<void> {
    const sender = message.brand === 'neoqlick' ? this.neoqlick : this.codeqlick;
    await sender.transporter.sendMail({
      from: sender.from,
      to: message.to,
      subject: brandText(message.subject, message.brand),
      text: message.text,
      html: message.html,
      replyTo: message.replyTo ?? sender.replyTo,
      icalEvent: message.icalEvent && { ...message.icalEvent, filename: 'invite.ics' },
      headers: this.headers(message),
    });
    if (this.outbox) await this.keep(message);
    this.logger.debug(`Mail sent to ${message.to}: ${message.subject}`);
  }

  /** The message's own headers, plus one-click unsubscribe (RFC 8058) when it has a link. */
  private headers(message: MailMessage): Record<string, string> | undefined {
    if (!message.listUnsubscribe) return message.headers;
    return {
      ...message.headers,
      'List-Unsubscribe': `<${message.listUnsubscribe}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
  }

  /** Tests: the email as `<time>-<random>.json` in the outbox folder, for browser tests. */
  private async keep(message: MailMessage): Promise<void> {
    const folder = this.outbox!;
    await mkdir(folder, { recursive: true });
    const name = `${Date.now()}-${randomBytes(4).toString('hex')}.json`;
    await writeFile(
      join(folder, name),
      JSON.stringify({
        to: message.to,
        subject: brandText(message.subject, message.brand),
        text: message.text,
        ...(message.brand ? { brand: message.brand } : {}),
        ...(message.listUnsubscribe ? { listUnsubscribe: message.listUnsubscribe } : {}),
      }),
    );
  }
}
