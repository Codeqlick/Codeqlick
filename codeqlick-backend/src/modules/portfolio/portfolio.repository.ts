import { Injectable } from '@nestjs/common';
import {
  PublishStatus,
  type Locale,
  type PortfolioItem,
  type PortfolioTranslation,
  type Prisma,
} from '../../generated/prisma/client.js';
import { liveWhere } from '../../common/publishing.js';
import { slugToRedirect } from '../../common/slug-redirects.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export type PortfolioWithTranslations = PortfolioItem & { translations: PortfolioTranslation[] };

/** A case study as the admin panel sees it: with its old slugs (redirects), newest first. */
export type AdminPortfolioRecord = PortfolioWithTranslations & {
  slugRedirects: { slug: string }[];
};

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

const withRedirects = {
  ...withTranslations,
  slugRedirects: { select: { slug: true }, orderBy: { createdAt: 'desc' } },
} as const;

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

  /** The current slug of the live case study an old slug redirects to (decision 51), if any. */
  async findLiveSlugByRedirect(slug: string): Promise<string | null> {
    const item = await this.prisma.portfolioItem.findFirst({
      where: { ...liveWhere(), slugRedirects: { some: { slug } } },
      select: { slug: true },
    });
    return item?.slug ?? null;
  }

  async listAll(
    status: PublishStatus | undefined,
    skip: number,
    take: number,
  ): Promise<{ items: AdminPortfolioRecord[]; total: number }> {
    const where: Prisma.PortfolioItemWhereInput = status ? { status } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.portfolioItem.findMany({
        where,
        include: withRedirects,
        orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.portfolioItem.count({ where }),
    ]);
    return { items, total };
  }

  findById(id: string): Promise<AdminPortfolioRecord | null> {
    return this.prisma.portfolioItem.findUnique({ where: { id }, include: withRedirects });
  }

  /** Creates the item; a redirect with its slug is deleted, since a slug in use wins. */
  create(data: PortfolioCreateData): Promise<AdminPortfolioRecord> {
    const { translations, ...item } = data;
    return this.prisma.$transaction(async (tx) => {
      await tx.portfolioSlugRedirect.deleteMany({ where: { slug: item.slug } });
      return tx.portfolioItem.create({
        data: { ...item, translations: { create: translations } },
        include: withRedirects,
      });
    });
  }

  /**
   * Updates the item; when `translations` is given they replace the existing ones wholesale.
   * With a slug, in the same transaction (decision 51): a redirect with the new slug is deleted
   * (a slug in use wins, and renaming back drops it), and the old slug of an item with a
   * publication date is kept as a redirect to the item.
   */
  update(id: string, data: PortfolioUpdateData): Promise<AdminPortfolioRecord> {
    const { translations, ...item } = data;
    return this.prisma.$transaction(async (tx) => {
      if (item.slug !== undefined) {
        const before = await tx.portfolioItem.findUniqueOrThrow({
          where: { id },
          select: { slug: true, publishedAt: true },
        });
        await tx.portfolioSlugRedirect.deleteMany({ where: { slug: item.slug } });
        const oldSlug = slugToRedirect(before, item.slug);
        if (oldSlug) {
          await tx.portfolioSlugRedirect.upsert({
            where: { slug: oldSlug },
            create: { slug: oldSlug, portfolioItemId: id },
            update: { portfolioItemId: id, createdAt: new Date() },
          });
        }
      }
      if (translations) {
        await tx.portfolioTranslation.deleteMany({ where: { portfolioItemId: id } });
        await tx.portfolioTranslation.createMany({
          data: translations.map((t) => ({ ...t, portfolioItemId: id })),
        });
      }
      return tx.portfolioItem.update({ where: { id }, data: item, include: withRedirects });
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.portfolioItem.delete({ where: { id } });
  }
}
