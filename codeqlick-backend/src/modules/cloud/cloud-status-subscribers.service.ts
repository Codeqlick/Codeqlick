import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { DISPOSABLE_EMAIL_ERROR, isDisposableEmail } from '../../common/disposable-email.js';
import { toApiLocale, toDbLocale, type ApiLocale } from '../../common/schemas/common.schemas.js';
import { pageToSkipTake, paginate, type Paginated } from '../../common/types/paginated.js';
import type { CloudStatusSubscriber } from '../../generated/prisma/client.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { MailService, type MailMessage } from '../mail/mail.service.js';
import type { CloudCtx } from './cloud-caller.js';
import { cloudStatusConfirmEmail, cloudStatusEmail } from './cloud-emails.js';
import { CloudMonitorsService } from './cloud-monitors.service.js';
import { CLOUD_PLANS } from './cloud-plans.js';
import { noticeState } from './cloud-status-notices.js';
import {
  BATCH_SIZE,
  CONFIRM_TTL_MS,
  confirmSkip,
  DAY_MS,
  DISPATCH_MAX_AGE_MS,
  DISPATCH_RETENTION_MS,
  DISPATCHES_PER_RUN,
  EMAILS_PER_RUN,
  hashToken,
  maskEmail,
  MINUTE_MS,
  newConfirmToken,
  newUnsubscribeToken,
  PENDING_RETENTION_MS,
  TeamSignupLimiter,
  UNSUBSCRIBED_RETENTION_MS,
} from './cloud-status-subscribers.js';
import {
  CloudStatusSubscribersRepository,
  type DispatchRow,
  type SubscriberCounts,
} from './cloud-status-subscribers.repository.js';
import type { StatusSubscribeInput, StatusSubscribersQuery } from './cloud.schemas.js';
import { CloudTeamsService } from './cloud-teams.service.js';

export interface StatusSubscriberView {
  id: string;
  /** Masked: j***@e***.com. */
  email: string;
  locale: ApiLocale;
  status: CloudStatusSubscriber['status'];
  createdAt: string;
  confirmedAt: string | null;
  unsubscribedAt: string | null;
}

export interface StatusSubscriberList {
  counts: SubscriberCounts;
  /** The plan's cap of pending and active subscribers. */
  limit: number;
  items: Paginated<StatusSubscriberView>;
}

export interface SubscriberResult {
  teamName: string;
  teamSlug: string;
  locale: ApiLocale;
}

/** Pause between two emails, to stay within the SMTP account's limits. */
const SEND_PAUSE_MS = 100;
/** Maintenance starts handled per run. */
const STARTS_PER_RUN = 20;

function view(row: CloudStatusSubscriber): StatusSubscriberView {
  return {
    id: row.id,
    email: maskEmail(row.email),
    locale: toApiLocale(row.locale),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    unsubscribedAt: row.unsubscribedAt?.toISOString() ?? null,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * Email subscriptions to a team's status page (architecture 4.13, decision 105): the double
 * opt-in sign-up, one-click unsubscribe, the console's list, and the job that emails notices to
 * the active subscribers within each team's hourly cap. The team is the controller of these
 * addresses; Codeqlick their processor. Addresses never go to a log or a team event.
 */
@Injectable()
export class CloudStatusSubscribersService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(CloudStatusSubscribersService.name);
  private timer?: NodeJS.Timeout;
  private daily?: NodeJS.Timeout;
  private running = false;
  /** Sign-ups per team an hour, in memory (the per-IP limit is the route's). */
  readonly signups = new TeamSignupLimiter();

  constructor(
    private readonly repository: CloudStatusSubscribersRepository,
    private readonly teams: CloudTeamsService,
    private readonly monitors: CloudMonitorsService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.isTest) return;
    this.timer = setInterval(() => void this.tick(), MINUTE_MS).unref();
    this.daily = setInterval(() => void this.cleanup(), DAY_MS).unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.daily) clearInterval(this.daily);
  }

  // ── Public ─────────────────────────────────────────────────────────────────────────────────

  /**
   * A sign-up. Resolves (the route answers 202) whether or not the address is known, so it never
   * reveals who is subscribed; 404 without an enabled page with subscriptions on, 409 at the
   * plan's cap for a new address, 429 past the team's hourly limit.
   */
  async subscribe(teamSlug: string, input: StatusSubscribeInput, now = new Date()): Promise<void> {
    if (input.website && input.website.trim() !== '') {
      this.logger.warn('Status page sign-up honeypot triggered; request discarded');
      return;
    }
    const page = await this.repository.signupPage(teamSlug);
    if (!page?.enabled || !page.subscriptions) {
      throw new NotFoundException('This status page takes no email subscriptions');
    }
    const email = input.email.trim().toLowerCase();
    if (isDisposableEmail(email)) {
      throw new BadRequestException({ errors: [DISPOSABLE_EMAIL_ERROR] });
    }
    if (!this.signups.take(page.team.id, now.getTime())) {
      throw new HttpException(
        'Too many sign-ups on this page; try again later',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const existing = await this.repository.find(page.team.id, email);
    if (
      !existing &&
      (await this.repository.countCapped(page.team.id)) >=
        CLOUD_PLANS[page.team.plan].statusSubscribers
    ) {
      throw new ConflictException("This page can't take more subscribers");
    }
    const sentToday = await this.repository.confirmationsSince(
      email,
      new Date(now.getTime() - DAY_MS),
    );
    if (confirmSkip(existing, sentToday, now)) return;

    const { token, hash } = newConfirmToken();
    const confirm = {
      confirmTokenHash: hash,
      confirmExpiresAt: new Date(now.getTime() + CONFIRM_TTL_MS),
      confirmSentAt: now,
      locale: toDbLocale(input.locale),
      status: 'PENDING' as const,
    };
    if (existing) {
      await this.repository.update(existing.id, confirm);
    } else {
      try {
        await this.repository.create({
          teamId: page.team.id,
          email,
          ...confirm,
          unsubscribeToken: newUnsubscribeToken(),
        });
      } catch (error) {
        // The same address signed up at the same moment: the other request sends the email.
        if (isUniqueViolation(error)) return;
        throw error;
      }
    }
    this.monitors.forgetStatus(page.team.slug);
    this.send(
      cloudStatusConfirmEmail({
        to: email,
        locale: input.locale,
        pageTitle: page.title,
        team: page.team.name,
        url: `${this.config.cloudUrl}/${input.locale}/status-updates/confirm?token=${token}`,
        siteUrl: this.config.siteUrl,
      }),
      'confirmation',
    );
  }

  async confirm(token: string, now = new Date()): Promise<SubscriberResult> {
    const row = await this.repository.findByConfirmHash(hashToken(token));
    if (!row?.confirmExpiresAt || row.confirmExpiresAt <= now) {
      throw new BadRequestException('This confirmation link is invalid or has expired');
    }
    await this.repository.update(row.id, {
      status: 'ACTIVE',
      confirmedAt: now,
      unsubscribedAt: null,
      confirmTokenHash: null,
      confirmExpiresAt: null,
    });
    return { teamName: row.team.name, teamSlug: row.team.slug, locale: toApiLocale(row.locale) };
  }

  /** Idempotent: unsubscribing twice is fine. An unknown token is a 404. */
  async unsubscribe(token: string, now = new Date()): Promise<SubscriberResult> {
    const row = await this.repository.findByUnsubscribeToken(token);
    if (!row) throw new NotFoundException('Unknown unsubscribe link');
    if (row.status !== 'UNSUBSCRIBED') {
      await this.repository.update(row.id, {
        status: 'UNSUBSCRIBED',
        unsubscribedAt: now,
        // A confirmation link still in an inbox can't bring the address back.
        confirmTokenHash: null,
        confirmExpiresAt: null,
      });
      this.monitors.forgetStatus(row.team.slug);
    }
    return { teamName: row.team.name, teamSlug: row.team.slug, locale: toApiLocale(row.locale) };
  }

  /** Where the header's address leads in a browser: the page with the button. Changes nothing. */
  async unsubscribePageUrl(token: string): Promise<string> {
    const row = await this.repository.findByUnsubscribeToken(token);
    const locale = row ? toApiLocale(row.locale) : 'en';
    return this.unsubscribeUrl(locale, token);
  }

  private unsubscribeUrl(locale: ApiLocale, token: string): string {
    return `${this.config.cloudUrl}/${locale}/status-updates/unsubscribe?token=${encodeURIComponent(token)}`;
  }

  // ── Console ────────────────────────────────────────────────────────────────────────────────

  async list(
    ctx: CloudCtx,
    teamSlug: string,
    query: StatusSubscribersQuery,
  ): Promise<StatusSubscriberList> {
    const membership = await this.teams.access(ctx, teamSlug, 'ADMIN');
    const { skip, take } = pageToSkipTake(query.page, query.pageSize);
    const [{ items, total }, counts] = await Promise.all([
      this.repository.list(membership.teamId, query.status, skip, take),
      this.repository.counts(membership.teamId),
    ]);
    return {
      counts,
      limit: CLOUD_PLANS[membership.team.plan].statusSubscribers,
      items: paginate(items.map(view), total, query.page, query.pageSize),
    };
  }

  /** Erases one subscriber; the person can sign up again. */
  async remove(ctx: CloudCtx, teamSlug: string, id: string): Promise<void> {
    const membership = await this.teams.access(ctx, teamSlug, 'ADMIN');
    const row = await this.repository.findInTeam(membership.teamId, id);
    if (!row) throw new NotFoundException('Subscriber not found');
    await this.repository.delete(row.id);
    this.monitors.forgetStatus(teamSlug);
    // The id only: an erasure must not keep the address.
    await this.teams.record(ctx, membership.teamId, 'status_subscriber.deleted', row.id, {
      status: row.status,
    });
  }

  async removeAll(ctx: CloudCtx, teamSlug: string): Promise<{ deleted: number }> {
    const membership = await this.teams.access(ctx, teamSlug, 'ADMIN');
    const deleted = await this.repository.deleteAll(membership.teamId);
    this.monitors.forgetStatus(teamSlug);
    await this.teams.record(ctx, membership.teamId, 'status_subscribers.deleted_all', null, {
      count: deleted,
    });
    return { deleted };
  }

  // ── The sending job ────────────────────────────────────────────────────────────────────────

  /** Every minute: maintenance that has started, then the open dispatches in batches. */
  async tick(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const notice of await this.repository.startedMaintenance(now, STARTS_PER_RUN)) {
        await this.repository.claimMaintenanceStart(notice, now);
      }
      let budget = EMAILS_PER_RUN;
      for (const dispatch of await this.repository.openDispatches(DISPATCHES_PER_RUN)) {
        if (budget <= 0) break;
        budget -= await this.sendDispatch(dispatch, budget, now);
      }
    } catch (error) {
      this.logger.error(`Status page subscribers run failed: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }

  /** Sends what the team's hour and `budget` allow of one dispatch; returns the emails sent. */
  private async sendDispatch(dispatch: DispatchRow, budget: number, now: Date): Promise<number> {
    const page = dispatch.team.statusPage;
    if (
      !page?.enabled ||
      !page.subscriptions ||
      now.getTime() - dispatch.createdAt.getTime() > DISPATCH_MAX_AGE_MS
    ) {
      await this.repository.complete(dispatch.id, now);
      return 0;
    }
    const perHour = CLOUD_PLANS[dispatch.team.plan].statusEmailsPerHour;
    let cursor = dispatch.cursor;
    let used = 0;
    while (used < budget) {
      const batch = await this.repository.nextBatch(
        { teamId: dispatch.teamId, cursor, createdAt: dispatch.createdAt },
        Math.min(BATCH_SIZE, budget - used),
      );
      if (batch.length === 0) {
        await this.repository.complete(dispatch.id, now);
        break;
      }
      const granted = await this.repository.reserveEmails(
        dispatch.teamId,
        batch.length,
        perHour,
        now,
      );
      // No room left this hour: the dispatch waits for the next window.
      if (granted === 0) break;
      const slice = batch.slice(0, granted);
      const last = slice.at(-1)!.id;
      // Claimed before sending: a crash loses this batch rather than sending it twice.
      if (!(await this.repository.claimBatch(dispatch.id, cursor, last, slice.length))) {
        await this.repository.releaseEmails(dispatch.teamId, granted);
        break;
      }
      cursor = last;
      for (const subscriber of slice) {
        await this.pause();
        try {
          await this.mail.send(this.noticeEmail(dispatch, subscriber, now));
        } catch (error) {
          this.logger.error(
            `Dispatch ${dispatch.id}: an email to subscriber ${subscriber.id} failed: ${String(error)}`,
          );
        }
      }
      used += slice.length;
      if (granted < batch.length) break;
    }
    return used;
  }

  private noticeEmail(
    dispatch: DispatchRow,
    subscriber: CloudStatusSubscriber,
    now: Date,
  ): MailMessage {
    const locale = toApiLocale(subscriber.locale);
    const notice = dispatch.notice;
    const page = dispatch.team.statusPage!;
    const items = (page.items as Array<{ monitorId: string; label: string }>) ?? [];
    const window =
      notice.kind === 'MAINTENANCE' && notice.startsAt && notice.endsAt
        ? this.formatWindow(notice.startsAt, notice.endsAt, locale)
        : undefined;
    const cloud = this.config.cloudUrl;
    return cloudStatusEmail({
      to: subscriber.email,
      locale,
      kind: dispatch.kind,
      pageTitle: page.title,
      team: dispatch.team.name,
      notice: {
        kind: notice.kind,
        title: notice.title,
        state: noticeState(notice, now),
        window,
        monitors: items
          .filter((item) => notice.monitorIds.includes(item.monitorId))
          .map((item) => item.label),
      },
      body: dispatch.update?.body ?? notice.updates[0]?.body ?? null,
      pageUrl: `${cloud}/${locale}/status/${dispatch.team.slug}`,
      unsubscribe: {
        pageUrl: this.unsubscribeUrl(locale, subscriber.unsubscribeToken),
        oneClickUrl: `${this.config.publicApiUrl}/cloud/status-subscribers/unsubscribe/${subscriber.unsubscribeToken}`,
      },
      siteUrl: this.config.siteUrl,
    });
  }

  /** "17 Nov 2026, 02:00 – 04:00 (Madrid)" style, in the reader's language. */
  private formatWindow(start: Date, end: Date, locale: ApiLocale): string {
    const format = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Europe/Madrid',
    });
    return `${format.formatRange(start, end)} (${locale === 'es' ? 'hora de Madrid' : 'Madrid time'})`;
  }

  /** Daily: unconfirmed sign-ups, long-unsubscribed rows and finished dispatches. Never throws. */
  async cleanup(now = new Date()): Promise<void> {
    try {
      const pending = await this.repository.deletePendingExpiredBefore(
        new Date(now.getTime() - PENDING_RETENTION_MS),
      );
      const left = await this.repository.deleteUnsubscribedBefore(
        new Date(now.getTime() - UNSUBSCRIBED_RETENTION_MS),
      );
      await this.repository.deleteCompletedDispatchesBefore(
        new Date(now.getTime() - DISPATCH_RETENTION_MS),
      );
      if (pending || left) {
        this.logger.log(
          `Deleted ${pending} unconfirmed and ${left} long unsubscribed status page subscribers`,
        );
      }
    } catch (error) {
      this.logger.error(`Status page subscribers cleanup failed: ${String(error)}`);
    }
  }

  private pause(): Promise<void> {
    if (this.config.isTest) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, SEND_PAUSE_MS));
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
      this.logger.error(`Failed to send a status page ${kind} email: ${reason}`);
    });
  }
}
