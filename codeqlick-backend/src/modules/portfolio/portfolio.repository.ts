import { Injectable } from '@nestjs/common';
import {
  PublishStatus,
  type Locale,
  type PortfolioItem,
  type PortfolioTranslation,
  type Prisma,
} from '../../generated/prisma/client.js';
import { liveWhere } from '../../common/publishing.js';
import { PrismaService } from '../../prisma/prisma.service.js';

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
  sortOrder?: number;
  translations?: PortfolioTranslationData[];
}

const withTranslations = { translations: { orderBy: { locale: 'asc' } } } as const;

@Injectable()
export class PortfolioRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** With `testimonialLocale`, only items with a testimonial (author, and a quote in it). */
  async listPublished(
    skip: number,
    take: number,
    testimonialLocale?: Locale,
  ): Promise<{ items: PortfolioWithTranslations[]; total: number }> {
    const where: Prisma.PortfolioItemWhereInput = testimonialLocale
      ? {
          ...liveWhere(),
          testimonialAuthor: { not: null },
          translations: {
            some: { locale: testimonialLocale, testimonialQuote: { not: null, notIn: [''] } },
          },
        }
      : liveWhere();
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

  /** Updates the item; when `translations` is given they replace the existing ones wholesale. */
  update(id: string, data: PortfolioUpdateData): Promise<PortfolioWithTranslations> {
    const { translations, ...item } = data;
    return this.prisma.$transaction(async (tx) => {
      if (translations) {
        await tx.portfolioTranslation.deleteMany({ where: { portfolioItemId: id } });
        await tx.portfolioTranslation.createMany({
          data: translations.map((t) => ({ ...t, portfolioItemId: id })),
        });
      }
      return tx.portfolioItem.update({ where: { id }, data: item, include: withTranslations });
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.portfolioItem.delete({ where: { id } });
  }
}
