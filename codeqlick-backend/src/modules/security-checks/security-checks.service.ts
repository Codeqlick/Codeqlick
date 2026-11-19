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
import { safeFetch } from '../../common/safe-fetch.js';
import { toApiLocale, toDbLocale, type ApiLocale } from '../../common/schemas/common.schemas.js';
import { pageToSkipTake, paginate, type Paginated } from '../../common/types/paginated.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { SecurityCheck } from '../../generated/prisma/client.js';
import { LeadsService } from '../leads/leads.service.js';
import { MailService, type MailMessage } from '../mail/mail.service.js';
import { registrableDomain } from './checks-web.js';
import {
  DomainNotFoundError,
  gatherInputs,
  networkProbes,
  ScanTimeoutError,
  SURFACE_USER_AGENT,
  USER_AGENT,
} from './gather.js';
import { parseRetire, type RetireRepository } from './retire.js';
import { runChecks } from './run-checks.js';
import {
  securityFailedEmail,
  securityReportEmail,
  securityTeamEmail,
  reportUrl,
  type CheckForEmail,
} from './security-check-emails.js';
import { gradeChecks, type Grade } from './security-check-score.js';
import { buildSnapshot, type SurfaceSnapshot } from './security-snapshot.js';
import { checkText, failureText, GROUP_NAMES, FAILURE_TIMEOUT } from './security-check-texts.js';
import {
  CHECK_GROUP,
  GROUPS,
  type CheckGroup,
  type CheckResult,
  type CheckStatus,
} from './security-check-types.js';
import type { SecurityInputs } from './security-check-inputs.js';
import type {
  CreateSecurityCheckInput,
  ListSecurityChecksQuery,
} from './security-checks.schemas.js';
import { SecurityChecksRepository } from './security-checks.repository.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Checks one email may ask for in a day. */
export const DAILY_EMAIL_LIMIT = 5;
/** Checks of one domain, from anyone, in a day. */
export const DAILY_DOMAIN_LIMIT = 10;
/** Checks asked for by anyone in a day; past it the service says it is busy. */
export const DAILY_GLOBAL_LIMIT = 300;
/** Checks waiting to run; past it the service says it is busy. */
export const MAX_QUEUE = 40;
/** How long checks are kept. */
const KEEP_DAYS = 180;
/** A check gives up after this long. */
export const CHECK_TIMEOUT_MS = 60_000;
/** The Retire.js data is refreshed at most this often. */
const RETIRE_MAX_AGE_MS = DAY_MS;
/** Cleanup and the Retire.js refresh run this often (and 30 s after boot). */
const MAINTENANCE_MS = 6 * HOUR_MS;
const RETIRE_URL =
  'https://raw.githubusercontent.com/RetireJS/retire.js/master/repository/jsrepository.json';

/** What is stored in `result` once a check is DONE. */
export interface StoredResult {
  /** The URL the homepage ended on, when a website answered. */
  finalUrl: string | null;
  checks: CheckResult[];
  /** When the Retire.js data used was fetched. */
  retireFetchedAt: string | null;
}

export interface SecurityCheckReport {
  id: string;
  domain: string;
  status: SecurityCheck['status'];
  score: number | null;
  grade: string | null;
  /** Why it couldn't be checked, in the requested language (FAILED only). */
  failure: string | null;
  groups: Array<{
    key: CheckGroup;
    name: string;
    checks: Array<{
      id: string;
      status: CheckStatus;
      title: string;
      explanation: string;
      advice: string;
    }>;
  }>;
  createdAt: string;
  finishedAt: string | null;
}

export interface AdminSecurityCheck {
  id: string;
  domain: string;
  email: string;
  name: string | null;
  status: SecurityCheck['status'];
  score: number | null;
  grade: string | null;
  leadId: string | null;
  createdAt: string;
}

/** What `scan` returns (the Surface monitor, architecture 4.13, decision 144). */
export interface ScanResult {
  checks: CheckResult[];
  score: number;
  grade: Grade;
  snapshot: SurfaceSnapshot;
}

/** A promise that rejects with a `ScanTimeoutError` when `signal` aborts; `stop` detaches it. */
function rejectOnAbort(signal: AbortSignal): { promise: Promise<never>; stop: () => void } {
  const detach = new AbortController();
  const promise = new Promise<never>((_, reject) => {
    const fire = () => reject(new ScanTimeoutError(FAILURE_TIMEOUT));
    if (signal.aborted) fire();
    else signal.addEventListener('abort', fire, { once: true, signal: detach.signal });
  });
  // Nobody may be waiting when it rejects late.
  promise.catch(() => undefined);
  return { promise, stop: () => detach.abort() };
}

/** Worst first: fix now, improve, for your information, passed. */
const ORDER: Record<CheckStatus, number> = { fail: 0, warn: 1, info: 2, pass: 3 };

/** A result's groups with their checks' texts in `locale`, worst first. */
export function reportGroups(
  result: StoredResult,
  locale: ApiLocale,
): SecurityCheckReport['groups'] {
  return GROUPS.map((key) => ({
    key,
    name: GROUP_NAMES[key][locale],
    checks: result.checks
      .filter((check) => CHECK_GROUP[check.id] === key)
      .toSorted((a, b) => ORDER[a.status] - ORDER[b.status])
      .map((check) => ({
        id: check.id,
        status: check.status,
        ...checkText(check.id, check.status, locale, check.values),
      })),
  }));
}

/** The public report of a check, its texts in `locale`; never the email or the name. */
export function toReport(row: SecurityCheck, locale: ApiLocale): SecurityCheckReport {
  const result = row.status === 'DONE' ? (row.result as unknown as StoredResult | null) : null;
  return {
    id: row.id,
    domain: row.domain,
    status: row.status,
    score: row.score,
    grade: row.grade,
    failure: row.status === 'FAILED' ? failureText(row.error ?? '', locale) : null,
    groups: result ? reportGroups(result, locale) : [],
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

/** A check as the emails need it, in `locale`. */
export function forEmail(row: SecurityCheck, locale: ApiLocale): CheckForEmail {
  const report = toReport(row, locale);
  const problems = report.groups
    .flatMap((group) => group.checks)
    .filter((check) => check.status === 'fail' || check.status === 'warn')
    .toSorted((a, b) => ORDER[a.status] - ORDER[b.status])
    .map((check) => ({
      title: check.title,
      advice: check.advice,
      status: check.status as 'warn' | 'fail',
    }));
  return {
    id: row.id,
    domain: row.domain,
    name: row.name,
    email: row.email,
    locale: toApiLocale(row.locale),
    score: row.score,
    grade: row.grade,
    problems,
    failure: report.failure,
  };
}

/**
 * The free Security check (architecture 4.19): stored on request, run in the background one at a
 * time, then emailed to the visitor and the team and turned into a lead.
 */
@Injectable()
export class SecurityChecksService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SecurityChecksService.name);
  private readonly queue: string[] = [];
  private running = false;
  private timer: NodeJS.Timeout | undefined;
  private startTimer: NodeJS.Timeout | undefined;
  private lastRetireAttempt = 0;
  /** The Retire.js data in memory (its compiled patterns hang on this object). */
  private retireCache: { repository: RetireRepository; fetchedAt: Date } | null = null;
  /** Replaced in tests: what a run reads of the domain; aborting `signal` stops it. */
  gather: (
    domain: string,
    retire: RetireRepository | null,
    signal: AbortSignal,
    userAgent?: string,
  ) => Promise<SecurityInputs> = (domain, retire, signal, userAgent) =>
    gatherInputs(domain, retire, networkProbes(signal, userAgent));
  /** Replaced in tests: the Retire.js repository's JSON. */
  fetchRetireJson: () => Promise<unknown> = async () => {
    const file = await safeFetch(RETIRE_URL, {
      timeoutMs: 20_000,
      maxBytes: 12 * 1024 * 1024,
      userAgent: USER_AGENT,
    });
    if (file.status !== 200) throw new Error(`Retire.js answered ${file.status}`);
    return JSON.parse(file.body) as unknown;
  };

  constructor(
    private readonly repository: SecurityChecksRepository,
    private readonly leads: LeadsService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.isTest) return;
    // Runs a restart cut short: the last hour's again, older ones are given up (and told so).
    const since = new Date(Date.now() - HOUR_MS);
    for (const { id } of await this.repository.pendingBefore(since)) {
      this.queue.push(`stale:${id}`);
    }
    for (const { id } of await this.repository.pendingSince(since)) this.queue.push(id);
    void this.drain();
    // Retention and the Retire.js data: shortly after boot, then every few hours.
    this.startTimer = setTimeout(() => void this.maintain(), 30_000).unref();
    this.timer = setInterval(() => void this.maintain(), MAINTENANCE_MS).unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
    clearTimeout(this.startTimer);
  }

  private async maintain(): Promise<void> {
    await this.cleanup();
    await this.retire().catch(() => null);
  }

  async create(input: CreateSecurityCheckInput): Promise<{ id: string }> {
    if (input.website && input.website.trim() !== '') {
      this.logger.warn('Security check honeypot triggered; request discarded');
      return { id: randomUUID() };
    }
    const email = input.email.trim().toLowerCase();
    const since = new Date(Date.now() - DAY_MS);
    const recent = await this.repository.findRecent(email, input.domain, since);
    if (recent) return { id: recent.id };
    if (
      (await this.repository.countByEmailSince(email, since)) >= DAILY_EMAIL_LIMIT ||
      (await this.repository.countByDomainSince(registrableDomain(input.domain), since)) >=
        DAILY_DOMAIN_LIMIT
    ) {
      throw new HttpException('Too many security checks today', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (
      this.queue.length >= MAX_QUEUE ||
      (await this.repository.countSince(since)) >= DAILY_GLOBAL_LIMIT
    ) {
      throw new HttpException(
        'The security check is busy right now, try again later',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const row = await this.repository.create({
      domain: input.domain,
      name: input.name ?? null,
      email,
      locale: toDbLocale(input.locale),
    });
    if (!this.config.isTest) this.enqueue(row.id);
    return { id: row.id };
  }

  async report(id: string, locale: ApiLocale): Promise<SecurityCheckReport> {
    const row = await this.repository.find(id);
    if (!row) throw new NotFoundException('Security check not found');
    return toReport(row, locale);
  }

  async adminList(query: ListSecurityChecksQuery): Promise<Paginated<AdminSecurityCheck>> {
    const { skip, take } = pageToSkipTake(query.page, query.pageSize);
    const { items, total } = await this.repository.list(
      query.status ? { status: query.status } : {},
      skip,
      take,
    );
    return paginate(
      items.map((row) => ({
        id: row.id,
        domain: row.domain,
        email: row.email,
        name: row.name,
        status: row.status,
        score: row.score,
        grade: row.grade,
        leadId: row.leadId,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  /**
   * The Retire.js repository: the cached copy while it is under a day old, otherwise a fresh one
   * (kept in `settings`); when GitHub can't be reached the last good copy is used, if any.
   */
  async retire(): Promise<{ repository: RetireRepository; fetchedAt: Date } | null> {
    const cached = await this.repository.retireData();
    const now = Date.now();
    if (cached && now - cached.fetchedAt.getTime() < RETIRE_MAX_AGE_MS) {
      return this.remember(cached.data, cached.fetchedAt);
    }
    // After a failure the next attempt waits an hour, so a GitHub outage isn't hammered.
    if (now - this.lastRetireAttempt >= HOUR_MS) {
      this.lastRetireAttempt = now;
      try {
        const repository = parseRetire(await this.fetchRetireJson());
        const fetchedAt = new Date();
        await this.repository.saveRetireData(repository, fetchedAt);
        this.lastRetireAttempt = 0;
        return this.remember(repository, fetchedAt);
      } catch (error) {
        this.logger.warn(`Retire.js data couldn't be refreshed: ${String(error)}`);
      }
    }
    return cached ? this.remember(cached.data, cached.fetchedAt) : null;
  }

  /** Keeps the same object while the data is the same, so its compiled patterns are reused. */
  private remember(repository: RetireRepository, fetchedAt: Date) {
    if (this.retireCache?.fetchedAt.getTime() !== fetchedAt.getTime()) {
      this.retireCache = { repository, fetchedAt };
    }
    return this.retireCache;
  }

  /** What a check uses: the copy in memory or the stored one. Never fetches (no time spent). */
  private async currentRetire(): Promise<{ repository: RetireRepository; fetchedAt: Date } | null> {
    if (this.retireCache) return this.retireCache;
    const stored = await this.repository.retireData();
    return stored ? this.remember(stored.data, stored.fetchedAt) : null;
  }

  /**
   * One run of the checks on `domain` for the Surface monitor (decision 144): no row, lead or email,
   * nothing counted in the public limits, the monitor's own user agent. Uses the Retire.js data the
   * service keeps and never fetches it. Aborting `signal` stops every request and rejects with a
   * `ScanTimeoutError`; a name with no records rejects with `DomainNotFoundError`.
   */
  async scan(domain: string, signal: AbortSignal): Promise<ScanResult> {
    const retire = await this.currentRetire().catch(() => null);
    const abortion = rejectOnAbort(signal);
    try {
      const inputs = await Promise.race([
        this.gather(domain, retire?.repository ?? null, signal, SURFACE_USER_AGENT),
        abortion.promise,
      ]);
      const checks = runChecks(inputs);
      const { score, grade } = gradeChecks(checks);
      return { checks, score, grade, snapshot: buildSnapshot(inputs) };
    } finally {
      abortion.stop();
    }
  }

  /** Checks the domain, stores the result, makes the lead and sends the emails. Never throws. */
  async run(id: string): Promise<void> {
    const row = await this.repository.find(id);
    if (!row || row.status !== 'PENDING') return;
    let done: SecurityCheck;
    try {
      // The Retire.js data is refreshed elsewhere (boot, every few hours): not in this budget.
      const retire = await this.currentRetire().catch(() => null);
      const inputs = await this.withTimeout((signal) =>
        this.gather(row.domain, retire?.repository ?? null, signal),
      );
      const retireFetchedAt = retire?.fetchedAt.toISOString() ?? null;
      const checks = runChecks(inputs);
      const { score, grade } = gradeChecks(checks);
      const result: StoredResult = {
        finalUrl: inputs.web.page?.url ?? null,
        checks,
        retireFetchedAt,
      };
      done = await this.repository.update(id, {
        status: 'DONE',
        score,
        grade,
        result: result as never,
        finishedAt: new Date(),
      });
    } catch (error) {
      const reason =
        error instanceof DomainNotFoundError
          ? error.message
          : (error instanceof Error ? error.message : String(error)).slice(0, 300);
      this.logger.warn(`Security check ${id} of ${row.domain} failed: ${reason}`);
      done = await this.repository.update(id, {
        status: 'FAILED',
        error: reason,
        finishedAt: new Date(),
      });
    }

    await this.finish(done);
  }

  /** The lead and the emails of a check that ended (DONE or FAILED). Never throws. */
  private async finish(done: SecurityCheck): Promise<void> {
    const id = done.id;
    const visitor = forEmail(done, toApiLocale(done.locale));
    const team = forEmail(done, 'en');
    let leadId: string | null = null;
    try {
      const fixNow = team.problems.filter((problem) => problem.status === 'fail').length;
      const improve = team.problems.length - fixNow;
      const lead = await this.leads.createQuietly({
        name: done.name ?? done.domain,
        email: done.email,
        company: done.domain,
        locale: visitor.locale,
        projectType: 'security',
        message: team.failure
          ? `Free Security check of ${done.domain}: it couldn't be run (${team.failure}).\nReport: ${reportUrl(this.config.siteUrl, visitor)}`
          : `Free Security check of ${done.domain}: grade ${done.grade} (${done.score}/100), ${fixNow} to fix now and ${improve} to improve.\nReport: ${reportUrl(this.config.siteUrl, visitor)}`,
      });
      leadId = lead.id;
      await this.repository.update(id, { leadId });
    } catch (error) {
      this.logger.error(`Security check ${id}: the lead couldn't be made: ${String(error)}`);
    }

    const siteUrl = this.config.siteUrl;
    this.send(
      visitor.failure
        ? securityFailedEmail(visitor, siteUrl)
        : securityReportEmail(visitor, siteUrl),
      'report',
    );
    this.send(securityTeamEmail(this.config.leadsNotifyTo, team, leadId, siteUrl), 'team');
  }

  /** `work`, or a rejection after the check's time limit, which also aborts what it started. */
  private withTimeout<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
        reject(new Error(FAILURE_TIMEOUT));
      }, CHECK_TIMEOUT_MS);
      work(controller.signal).then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
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
        // `stale:<id>`: a check lost in a restart long ago, given up and told so.
        const job = id.startsWith('stale:') ? this.giveUp(id.slice(6)) : this.run(id);
        await job.catch((error: unknown) =>
          this.logger.error(`Security check ${id} crashed: ${String(error)}`),
        );
      }
    } finally {
      this.running = false;
    }
  }

  /** A PENDING check from before the last restart: FAILED ("Interrupted") and the visitor told. */
  async giveUp(id: string): Promise<void> {
    const row = await this.repository.find(id);
    if (!row || row.status !== 'PENDING') return;
    const done = await this.repository.update(id, {
      status: 'FAILED',
      error: 'Interrupted',
      finishedAt: new Date(),
    });
    await this.finish(done);
  }

  private async cleanup(): Promise<void> {
    try {
      const deleted = await this.repository.deleteOlderThan(
        new Date(Date.now() - KEEP_DAYS * DAY_MS),
      );
      if (deleted) this.logger.log(`Deleted ${deleted} old security checks`);
    } catch (error) {
      this.logger.error(`Security check cleanup failed: ${String(error)}`);
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
      this.logger.error(`Failed to send security check ${kind} email: ${reason}`);
    });
  }
}
