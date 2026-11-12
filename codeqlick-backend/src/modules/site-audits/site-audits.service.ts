import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service.js';
import { toApiLocale, toDbLocale, type ApiLocale } from '../../common/schemas/common.schemas.js';
import type { SiteAudit } from '../../generated/prisma/client.js';
import { LeadsService } from '../leads/leads.service.js';
import { MailService, type MailMessage } from '../mail/mail.service.js';
import { gather } from './gather.js';
import {
  CATEGORIES,
  CHECK_CATEGORY,
  runChecks,
  scoreOf,
  type AuditInputs,
  type Category,
  type CheckResult,
  type CheckStatus,
} from './site-audit-checks.js';
import {
  auditFailedEmail,
  auditReportEmail,
  auditTeamEmail,
  reportUrl,
  type AuditForEmail,
} from './site-audit-emails.js';
import { CATEGORY_NAMES, checkText, failureText } from './site-audit-texts.js';
import type { CreateSiteAuditInput } from './site-audits.schemas.js';
import { SiteAuditsRepository } from './site-audits.repository.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Checks one email may ask for in a day. */
export const DAILY_LIMIT = 5;
/** How long checks are kept. */
const KEEP_DAYS = 180;

/** What is stored in `result` once a check is DONE. */
export interface StoredResult {
  finalUrl: string;
  categories: Record<Category, number>;
  checks: CheckResult[];
}

export interface SiteAuditReport {
  id: string;
  url: string;
  finalUrl: string | null;
  status: SiteAudit['status'];
  score: number | null;
  /** Why it couldn't be checked, in the requested language (FAILED only). */
  failure: string | null;
  categories: Array<{
    key: Category;
    name: string;
    score: number;
    checks: Array<{ id: string; status: CheckStatus; title: string; advice: string }>;
  }>;
  createdAt: string;
  finishedAt: string | null;
}

const ORDER: Record<CheckStatus, number> = { fail: 0, warn: 1, pass: 2 };

/** A result's categories with their checks' texts in `locale`, problems first (also Cloud's API). */
export function reportCategories(
  result: StoredResult,
  locale: ApiLocale,
): SiteAuditReport['categories'] {
  return CATEGORIES.map((key) => ({
    key,
    name: CATEGORY_NAMES[key][locale],
    score: result.categories[key],
    checks: result.checks
      .filter((check) => CHECK_CATEGORY[check.id] === key)
      .toSorted((a, b) => ORDER[a.status] - ORDER[b.status])
      .map((check) => ({
        id: check.id,
        status: check.status,
        ...checkText(check.id, check.status, locale, check.values),
      })),
  }));
}

/** The public report of a check, its texts in `locale`; never the email or the name. */
export function toReport(row: SiteAudit, locale: ApiLocale): SiteAuditReport {
  const result = row.status === 'DONE' ? (row.result as unknown as StoredResult | null) : null;
  return {
    id: row.id,
    url: row.url,
    finalUrl: result?.finalUrl ?? null,
    status: row.status,
    score: row.score,
    failure: row.status === 'FAILED' ? failureText(row.error ?? '', locale) : null,
    categories: result ? reportCategories(result, locale) : [],
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

/** A check as the emails need it, in `locale`. */
export function forEmail(row: SiteAudit, locale: ApiLocale): AuditForEmail {
  const report = toReport(row, locale);
  const problems = report.categories
    .flatMap((category) => category.checks)
    .filter((check) => check.status !== 'pass')
    .toSorted((a, b) => ORDER[a.status] - ORDER[b.status])
    .map((check) => ({
      title: check.title,
      advice: check.advice,
      status: check.status as 'warn' | 'fail',
    }));
  return {
    id: row.id,
    url: row.url,
    host: row.host,
    name: row.name,
    email: row.email,
    locale: toApiLocale(row.locale),
    score: row.score,
    categories: report.categories.map(({ name, score }) => ({ name, score })),
    problems,
    failure: report.failure,
  };
}

/**
 * The free website check (architecture 4.12): stored on request, run in the background one at a
 * time, then emailed to the visitor and the team and turned into a lead.
 */
@Injectable()
export class SiteAuditsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SiteAuditsService.name);
  private readonly queue: string[] = [];
  private running = false;
  private timer: NodeJS.Timeout | undefined;
  /** Replaced in tests: what a run reads of the site. */
  gatherInputs: (url: string) => Promise<AuditInputs> = (url) =>
    gather(url, this.config.pageSpeedApiKey);

  constructor(
    private readonly repository: SiteAuditsRepository,
    private readonly leads: LeadsService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.isTest) return;
    // Runs a restart cut short: the last hour's again, older ones are given up.
    const since = new Date(Date.now() - HOUR_MS);
    await this.repository.failStale(since);
    for (const { id } of await this.repository.pendingSince(since)) this.enqueue(id);
    this.timer = setInterval(() => void this.cleanup(), DAY_MS).unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  async create(input: CreateSiteAuditInput): Promise<{ id: string }> {
    if (input.website && input.website.trim() !== '') {
      this.logger.warn('Website check honeypot triggered; request discarded');
      return { id: randomUUID() };
    }
    const email = input.email.trim().toLowerCase();
    const host = new URL(input.url).hostname;
    const now = Date.now();
    const recent = await this.repository.findRecent(email, host, new Date(now - DAY_MS));
    if (recent) return { id: recent.id };
    if ((await this.repository.countSince(email, new Date(now - DAY_MS))) >= DAILY_LIMIT) {
      throw new HttpException('Too many website checks today', HttpStatus.TOO_MANY_REQUESTS);
    }
    const row = await this.repository.create({
      url: input.url,
      host,
      name: input.name ?? null,
      email,
      locale: toDbLocale(input.locale),
    });
    if (!this.config.isTest) this.enqueue(row.id);
    return { id: row.id };
  }

  async report(id: string, locale: ApiLocale): Promise<SiteAuditReport> {
    const row = await this.repository.find(id);
    if (!row) throw new NotFoundException('Website check not found');
    return toReport(row, locale);
  }

  /** Checks the site, stores the result, makes the lead and sends the emails. Never throws. */
  async run(id: string): Promise<void> {
    const row = await this.repository.find(id);
    if (!row || row.status !== 'PENDING') return;
    let done: SiteAudit;
    try {
      const inputs = await this.gatherInputs(row.url);
      const checks = runChecks(inputs);
      const { score, categories } = scoreOf(checks);
      const result: StoredResult = { finalUrl: inputs.page.url, categories, checks };
      done = await this.repository.update(id, {
        status: 'DONE',
        score,
        result: result as never,
        finishedAt: new Date(),
      });
    } catch (error) {
      const reason = (error instanceof Error ? error.message : String(error)).slice(0, 300);
      this.logger.warn(`Website check ${id} of ${row.host} failed: ${reason}`);
      done = await this.repository.update(id, {
        status: 'FAILED',
        error: reason,
        finishedAt: new Date(),
      });
    }

    const visitor = forEmail(done, toApiLocale(done.locale));
    const team = forEmail(done, 'en');
    let leadId: string | null = null;
    try {
      const lead = await this.leads.createQuietly({
        name: done.name ?? done.host,
        email: done.email,
        company: done.host,
        locale: visitor.locale,
        message: team.failure
          ? `Free website check of ${done.url}: it couldn't be opened (${team.failure}).\nReport: ${reportUrl(this.config.siteUrl, visitor)}`
          : `Free website check of ${done.url}: ${done.score}/100 (${team.categories
              .map((category) => `${category.name} ${category.score}`)
              .join(', ')}).\nReport: ${reportUrl(this.config.siteUrl, visitor)}`,
      });
      leadId = lead.id;
      await this.repository.update(id, { leadId });
    } catch (error) {
      this.logger.error(`Website check ${id}: the lead couldn't be made: ${String(error)}`);
    }

    const siteUrl = this.config.siteUrl;
    this.send(
      visitor.failure ? auditFailedEmail(visitor, siteUrl) : auditReportEmail(visitor, siteUrl),
      'report',
    );
    this.send(auditTeamEmail(this.config.leadsNotifyTo, team, leadId, siteUrl), 'team');
  }

  private enqueue(id: string): void {
    this.queue.push(id);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (let id = this.queue.shift(); id; id = this.queue.shift()) {
        await this.run(id).catch((error: unknown) =>
          this.logger.error(`Website check ${id} crashed: ${String(error)}`),
        );
      }
    } finally {
      this.running = false;
    }
  }

  private async cleanup(): Promise<void> {
    try {
      const deleted = await this.repository.deleteOlderThan(
        new Date(Date.now() - KEEP_DAYS * DAY_MS),
      );
      if (deleted) this.logger.log(`Deleted ${deleted} old website checks`);
    } catch (error) {
      this.logger.error(`Website check cleanup failed: ${String(error)}`);
    }
  }

  private send(message: MailMessage, kind: string): void {
    let pending: Promise<void>;
    try {
      pending = this.mail.send(message);
    } catch (error) {
      pending = Promise.reject(error);
    }
    pending.catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send website check ${kind} email: ${reason}`);
    });
  }
}
