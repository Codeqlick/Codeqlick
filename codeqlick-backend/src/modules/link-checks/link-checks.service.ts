import {
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { toApiLocale, type ApiLocale } from '../../common/schemas/common.schemas.js';
import { pickTranslation } from '../../common/translations.js';
import { AppConfigService } from '../../config/app-config.service.js';
import {
  LinkStatus,
  type LinkCheck,
  type LinkSourceType,
  type Locale,
} from '../../generated/prisma/client.js';
import { MediaService } from '../media/media.service.js';
import {
  checkExternalLink,
  forEachHostSerially,
  LINK_CHECK_INTERVAL_MS,
  Pacer,
} from './external-links.js';
import { buildLiveIndex, internalLinkExists, type LiveIndex } from './internal-links.js';
import { LinkChecksRepository, type LinkKey } from './link-checks.repository.js';
import { nextLinkState, type CheckOutcome } from './link-status.js';
import { extractMarkdownLinks, resolveLink, withoutFragment } from './markdown-links.js';

const HOUR_MS = 3_600_000;
/** A full run happens when the last one is this old (or there was none). */
export const RUN_EVERY_MS = 7 * 24 * HOUR_MS;
/** After a run that failed, the next try waits this long. */
export const RETRY_AFTER_MS = 6 * HOUR_MS;
/** The first look after a start, once the API has settled. */
const FIRST_LOOK_MS = 5 * 60_000;

export interface LinkView {
  id: string;
  url: string;
  internal: boolean;
  status: LinkStatus;
  statusCode: number | null;
  error: string | null;
  failures: number;
  brokenSince: string | null;
  checkedAt: string;
  source: { type: LinkSourceType; id: string; slug: string; title: string; locale: ApiLocale };
}

export interface LinkList {
  items: LinkView[];
  /** When the last full run started; null before the first one. */
  lastRunAt: string | null;
}

export interface RunOptions {
  /** Least time between two requests to other sites (default: two a second). */
  intervalMs?: number;
}

export interface RunSummary {
  /** Links found (one per place it appears). */
  links: number;
  /** Distinct external addresses requested. */
  requested: number;
  broken: number;
}

const NOT_FOUND: CheckOutcome = { result: 'fail', statusCode: 404, error: null };
const FOUND: CheckOutcome = { result: 'ok', statusCode: 200, error: null };
/** A dynamic page or a file of the website: not looked up, so neither good nor bad. */
const UNKNOWN: CheckOutcome = { result: 'unknown', statusCode: null, error: null };

/**
 * Broken links in published posts and case studies (architecture 4.6): every hour it looks
 * whether the last full run is a week old, and then checks every link of the live content in
 * both languages. Internal links are checked against the database and the site's routes; external
 * ones are requested (one at a time per host, at most two a second, each address once per run).
 * The last run's time (and the last failed one's, retried after 6 hours) is a `settings` row. Off
 * in tests.
 */
@Injectable()
export class LinkChecksService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(LinkChecksService.name);
  private timer: NodeJS.Timeout | undefined;
  private firstLook: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly repository: LinkChecksRepository,
    private readonly media: MediaService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    // Tests run against a shared database and start the app many times: no background work there.
    if (this.config.nodeEnv === 'test') return;
    this.timer = setInterval(() => void this.runDue(), HOUR_MS).unref();
    this.firstLook = setTimeout(() => void this.runDue(), FIRST_LOOK_MS).unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
    clearTimeout(this.firstLook);
  }

  /** Runs the full check when it is due. Never throws: a failed run is retried 6 hours later. */
  async runDue(now = new Date()): Promise<void> {
    try {
      const { lastRunAt, lastAttemptAt } = await this.repository.runTimes();
      if (!isRunDue(lastRunAt, lastAttemptAt, now)) return;
    } catch (failure) {
      this.logger.error('Could not read when the links were last checked', failure);
      return;
    }
    try {
      const summary = await this.runFull(now);
      if (summary) {
        this.logger.log(
          `Checked ${summary.links} links (${summary.requested} external addresses): ${summary.broken} broken`,
        );
      }
    } catch (failure) {
      this.logger.error('Could not check the links of the published content', failure);
      await this.repository
        .saveRunTimes({ lastAttemptAt: now })
        .catch((error: unknown) => this.logger.error('Could not save the failed run', error));
    }
  }

  /** Checks every link of the live content now; null when a run is already going. */
  async runFull(now = new Date(), options: RunOptions = {}): Promise<RunSummary | null> {
    if (this.running) return null;
    this.running = true;
    try {
      const content = await this.repository.liveContent(now);
      const index = buildLiveIndex(
        content.map((item) => ({
          type: item.type,
          slug: item.slug,
          locales: item.translations.map((t) => t.locale),
        })),
      );

      // Every link where it appears (once per post or case study and language).
      const found = new Map<string, LinkKey & { internal: boolean }>();
      for (const item of content) {
        for (const translation of item.translations) {
          const pageUrl = this.pageUrl(item.type, item.slug, translation.locale);
          for (const href of extractMarkdownLinks(translation.content)) {
            const link = resolveLink(href, pageUrl, this.config.siteUrl);
            if (!link) continue;
            const key = {
              url: link.url,
              sourceType: item.type,
              sourceId: item.id,
              locale: translation.locale,
            };
            found.set(keyOf(key), { ...key, internal: link.internal });
          }
        }
      }

      // Links no longer in the content (or whose content isn't live any more) go.
      const existing = new Map((await this.repository.findAll()).map((row) => [keyOf(row), row]));
      await this.repository.deleteMany(
        [...existing].filter(([key]) => !found.has(key)).map(([, row]) => row.id),
      );

      // Each internal target is looked up once per language, each external address fetched once.
      const internal = new Map<string, CheckOutcome>();
      const external = new Set<string>();
      for (const link of found.values()) {
        if (!link.internal) {
          external.add(withoutFragment(link.url));
          continue;
        }
        const target = `${link.locale} ${link.url}`;
        if (!internal.has(target)) {
          internal.set(target, await this.checkInternal(link.url, link.locale, index));
        }
      }
      const pacer = new Pacer(options.intervalMs ?? LINK_CHECK_INTERVAL_MS);
      const fetched = await forEachHostSerially([...external], (url) =>
        checkExternalLink(url, () => pacer.next()),
      );

      let broken = 0;
      for (const [key, link] of found) {
        const outcome = link.internal
          ? internal.get(`${link.locale} ${link.url}`)!
          : fetched.get(withoutFragment(link.url))!;
        const state = nextLinkState(existing.get(key) ?? null, outcome, now);
        const { internal: isInternal, ...linkKey } = link;
        await this.repository.save(linkKey, { internal: isInternal, ...state });
        if (state.status === LinkStatus.BROKEN) broken += 1;
      }

      await this.repository.saveRunTimes({ lastRunAt: now });
      return { links: found.size, requested: external.size, broken };
    } finally {
      this.running = false;
    }
  }

  async list(status: 'broken' | 'all', now = new Date()): Promise<LinkList> {
    const [rows, { lastRunAt }] = await Promise.all([
      this.repository.list(status === 'broken', now),
      this.repository.runTimes(),
    ]);
    return { items: await this.toViews(rows), lastRunAt: lastRunAt?.toISOString() ?? null };
  }

  /** Checks one link now ("Check again"); the result counts like a scheduled check. */
  async check(id: string, now = new Date()): Promise<LinkView> {
    // Only links of live content are shown, so only they can be checked again.
    const row = await this.repository.findLiveById(id, now);
    if (!row) throw new NotFoundException('Link not found');
    const outcome = row.internal
      ? await this.checkInternal(
          row.url,
          row.locale,
          buildLiveIndex(await this.repository.liveSlugs(now)),
        )
      : await checkExternalLink(withoutFragment(row.url));
    const updated = await this.repository.update(id, nextLinkState(row, outcome, now));
    const [view] = await this.toViews([updated]);
    if (!view) throw new NotFoundException('Link not found');
    return view;
  }

  private async checkInternal(
    url: string,
    locale: Locale,
    index: LiveIndex,
  ): Promise<CheckOutcome> {
    const exists = await internalLinkExists(url, locale, index, (filename) =>
      this.media.exists(filename),
    );
    if (exists === null) return UNKNOWN;
    return exists ? FOUND : NOT_FOUND;
  }

  /** The address of the page a translation is shown on (relative links resolve against it). */
  private pageUrl(type: LinkSourceType, slug: string, locale: Locale): string {
    const section = type === 'POST' ? 'blog' : 'work';
    return `${this.config.siteUrl}/${toApiLocale(locale)}/${section}/${slug}`;
  }

  private async toViews(rows: LinkCheck[]): Promise<LinkView[]> {
    if (rows.length === 0) return [];
    const ids = (type: LinkSourceType) => [
      ...new Set(rows.filter((row) => row.sourceType === type).map((row) => row.sourceId)),
    ];
    const sources = new Map(
      (await this.repository.sources(ids('POST'), ids('PORTFOLIO'))).map((source) => [
        `${source.type} ${source.id}`,
        source,
      ]),
    );
    return rows.flatMap((row): LinkView[] => {
      // A row whose post or case study is gone (deleted meanwhile) isn't shown.
      const source = sources.get(`${row.sourceType} ${row.sourceId}`);
      if (!source) return [];
      const locale = toApiLocale(row.locale);
      return [
        {
          id: row.id,
          url: row.url,
          internal: row.internal,
          status: row.status,
          statusCode: row.statusCode,
          error: row.error,
          failures: row.failures,
          brokenSince: row.brokenSince?.toISOString() ?? null,
          checkedAt: row.checkedAt.toISOString(),
          source: {
            type: source.type,
            id: source.id,
            slug: source.slug,
            title: pickTranslation(source.translations, locale)?.title ?? source.slug,
            locale,
          },
        },
      ];
    });
  }
}

/**
 * A full run is due when the last one is a week old (or there was none), unless a run failed less
 * than 6 hours ago.
 */
export function isRunDue(lastRunAt: Date | null, lastAttemptAt: Date | null, now: Date): boolean {
  if (lastRunAt && now.getTime() - lastRunAt.getTime() < RUN_EVERY_MS) return false;
  if (!lastAttemptAt || (lastRunAt && lastAttemptAt <= lastRunAt)) return true;
  return now.getTime() - lastAttemptAt.getTime() >= RETRY_AFTER_MS;
}

function keyOf(key: LinkKey): string {
  return `${key.sourceType} ${key.sourceId} ${key.locale} ${key.url}`;
}
