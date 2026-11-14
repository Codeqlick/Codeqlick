import { Injectable } from '@nestjs/common';
import {
  PublishStatus,
  type Locale,
  type PortfolioItem,
  type PortfolioTranslation,
  type Prisma,
} from '../../generated/prisma/client.js';
import { revisionsToPrune, sameSnapshot } from '../../common/content-revisions.js';
import { liveWhere } from '../../common/publishing.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { portfolioSnapshot } from './portfolio-snapshot.js';

export type PortfolioWithTranslations = PortfolioItem & { translations: PortfolioTranslation[] };

export interface PortfolioTranslationData {
  locale: Locale;
  title: string;
  summary: string;
  content: string;
  testimonialQuote: string | null;
  testimonialRole: string | null;
}

export interface PortfolioCreateData {
  slug: string;
  status: PublishStatus;
  publishedAt: Date | null;
  clientName: string | null;
  testimonialAuthor: string | null;
  projectUrl: string | null;
  coverImageUrl: string | null;
  technologies: string[];
  services: string[];
  sortOrder: number;
  translations: PortfolioTranslationData[];
}

export interface PortfolioUpdateData {
  slug?: string;
  status?: PublishStatus;
  publishedAt?: Date | null;
  clientName?: string | null;
  testimonialAuthor?: string | null;
  projectUrl?: string | null;
  coverImageUrl?: string | null;
  technologies?: string[];
  services?: string[];
  sortOrder?: number;
  translations?: PortfolioTranslationData[];
}

const withTranslations = { translations: { orderBy: { locale: 'asc' } } } as const;

@Injectable()
export class PortfolioRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Live items, optionally only those with a technology, a service, or a testimonial (an author
   * and a quote in `testimonialLocale`).
   */
  async listPublished(
    skip: number,
    take: number,
    filter: { testimonialLocale?: Locale; technology?: string; service?: string } = {},
  ): Promise<{ items: PortfolioWithTranslations[]; total: number }> {
    const where: Prisma.PortfolioItemWhereInput = {
      ...liveWhere(),
      ...(filter.technology ? { technologies: { has: filter.technology } } : {}),
      ...(filter.service ? { services: { has: filter.service } } : {}),
      ...(filter.testimonialLocale
        ? {
            testimonialAuthor: { not: null },
            translations: {
              some: {
                locale: filter.testimonialLocale,
                testimonialQuote: { not: null, notIn: [''] },
              },
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.portfolioItem.findMany({
        where,
        include: withTranslations,
        orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.portfolioItem.count({ where }),
    ]);
    return { items, total };
  }

  /** Technologies and services of the live items, for the list's filters. */
  listLiveFacets(): Promise<{ technologies: string[]; services: string[] }[]> {
    return this.prisma.portfolioItem.findMany({
      where: liveWhere(),
      select: { technologies: true, services: true },
    });
  }

  findPublishedBySlug(slug: string): Promise<PortfolioWithTranslations | null> {
    return this.prisma.portfolioItem.findFirst({
      where: { slug, ...liveWhere() },
      include: withTranslations,
    });
  }

  async listAll(
    status: PublishStatus | undefined,
    skip: number,
    take: number,
  ): Promise<{ items: PortfolioWithTranslations[]; total: number }> {
    const where: Prisma.PortfolioItemWhereInput = status ? { status } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.portfolioItem.findMany({
        where,
        include: withTranslations,
        orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.portfolioItem.count({ where }),
    ]);
    return { items, total };
  }

  findById(id: string): Promise<PortfolioWithTranslations | null> {
    return this.prisma.portfolioItem.findUnique({ where: { id }, include: withTranslations });
  }

  create(data: PortfolioCreateData): Promise<PortfolioWithTranslations> {
    const { translations, ...item } = data;
    return this.prisma.portfolioItem.create({
      data: { ...item, translations: { create: translations } },
      include: withTranslations,
    });
  }

  /**
   * Updates the item; when `translations` is given they replace the existing ones wholesale. When
   * its content changes, the previous content is kept as a revision by `authorId` in the same
   * transaction, and only the latest revisions are kept (decision 52).
   */
  update(
    id: string,
    data: PortfolioUpdateData,
    authorId: string | null,
  ): Promise<PortfolioWithTranslations> {
    const { translations, ...item } = data;
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.portfolioItem.findUniqueOrThrow({
        where: { id },
        include: withTranslations,
      });
      if (translations) {
        await tx.portfolioTranslation.deleteMany({ where: { portfolioItemId: id } });
        await tx.portfolioTranslation.createMany({
          data: translations.map((t) => ({ ...t, portfolioItemId: id })),
        });
      }
      const after = await tx.portfolioItem.update({
        where: { id },
        data: item,
        include: withTranslations,
      });
      const previous = portfolioSnapshot(before);
      if (!sameSnapshot(previous, portfolioSnapshot(after))) {
        await tx.portfolioRevision.create({
          data: {
            portfolioItemId: id,
            snapshot: previous as Prisma.InputJsonValue,
            authorId,
          },
        });
        const kept = await tx.portfolioRevision.findMany({
          where: { portfolioItemId: id },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        const old = revisionsToPrune(kept);
        if (old.length > 0) {
          await tx.portfolioRevision.deleteMany({ where: { id: { in: old } } });
        }
      }
      return after;
    });
  }

  /** The case study's revisions, newest first. */
  revisions(portfolioItemId: string) {
    return this.prisma.portfolioRevision.findMany({
      where: { portfolioItemId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, author: { select: { name: true } } },
    });
  }

  /** One of the case study's revisions with its snapshot; null when it isn't that item's. */
  findRevision(portfolioItemId: string, id: string) {
    return this.prisma.portfolioRevision.findFirst({
      where: { id, portfolioItemId },
      select: {
        id: true,
        createdAt: true,
        snapshot: true,
        author: { select: { name: true } },
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.portfolioItem.delete({ where: { id } });
  }
}
