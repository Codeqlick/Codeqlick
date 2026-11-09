import {
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { ErrorGroup, ErrorSource } from '../../generated/prisma/client.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { renderEmail } from '../mail/email-layout.js';
import { MailService } from '../mail/mail.service.js';
import { errorFingerprint } from './error-fingerprint.js';
import { ErrorsRepository } from './errors.repository.js';
import type { ReportErrorInput } from './errors.schemas.js';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** New groups stop being created past this many open ones (a flood of junk reports, a loop). */
export const MAX_OPEN_GROUPS = 300;
/** At most this many alert emails per hour, whatever happens. */
export const MAX_ALERTS_PER_HOUR = 10;
/** Resolved groups that haven't come back for this long are deleted. */
export const RESOLVED_RETENTION_DAYS = 30;

export interface ErrorView {
  id: string;
  source: ErrorSource;
  message: string;
  stack: string | null;
  method: string | null;
  path: string | null;
  reference: string | null;
  userAgent: string | null;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
}

/** One error as it happened, before it is grouped. */
export interface ErrorInput {
  source: ErrorSource;
  message: string;
  stack?: string;
  method?: string;
  path?: string;
  reference?: string;
  userAgent?: string;
}

const SOURCE_LABEL: Record<ErrorSource, string> = {
  API: 'API',
  WEB_SERVER: 'Website (server)',
  WEB_BROWSER: 'Website (browser)',
};

/**
 * Unexpected errors of the API and the website, grouped (Admin → Errors, architecture 4.11). A new
 * group, or a resolved one that comes back, emails the team inbox. Recording never throws.
 */
@Injectable()
export class ErrorsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ErrorsService.name);
  private timer: NodeJS.Timeout | undefined;
  private alertWindowStart = 0;
  private alertsInWindow = 0;

  constructor(
    private readonly repository: ErrorsRepository,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.nodeEnv === 'test') return;
    this.timer = setInterval(() => void this.cleanup(), DAY_MS).unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  /** From the website: its server's errors and its visitors' browsers'. */
  report(input: ReportErrorInput): Promise<void> {
    return this.record({
      source: input.source === 'server' ? 'WEB_SERVER' : 'WEB_BROWSER',
      message: input.message,
      stack: input.stack,
      method: input.method,
      path: input.path,
      reference: input.digest,
      userAgent: input.userAgent,
    });
  }

  async record(input: ErrorInput, now = new Date()): Promise<void> {
    try {
      const message = input.message.trim().slice(0, 1000) || 'Error';
      const fingerprint = errorFingerprint(input.source, message, input.stack);
      const existing = await this.repository.findByFingerprint(fingerprint);
      if (!existing && (await this.repository.countOpen()) >= MAX_OPEN_GROUPS) {
        this.logger.warn(`Error not recorded: ${MAX_OPEN_GROUPS} open groups already`);
        return;
      }
      const group = await this.repository.record(
        {
          fingerprint,
          source: input.source,
          message,
          stack: input.stack?.slice(0, 8000) ?? null,
          method: input.method?.slice(0, 10) ?? null,
          path: input.path ? stripQuery(input.path).slice(0, 500) : null,
          reference: input.reference?.slice(0, 100) ?? null,
          userAgent: input.userAgent?.slice(0, 300) ?? null,
        },
        now,
      );
      const reopened = existing?.resolvedAt != null;
      if (!existing || reopened) this.alert(group, reopened, now);
    } catch (failure) {
      this.logger.error('Could not record an error', failure);
    }
  }

  async list(status: 'open' | 'resolved'): Promise<ErrorView[]> {
    return (await this.repository.list(status === 'resolved')).map(toView);
  }

  async get(id: string): Promise<ErrorView> {
    const group = await this.repository.findById(id);
    if (!group) throw new NotFoundException('Error not found');
    return toView(group);
  }

  async setResolved(id: string, resolved: boolean, now = new Date()): Promise<ErrorView> {
    await this.get(id);
    return toView(await this.repository.setResolved(id, resolved ? now : null));
  }

  async resolveAll(now = new Date()): Promise<{ resolved: number }> {
    return { resolved: await this.repository.resolveAll(now) };
  }

  /** Never throws: a failed run is logged and retried the next day. */
  async cleanup(now = new Date()): Promise<void> {
    try {
      const before = new Date(now.getTime() - RESOLVED_RETENTION_DAYS * DAY_MS);
      const deleted = await this.repository.deleteResolvedBefore(before);
      if (deleted > 0) this.logger.log(`Deleted ${deleted} old resolved errors`);
    } catch (failure) {
      this.logger.error('Could not clean up old errors', failure);
    }
  }

  private alert(group: ErrorGroup, reopened: boolean, now: Date): void {
    if (now.getTime() - this.alertWindowStart >= HOUR_MS) {
      this.alertWindowStart = now.getTime();
      this.alertsInWindow = 0;
    }
    if (this.alertsInWindow >= MAX_ALERTS_PER_HOUR) return;
    this.alertsInWindow += 1;

    const where = [group.method, group.path].filter(Boolean).join(' ');
    void this.mail
      .send({
        to: this.config.leadsNotifyTo,
        subject: `[codeqlick] ${reopened ? 'Error is back' : 'New error'}: ${group.message.slice(0, 80)}`,
        ...renderEmail(
          {
            locale: 'en',
            preheader: `${SOURCE_LABEL[group.source]}${where ? ` · ${where}` : ''}`,
            title: reopened ? 'An error marked as fixed is back' : 'A new error happened',
            intro: [
              reopened
                ? 'It was marked as fixed, so it is open again.'
                : 'It is the first time this error happens. Later occurrences are counted without another email.',
            ],
            quote: { body: group.message },
            details: [
              ['Where', SOURCE_LABEL[group.source]],
              ...(where ? ([['Request', where]] as Array<[string, string]>) : []),
              ...(group.reference
                ? ([['Reference', group.reference]] as Array<[string, string]>)
                : []),
            ],
            button: {
              label: 'Open the error',
              url: `${this.config.siteUrl}/es/admin/errors/${group.id}`,
            },
            signoff: [],
          },
          this.config.siteUrl,
        ),
      })
      .catch((failure: unknown) => this.logger.error('Could not email an error alert', failure));
  }
}

function stripQuery(path: string): string {
  return path.replace(/[?#].*$/, '');
}

function toView(group: ErrorGroup): ErrorView {
  return {
    id: group.id,
    source: group.source,
    message: group.message,
    stack: group.stack,
    method: group.method,
    path: group.path,
    reference: group.reference,
    userAgent: group.userAgent,
    count: group.count,
    firstSeenAt: group.firstSeenAt.toISOString(),
    lastSeenAt: group.lastSeenAt.toISOString(),
    resolvedAt: group.resolvedAt?.toISOString() ?? null,
  };
}
