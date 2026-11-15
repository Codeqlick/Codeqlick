import { Injectable } from '@nestjs/common';
import { PublishStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface WentLive {
  posts: string[];
  portfolio: string[];
}

@Injectable()
export class IndexNowRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Slugs of the posts and case studies published with a date in (since, until]. */
  async wentLive(since: Date, until: Date): Promise<WentLive> {
    const where = { status: PublishStatus.PUBLISHED, publishedAt: { gt: since, lte: until } };
    const [posts, portfolio] = await Promise.all([
      this.prisma.post.findMany({ where, select: { slug: true } }),
      this.prisma.portfolioItem.findMany({ where, select: { slug: true } }),
    ]);
    return {
      posts: posts.map((row) => row.slug),
      portfolio: portfolio.map((row) => row.slug),
    };
  }
}
