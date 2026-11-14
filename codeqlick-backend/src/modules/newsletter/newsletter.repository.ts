import { Injectable } from '@nestjs/common';
import type {
  NewsletterStatus,
  NewsletterSubscriber,
  Post,
  PostTranslation,
  Prisma,
} from '../../generated/prisma/client.js';
import { liveWhere } from '../../common/publishing.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export type NewsletterPost = Post & { translations: PostTranslation[] };

export interface SubscriberCounts {
  active: number;
  pending: number;
  unsubscribed: number;
}

@Injectable()
export class NewsletterRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<NewsletterSubscriber | null> {
    return this.prisma.newsletterSubscriber.findUnique({ where: { email } });
  }

  findByConfirmHash(hash: string): Promise<NewsletterSubscriber | null> {
    return this.prisma.newsletterSubscriber.findUnique({ where: { confirmTokenHash: hash } });
  }

  findByUnsubscribeToken(token: string): Promise<NewsletterSubscriber | null> {
    return this.prisma.newsletterSubscriber.findUnique({ where: { unsubscribeToken: token } });
  }

  findById(id: string): Promise<NewsletterSubscriber | null> {
    return this.prisma.newsletterSubscriber.findUnique({ where: { id } });
  }

  create(data: Prisma.NewsletterSubscriberUncheckedCreateInput): Promise<NewsletterSubscriber> {
    return this.prisma.newsletterSubscriber.create({ data });
  }

  update(
    id: string,
    data: Prisma.NewsletterSubscriberUncheckedUpdateInput,
  ): Promise<NewsletterSubscriber> {
    return this.prisma.newsletterSubscriber.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.newsletterSubscriber.delete({ where: { id } });
  }

  async list(
    filter: { status?: NewsletterStatus; q?: string },
    skip: number,
    take: number,
  ): Promise<{ items: NewsletterSubscriber[]; total: number }> {
    const where: Prisma.NewsletterSubscriberWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.q ? { email: { contains: filter.q, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.newsletterSubscriber.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.newsletterSubscriber.count({ where }),
    ]);
    return { items, total };
  }

  /** The number of subscribers per status (all of them, whatever the list's filters). */
  async counts(): Promise<SubscriberCounts> {
    const rows = await this.prisma.newsletterSubscriber.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const of = (status: NewsletterStatus) =>
      rows.find((row) => row.status === status)?._count._all ?? 0;
    return { active: of('ACTIVE'), pending: of('PENDING'), unsubscribed: of('UNSUBSCRIBED') };
  }

  /** Every `ACTIVE` subscriber, oldest first. */
  listActive(): Promise<NewsletterSubscriber[]> {
    return this.prisma.newsletterSubscriber.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** `PENDING` sign-ups whose confirmation expired before `before`. */
  async deletePendingExpiredBefore(before: Date): Promise<number> {
    const { count } = await this.prisma.newsletterSubscriber.deleteMany({
      where: { status: 'PENDING', confirmExpiresAt: { lt: before } },
    });
    return count;
  }

  /** Sign-ups that left before `before`. */
  async deleteUnsubscribedBefore(before: Date): Promise<number> {
    const { count } = await this.prisma.newsletterSubscriber.deleteMany({
      where: { status: 'UNSUBSCRIBED', unsubscribedAt: { lt: before } },
    });
    return count;
  }

  /** Live posts not yet seen by the sending job, oldest first. */
  findPostsToSend(now: Date, take: number): Promise<NewsletterPost[]> {
    return this.prisma.post.findMany({
      where: { ...liveWhere(now), newsletterSentAt: null },
      include: { translations: true },
      orderBy: [{ publishedAt: 'asc' }, { createdAt: 'asc' }],
      take,
    });
  }

  /** Marks the post as seen; false when another process got there first. */
  async claimPost(id: string, at: Date): Promise<boolean> {
    const { count } = await this.prisma.post.updateMany({
      where: { id, newsletterSentAt: null },
      data: { newsletterSentAt: at },
    });
    return count === 1;
  }
}
