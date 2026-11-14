import { Injectable } from '@nestjs/common';
import type { Prisma, SiteNewsPost } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { NewsStatus } from './site-news.js';

@Injectable()
export class SiteNewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** A site's posts, newest first (drafts by creation, published ones by publication). */
  async list(
    siteId: string,
    status: NewsStatus | undefined,
    now: Date,
    skip: number,
    take: number,
  ): Promise<{ rows: SiteNewsPost[]; total: number }> {
    const where: Prisma.SiteNewsPostWhereInput = {
      siteId,
      ...(status === 'DRAFT' ? { publishedAt: null } : {}),
      ...(status === 'PUBLISHED'
        ? { publishedAt: { not: null }, OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }
        : {}),
      ...(status === 'EXPIRED' ? { publishedAt: { not: null }, expiresAt: { lt: now } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.siteNewsPost.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.siteNewsPost.count({ where }),
    ]);
    return { rows, total };
  }

  find(siteId: string, id: string): Promise<SiteNewsPost | null> {
    return this.prisma.siteNewsPost.findFirst({ where: { id, siteId } });
  }

  count(siteId: string): Promise<number> {
    return this.prisma.siteNewsPost.count({ where: { siteId } });
  }

  /** The slugs of the site that start with `base`, to find a free one. */
  async slugsStartingWith(siteId: string, base: string): Promise<Set<string>> {
    const rows = await this.prisma.siteNewsPost.findMany({
      where: { siteId, slug: { startsWith: base } },
      select: { slug: true },
    });
    return new Set(rows.map((row) => row.slug));
  }

  create(data: Prisma.SiteNewsPostUncheckedCreateInput): Promise<SiteNewsPost> {
    return this.prisma.siteNewsPost.create({ data });
  }

  update(id: string, data: Prisma.SiteNewsPostUncheckedUpdateInput): Promise<SiteNewsPost> {
    return this.prisma.siteNewsPost.update({ where: { id }, data });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.siteNewsPost.delete({ where: { id } });
  }

  /** What the site shows: published and not expired, newest first. */
  live(siteId: string, now: Date): Promise<SiteNewsPost[]> {
    return this.prisma.siteNewsPost.findMany({
      where: {
        siteId,
        publishedAt: { not: null },
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    });
  }

  /**
   * Sites with news on and a published post that expired: the job keeps those whose last build
   * is older than the expiry.
   */
  sitesWithExpiredPosts(now: Date) {
    return this.prisma.managedSite.findMany({
      where: {
        newsEnabled: true,
        lastBuildAt: { not: null },
        newsPosts: { some: { publishedAt: { not: null }, expiresAt: { lt: now } } },
      },
      select: {
        projectId: true,
        lastBuildAt: true,
        newsPosts: {
          where: { publishedAt: { not: null }, expiresAt: { lt: now } },
          select: { expiresAt: true },
        },
      },
    });
  }
}
