import { Injectable } from '@nestjs/common';
import {
  PublishStatus,
  type Locale,
  type Post,
  type PostTranslation,
  type Prisma,
} from '../../generated/prisma/client.js';
import { liveWhere } from '../../common/publishing.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export type PostWithTranslations = Post & { translations: PostTranslation[] };

export interface PostTranslationData {
  locale: Locale;
  title: string;
  excerpt: string;
  content: string;
}

export interface PostCreateData {
  slug: string;
  status: PublishStatus;
  publishedAt: Date | null;
  coverImageUrl: string | null;
  authorId: string | null;
  translations: PostTranslationData[];
}

export interface PostUpdateData {
  slug?: string;
  status?: PublishStatus;
  publishedAt?: Date | null;
  coverImageUrl?: string | null;
  translations?: PostTranslationData[];
}

const withTranslations = { translations: { orderBy: { locale: 'asc' } } } as const;

@Injectable()
export class PostsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listPublished(
    skip: number,
    take: number,
  ): Promise<{ items: PostWithTranslations[]; total: number }> {
    const where: Prisma.PostWhereInput = liveWhere();
    const [items, total] = await this.prisma.$transaction([
      this.prisma.post.findMany({
        where,
        include: withTranslations,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.post.count({ where }),
    ]);
    return { items, total };
  }

  findPublishedBySlug(slug: string): Promise<PostWithTranslations | null> {
    return this.prisma.post.findFirst({
      where: { slug, ...liveWhere() },
      include: withTranslations,
    });
  }

  async listAll(
    status: PublishStatus | undefined,
    skip: number,
    take: number,
  ): Promise<{ items: PostWithTranslations[]; total: number }> {
    const where: Prisma.PostWhereInput = status ? { status } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.post.findMany({
        where,
        include: withTranslations,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.post.count({ where }),
    ]);
    return { items, total };
  }

  findById(id: string): Promise<PostWithTranslations | null> {
    return this.prisma.post.findUnique({ where: { id }, include: withTranslations });
  }

  create(data: PostCreateData): Promise<PostWithTranslations> {
    const { translations, authorId, ...post } = data;
    return this.prisma.post.create({
      data: {
        ...post,
        ...(authorId ? { author: { connect: { id: authorId } } } : {}),
        translations: { create: translations },
      },
      include: withTranslations,
    });
  }

  /** Updates the post; when `translations` is given they replace the existing ones wholesale. */
  update(id: string, data: PostUpdateData): Promise<PostWithTranslations> {
    const { translations, ...post } = data;
    return this.prisma.$transaction(async (tx) => {
      if (translations) {
        await tx.postTranslation.deleteMany({ where: { postId: id } });
        await tx.postTranslation.createMany({
          data: translations.map((t) => ({ ...t, postId: id })),
        });
      }
      return tx.post.update({ where: { id }, data: post, include: withTranslations });
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.post.delete({ where: { id } });
  }
}
