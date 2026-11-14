import { Injectable } from '@nestjs/common';
import {
  LinkStatus,
  type LinkCheck,
  type LinkSourceType,
  type Locale,
  type Prisma,
} from '../../generated/prisma/client.js';
import { liveWhere } from '../../common/publishing.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** The `settings` row that remembers when the last full run happened (and the last failed one). */
export const SETTINGS_KEY = 'linkChecks';

/** Most links listed at once. */
export const MAX_LISTED = 500;

/** A live post or case study with the Markdown of each of its translations. */
export interface LiveContent {
  type: LinkSourceType;
  id: string;
  slug: string;
  translations: { locale: Locale; content: string }[];
}

/** A link where it appears: the unique key of a row. */
export interface LinkKey {
  url: string;
  sourceType: LinkSourceType;
  sourceId: string;
  locale: Locale;
}

export interface LinkCheckData {
  internal: boolean;
  status: LinkStatus;
  statusCode: number | null;
  error: string | null;
  failures: number;
  brokenSince: Date | null;
  checkedAt: Date;
}

export interface RunTimes {
  /** When the last full run started (it finished). */
  lastRunAt: Date | null;
  /** When the last run that failed started. */
  lastAttemptAt: Date | null;
}

/** A post or case study as the list shows it. */
export interface LinkSource {
  type: LinkSourceType;
  id: string;
  slug: string;
  translations: { locale: Locale; title: string }[];
}

/**
 * Rows whose post or case study is live now. A row of content unpublished, scheduled again or
 * deleted stays until the next run (or goes with the delete) but is never listed or counted.
 * `sourceId` has no foreign key (it points at either table), so the live ids are read first: there
 * are few posts and case studies.
 */
export async function liveSourceWhere(
  prisma: PrismaService,
  now: Date,
): Promise<Prisma.LinkCheckWhereInput> {
  const [posts, items] = await prisma.$transaction([
    prisma.post.findMany({ where: liveWhere(now), select: { id: true } }),
    prisma.portfolioItem.findMany({ where: liveWhere(now), select: { id: true } }),
  ]);
  return {
    OR: [
      { sourceType: 'POST', sourceId: { in: posts.map((post) => post.id) } },
      { sourceType: 'PORTFOLIO', sourceId: { in: items.map((item) => item.id) } },
    ],
  };
}

@Injectable()
export class LinkChecksRepository {
  constructor(private readonly prisma: PrismaService) {}

  async liveContent(now: Date): Promise<LiveContent[]> {
    const select = {
      id: true,
      slug: true,
      translations: { select: { locale: true, content: true } },
    } as const;
    const [posts, items] = await this.prisma.$transaction([
      this.prisma.post.findMany({ where: liveWhere(now), select }),
      this.prisma.portfolioItem.findMany({ where: liveWhere(now), select }),
    ]);
    return [
      ...posts.map((post) => ({ type: 'POST' as const, ...post })),
      ...items.map((item) => ({ type: 'PORTFOLIO' as const, ...item })),
    ];
  }

  /** Live posts' and case studies' slugs with their languages (no content). */
  async liveSlugs(now: Date): Promise<{ type: LinkSourceType; slug: string; locales: Locale[] }[]> {
    const select = { slug: true, translations: { select: { locale: true } } } as const;
    const [posts, items] = await this.prisma.$transaction([
      this.prisma.post.findMany({ where: liveWhere(now), select }),
      this.prisma.portfolioItem.findMany({ where: liveWhere(now), select }),
    ]);
    const toEntry = (type: LinkSourceType) => (row: (typeof posts)[number]) => ({
      type,
      slug: row.slug,
      locales: row.translations.map((t) => t.locale),
    });
    return [...posts.map(toEntry('POST')), ...items.map(toEntry('PORTFOLIO'))];
  }

  findAll(): Promise<LinkCheck[]> {
    return this.prisma.linkCheck.findMany();
  }

  async deleteMany(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const { count } = await this.prisma.linkCheck.deleteMany({ where: { id: { in: ids } } });
    return count;
  }

  save(key: LinkKey, data: LinkCheckData): Promise<LinkCheck> {
    return this.prisma.linkCheck.upsert({
      where: { url_sourceType_sourceId_locale: key },
      create: { ...key, ...data },
      update: data,
    });
  }

  /** Links of live content only, broken first, then by URL. */
  async list(brokenOnly: boolean, now: Date): Promise<LinkCheck[]> {
    const live = await liveSourceWhere(this.prisma, now);
    return this.prisma.linkCheck.findMany({
      where: brokenOnly ? { AND: [live, { status: LinkStatus.BROKEN }] } : live,
      // Postgres sorts an enum by its declaration order: OK, then BROKEN.
      orderBy: [{ status: 'desc' }, { url: 'asc' }, { id: 'asc' }],
      take: MAX_LISTED,
    });
  }

  /** The row, when its post or case study is live now. */
  async findLiveById(id: string, now: Date): Promise<LinkCheck | null> {
    const live = await liveSourceWhere(this.prisma, now);
    return this.prisma.linkCheck.findFirst({ where: { AND: [{ id }, live] } });
  }

  update(id: string, data: Omit<LinkCheckData, 'internal'>): Promise<LinkCheck> {
    return this.prisma.linkCheck.update({ where: { id }, data });
  }

  async sources(postIds: string[], portfolioIds: string[]): Promise<LinkSource[]> {
    const select = {
      id: true,
      slug: true,
      translations: { select: { locale: true, title: true } },
    } as const;
    const [posts, items] = await this.prisma.$transaction([
      this.prisma.post.findMany({ where: { id: { in: postIds } }, select }),
      this.prisma.portfolioItem.findMany({ where: { id: { in: portfolioIds } }, select }),
    ]);
    return [
      ...posts.map((post) => ({ type: 'POST' as const, ...post })),
      ...items.map((item) => ({ type: 'PORTFOLIO' as const, ...item })),
    ];
  }

  /** When the last full run happened, and when the last one failed (`settings` row). */
  async runTimes(): Promise<RunTimes> {
    const row = await this.prisma.setting.findUnique({ where: { key: SETTINGS_KEY } });
    const stored: unknown = row?.value;
    const fields =
      stored && typeof stored === 'object' && !Array.isArray(stored)
        ? (stored as Record<string, unknown>)
        : {};
    return { lastRunAt: toDate(fields.lastRunAt), lastAttemptAt: toDate(fields.lastAttemptAt) };
  }

  /** Saves the given times, keeping the other one. */
  async saveRunTimes(times: Partial<RunTimes>): Promise<void> {
    const merged = { ...(await this.runTimes()), ...times };
    const value = {
      lastRunAt: merged.lastRunAt?.toISOString() ?? null,
      lastAttemptAt: merged.lastAttemptAt?.toISOString() ?? null,
    };
    await this.prisma.setting.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, value },
      update: { value },
    });
  }
}

function toDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
