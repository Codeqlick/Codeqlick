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
  }): Promise<unknown>;
}

/** Thin abstraction over Nodemailer. In NODE_ENV=test nothing leaves the process. */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: MailTransport;
  private readonly from: string;

  constructor(config: AppConfigService) {
    this.from = config.mailFrom;
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
    });
    this.logger.debug(`Mail sent to ${message.to}: ${message.subject}`);
  }
}
