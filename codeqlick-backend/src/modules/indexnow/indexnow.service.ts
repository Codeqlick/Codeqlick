import {
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { isLive } from '../../common/publishing.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { PublishStatus } from '../../generated/prisma/client.js';
import { IndexNowRepository } from './indexnow.repository.js';

const MINUTE_MS = 60_000;
/** How often content that went live on its own (scheduled) is looked for. */
export const RUN_EVERY_MS = 5 * MINUTE_MS;
/** An address submitted this recently is left out; also how far back the timer looks. */
export const RECENT_MS = 10 * MINUTE_MS;
const TIMEOUT_MS = 10_000;
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const LOCALES = ['en', 'es'] as const;
/** Where each kind of content lives on the website, under /<locale>. */
const SECTIONS = { post: 'blog', portfolio: 'work' } as const;

export type IndexNowKind = keyof typeof SECTIONS;

export interface IndexNowItem {
  kind: IndexNowKind;
  /** The item's slug, and its old one after a slug change. */
  slugs: string[];
}

interface Publishable {
  slug: string;
  status: PublishStatus;
  publishedAt: Date | null;
}

/**
 * The slugs to announce after an item was created (no `before`), updated or deleted (no
 * `after`): none unless it was live before or is live after; its old slug too when it changed.
 */
export function slugsToAnnounce(
  before: Publishable | null,
  after: Publishable | null,
  now = new Date(),
): string[] {
  const live = (before && isLive(before, now)) || (after && isLive(after, now));
  if (!live) return [];
  return [...new Set([after?.slug, before?.slug].filter((slug) => slug !== undefined))];
}

/** The IndexNow key: the first 32 hex characters of HMAC-SHA256(JWT_ACCESS_SECRET, purpose). */
export function indexNowKey(secret: string): string {
  return createHmac('sha256', secret).update('indexnow-v1').digest('hex').slice(0, 32);
}

/**
 * IndexNow (architecture 4.1, decision 74): tells search engines about posts and case studies
 * that changed, instead of waiting for their crawlers. Fire-and-forget: a submission never fails
 * or delays the change, and a failure is only logged (the sitemap stays the source of truth).
 * Every 5 minutes it also submits the scheduled content that went live on its own.
 */
@Injectable()
export class IndexNowService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(IndexNowService.name);
  private timer: NodeJS.Timeout | undefined;
  private cachedKey: string | undefined;
  /** Address → when it was last submitted (ms). */
  private readonly sent = new Map<string, number>();

  constructor(
    private readonly config: AppConfigService,
    private readonly repository: IndexNowRepository,
  ) {}

  onApplicationBootstrap(): void {
    // Tests run against a shared database and start the app many times: no background work there.
    if (this.config.nodeEnv === 'test' || !this.config.indexNowEnabled) return;
    this.timer = setInterval(() => void this.runDue(), RUN_EVERY_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  get key(): string {
    this.cachedKey ??= indexNowKey(this.config.jwtAccessSecret);
    return this.cachedKey;
  }

  /** The key for the website's /indexnow-key.txt; 404 while IndexNow is off. */
  publicKey(): { key: string } {
    if (!this.config.indexNowEnabled) throw new NotFoundException('IndexNow is off');
    return { key: this.key };
  }

  /** Submits the items' addresses in the background. Never throws, never waits. */
  announce(...items: IndexNowItem[]): void {
    if (!this.config.indexNowEnabled) return;
    void this.submit(items);
  }

  /** Submits the posts and case studies that went live in the last 10 minutes. Never throws. */
  async runDue(now = new Date()): Promise<void> {
    if (!this.config.indexNowEnabled) return;
    try {
      const live = await this.repository.wentLive(new Date(now.getTime() - RECENT_MS), now);
      const items: IndexNowItem[] = [];
      if (live.posts.length > 0) items.push({ kind: 'post', slugs: live.posts });
      if (live.portfolio.length > 0) items.push({ kind: 'portfolio', slugs: live.portfolio });
      await this.submit(items, now);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`IndexNow run failed: ${reason}`);
    }
  }

  /** The website addresses of the items: each one in both languages, and their list pages. */
  urlsFor(items: IndexNowItem[]): string[] {
    const site = this.config.siteUrl;
    const urls = new Set<string>();
    for (const { kind, slugs } of items) {
      const section = SECTIONS[kind];
      for (const slug of slugs) {
        for (const locale of LOCALES) {
          urls.add(`${site}/${locale}/${section}/${encodeURIComponent(slug)}`);
        }
      }
      if (slugs.length > 0) {
        for (const locale of LOCALES) urls.add(`${site}/${locale}/${section}`);
      }
    }
    return [...urls];
  }

  /** One submission of the addresses not sent in the last 10 minutes. Never throws. */
  async submit(items: IndexNowItem[], now = new Date()): Promise<void> {
    if (!this.config.indexNowEnabled) return;
    try {
      const urlList = this.fresh(this.urlsFor(items), now.getTime());
      if (urlList.length === 0) return;
      const site = this.config.siteUrl;
      const response = await fetch(INDEXNOW_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          host: new URL(site).host,
          key: this.key,
          keyLocation: `${site}/indexnow-key.txt`,
          urlList,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.status !== 200 && response.status !== 202) {
        this.logger.warn(`IndexNow answered ${response.status} for ${urlList.length} address(es)`);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`IndexNow submission failed: ${reason}`);
    }
  }

  /** Drops the addresses sent recently and marks the rest as sent (failures are not retried). */
  private fresh(urls: string[], now: number): string[] {
    for (const [url, at] of this.sent) {
      if (now - at >= RECENT_MS) this.sent.delete(url);
    }
    const fresh = urls.filter((url) => !this.sent.has(url));
    for (const url of fresh) this.sent.set(url, now);
    return fresh;
  }
}
