import { Injectable } from '@nestjs/common';
import {
  PublishStatus,
  type Locale,
  type Post,
  type PostTranslation,
  type Prisma,
  type Tag,
} from '../../generated/prisma/client.js';
import { liveWhere } from '../../common/publishing.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export type PostWithTranslations = Post & {
  translations: PostTranslation[];
  tags: { tag: Tag }[];
};

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
  tagIds: string[];
}

export interface PostUpdateData {
  slug?: string;
  status?: PublishStatus;
  publishedAt?: Date | null;
  coverImageUrl?: string | null;
  translations?: PostTranslationData[];
  tagIds?: string[];
}

const withTranslations = {
  translations: { orderBy: { locale: 'asc' } },
  tags: { include: { tag: true }, orderBy: { tag: { slug: 'asc' } } },
} as const;

@Injectable()
export class PostsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listPublished(
    tag: string | undefined,
    skip: number,
    take: number,
  ): Promise<{ items: PostWithTranslations[]; total: number }> {
    const where: Prisma.PostWhereInput = {
      ...liveWhere(),
      ...(tag ? { tags: { some: { tag: { slug: tag } } } } : {}),
    };
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

  /** Live posts other than `excludeId` sharing at least one of `tagIds`, or the latest ones. */
  findLiveCandidates(
    excludeId: string,
    tagIds: string[] | undefined,
    take: number,
  ): Promise<PostWithTranslations[]> {
    return this.prisma.post.findMany({
      where: {
        ...liveWhere(),
        id: { not: excludeId },
        ...(tagIds ? { tags: { some: { tagId: { in: tagIds } } } } : {}),
      },
      include: withTranslations,
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take,
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
    const { translations, authorId, tagIds, ...post } = data;
    return this.prisma.post.create({
      data: {
        ...post,
        ...(authorId ? { author: { connect: { id: authorId } } } : {}),
        translations: { create: translations },
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
      },
      include: withTranslations,
    });
  }

  /** Updates the post; when `translations` is given they replace the existing ones wholesale. */
  update(id: string, data: PostUpdateData): Promise<PostWithTranslations> {
    const { translations, tagIds, ...post } = data;
    return this.prisma.$transaction(async (tx) => {
      if (tagIds) {
        await tx.postTag.deleteMany({ where: { postId: id } });
        await tx.postTag.createMany({ data: tagIds.map((tagId) => ({ postId: id, tagId })) });
      }
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
