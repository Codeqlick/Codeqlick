import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { DISPOSABLE_EMAIL_ERROR, isDisposableEmail } from '../../common/disposable-email.js';
import { toApiLocale, toDbLocale, type ApiLocale } from '../../common/schemas/common.schemas.js';
import { pickTranslation } from '../../common/translations.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { pageToSkipTake, paginate, type Paginated } from '../../common/types/paginated.js';
import type { NewsletterSubscriber } from '../../generated/prisma/client.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { MailService, type MailMessage } from '../mail/mail.service.js';
import { newsletterConfirmEmail, newsletterPostEmail } from './newsletter-emails.js';
import { NewsletterRepository, type SubscriberCounts } from './newsletter.repository.js';
import type { ListSubscribersQuery, SubscribeInput } from './newsletter.schemas.js';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** How long a confirmation link works. */
export const CONFIRM_TTL_HOURS = 48;
/** At most one confirmation email per address in this time. */
export const CONFIRM_RESEND_MINUTES = 10;
/** Posts emailed per run; the rest wait for the next one. */
export const POSTS_PER_RUN = 3;
/** `PENDING` sign-ups are deleted this long after their confirmation expired. */
export const PENDING_RETENTION_DAYS = 7;
/** Unsubscribed rows (kept to tell a later sign-up apart) are deleted after this long. */
export const UNSUBSCRIBED_RETENTION_DAYS = 365;
/** Pause between two emails, to stay within the SMTP account's limits. */
const SEND_PAUSE_MS = 200;

const SEND_INTERVAL_MS = 10 * MINUTE_MS;
const FIRST_RUN_DELAY_MS = 60_000;

export interface NewsletterSubscriberView {
  id: string;
  email: string;
  locale: ApiLocale;
  status: NewsletterSubscriber['status'];
  createdAt: string;
  confirmedAt: string | null;
  unsubscribedAt: string | null;
}

export type SubscriberList = Paginated<NewsletterSubscriberView> & { counts: SubscriberCounts };

function toView(row: NewsletterSubscriber): NewsletterSubscriberView {
  return {
    id: row.id,
    email: row.email,
    locale: toApiLocale(row.locale),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    unsubscribedAt: row.unsubscribedAt?.toISOString() ?? null,
  };
}

export function hashConfirmToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * The blog newsletter (architecture 4.14): double opt-in sign-up, one-click unsubscribe, and a
 * background job that emails each new post once to the active subscribers.
 */
@Injectable()
export class NewsletterService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(NewsletterService.name);
  private firstRun: NodeJS.Timeout | undefined;
  private sendTimer: NodeJS.Timeout | undefined;
  private cleanupTimer: NodeJS.Timeout | undefined;
  private sending = false;

  constructor(
    private readonly repository: NewsletterRepository,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
    private readonly activity: ActivityService,
  ) {}

  onApplicationBootstrap(): void {
    // Tests run against a shared database and start the app many times: no background work there.
    if (this.config.isTest) return;
    this.firstRun = setTimeout(() => {
      void this.sendNewPosts();
      void this.cleanup();
    }, FIRST_RUN_DELAY_MS).unref();
    this.sendTimer = setInterval(() => void this.sendNewPosts(), SEND_INTERVAL_MS).unref();
    this.cleanupTimer = setInterval(() => void this.cleanup(), DAY_MS).unref();
  }

  onApplicationShutdown(): void {
    clearTimeout(this.firstRun);
    clearInterval(this.sendTimer);
    clearInterval(this.cleanupTimer);
  }

  // ---- Public -------------------------------------------------------------------------

  /** Always resolves (the route answers 202) so it never reveals whether an address is known. */
  async subscribe(input: SubscribeInput, now = new Date()): Promise<void> {
    if (input.website && input.website.trim() !== '') {
      this.logger.warn('Newsletter honeypot triggered; request discarded');
      return;
    }
    const email = input.email.trim().toLowerCase();
    if (isDisposableEmail(email)) {
      throw new BadRequestException({ errors: [DISPOSABLE_EMAIL_ERROR] });
    }
    const existing = await this.repository.findByEmail(email);
    if (existing?.status === 'ACTIVE') return;
    if (
      existing?.confirmSentAt &&
      now.getTime() - existing.confirmSentAt.getTime() < CONFIRM_RESEND_MINUTES * MINUTE_MS
    ) {
      return;
    }

    const token = randomBytes(48).toString('base64url');
    const confirm = {
      confirmTokenHash: hashConfirmToken(token),
      confirmExpiresAt: new Date(now.getTime() + CONFIRM_TTL_HOURS * HOUR_MS),
      confirmSentAt: now,
    };
    const locale = toDbLocale(input.locale);
    if (existing) {
      await this.repository.update(existing.id, { ...confirm, locale, status: 'PENDING' });
    } else {
      try {
        await this.repository.create({
          email,
          locale,
          status: 'PENDING',
          ...confirm,
          unsubscribeToken: randomBytes(32).toString('base64url'),
        });
      } catch (error) {
        // The same address signed up at the same moment: the other request sends the email.
        if (isUniqueViolation(error)) return;
        throw error;
      }
    }
    const siteUrl = this.config.siteUrl;
    this.send(
      newsletterConfirmEmail(
        email,
        input.locale,
        `${siteUrl}/${input.locale}/newsletter/confirm?token=${token}`,
        siteUrl,
      ),
      'confirmation',
    );
  }

  async confirm(token: string, now = new Date()): Promise<{ email: string; locale: ApiLocale }> {
    const row = await this.repository.findByConfirmHash(hashConfirmToken(token));
    if (!row?.confirmExpiresAt || row.confirmExpiresAt <= now) {
      throw new BadRequestException('This confirmation link is invalid or has expired');
    }
    const confirmed = await this.repository.update(row.id, {
      status: 'ACTIVE',
      confirmedAt: now,
      unsubscribedAt: null,
      confirmTokenHash: null,
      confirmExpiresAt: null,
    });
    return { email: confirmed.email, locale: toApiLocale(confirmed.locale) };
  }

  /** Idempotent: unsubscribing twice is fine. An unknown token is a 404. */
  async unsubscribe(token: string, now = new Date()): Promise<{ email: string }> {
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
    }
    return { email: row.email };
  }

  /** Where the unsubscribe link of an email leads: the page with the button. Changes nothing. */
  async unsubscribePageUrl(token: string): Promise<string> {
    const row = await this.repository.findByUnsubscribeToken(token);
    const locale = row ? toApiLocale(row.locale) : 'en';
    return `${this.config.siteUrl}/${locale}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
  }

  // ---- Admin --------------------------------------------------------------------------

  async list(query: ListSubscribersQuery): Promise<SubscriberList> {
    const { skip, take } = pageToSkipTake(query.page, query.pageSize);
    const [{ items, total }, counts] = await Promise.all([
      this.repository.list({ status: query.status, q: query.q }, skip, take),
      this.repository.counts(),
    ]);
    return { ...paginate(items.map(toView), total, query.page, query.pageSize), counts };
  }

  async delete(actor: AuthUser, id: string): Promise<void> {
    const row = await this.repository.findById(id);
    if (!row) throw new NotFoundException('Subscriber not found');
    await this.repository.delete(id);
    await this.activity.record(actor, {
      action: 'newsletter.subscriber_deleted',
      targetId: id,
      // No label: erasure must not keep the email.
      targetLabel: null,
    });
  }

  // ---- Background jobs ------------------------------------------------------------------

  /**
   * Emails the posts that have just gone live (at most POSTS_PER_RUN, oldest first). Each post is
   * marked as sent before anything is emailed, so a crash loses an email but never repeats one.
   * Never throws.
   */
  async sendNewPosts(now = new Date()): Promise<void> {
    if (this.sending) return;
    this.sending = true;
    try {
      const posts = await this.repository.findPostsToSend(now, POSTS_PER_RUN);
      for (const post of posts) {
        try {
          // Only one process gets to send a post.
          if (!(await this.repository.claimPost(post.id, now))) continue;
        } catch (error) {
          this.logger.error(
            `Newsletter: could not mark post ${post.slug} as sent: ${String(error)}`,
          );
          continue;
        }
        if (!post.newsletter) continue;
        // Reloaded per post: people may have unsubscribed during the previous one.
        const subscribers = await this.repository.listActive();
        let sent = 0;
        let failed = 0;
        for (const subscriber of subscribers) {
          const locale = toApiLocale(subscriber.locale);
          const translation = pickTranslation(post.translations, locale);
          if (!translation) continue;
          const siteUrl = this.config.siteUrl;
          await this.pause();
          try {
            await this.mail.send(
              newsletterPostEmail(
                subscriber.email,
                locale,
                {
                  title: translation.title,
                  excerpt: translation.excerpt,
                  postUrl: `${siteUrl}/${locale}/blog/${post.slug}`,
                },
                {
                  pageUrl: `${siteUrl}/${locale}/newsletter/unsubscribe?token=${subscriber.unsubscribeToken}`,
                  oneClickUrl: `${this.config.publicApiUrl}/newsletter/unsubscribe/${subscriber.unsubscribeToken}`,
                },
                siteUrl,
              ),
            );
            sent += 1;
          } catch (error) {
            failed += 1;
            const reason = error instanceof Error ? error.message : String(error);
            this.logger.error(`Newsletter: failed to email ${post.slug}: ${reason}`);
          }
        }
        this.logger.log(`Newsletter: post ${post.slug} emailed to ${sent} (${failed} failed)`);
      }
    } catch (error) {
      this.logger.error('Newsletter sending failed', error instanceof Error ? error.stack : error);
    } finally {
      this.sending = false;
    }
  }

  /** Deletes `PENDING` sign-ups whose confirmation expired more than a week ago. Never throws. */
  async cleanup(now = new Date()): Promise<void> {
    try {
      const pending = await this.repository.deletePendingExpiredBefore(
        new Date(now.getTime() - PENDING_RETENTION_DAYS * DAY_MS),
      );
      const left = await this.repository.deleteUnsubscribedBefore(
        new Date(now.getTime() - UNSUBSCRIBED_RETENTION_DAYS * DAY_MS),
      );
      if (pending || left) {
        this.logger.log(
          `Deleted ${pending} unconfirmed and ${left} long unsubscribed newsletter sign-ups`,
        );
      }
    } catch (error) {
      this.logger.error('Newsletter cleanup failed', error instanceof Error ? error.stack : error);
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
      this.logger.error(`Failed to send newsletter ${kind} email: ${reason}`);
    });
  }
}
