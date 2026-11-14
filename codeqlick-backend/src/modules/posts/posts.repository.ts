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
import { slugToRedirect } from '../../common/slug-redirects.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export type PostWithTranslations = Post & {
  translations: PostTranslation[];
  tags: { tag: Tag }[];
};

/** A post as the admin panel sees it: with its old slugs (redirects), newest first. */
export type AdminPostRecord = PostWithTranslations & { slugRedirects: { slug: string }[] };

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
  newsletter: boolean;
  authorId: string | null;
  translations: PostTranslationData[];
  tagIds: string[];
}

export interface PostUpdateData {
  slug?: string;
  status?: PublishStatus;
  publishedAt?: Date | null;
  coverImageUrl?: string | null;
  newsletter?: boolean;
  translations?: PostTranslationData[];
  tagIds?: string[];
}

const withTranslations = {
  translations: { orderBy: { locale: 'asc' } },
  tags: { include: { tag: true }, orderBy: { tag: { slug: 'asc' } } },
} as const;

const withRedirects = {
  ...withTranslations,
  slugRedirects: { select: { slug: true }, orderBy: { createdAt: 'desc' } },
} as const;

@Injectable()
export class PostsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listPublished(
    filter: { tag?: string; ids?: string[] },
    skip: number,
    take: number,
  ): Promise<{ items: PostWithTranslations[]; total: number }> {
    const where: Prisma.PostWhereInput = {
      ...liveWhere(),
      ...(filter.tag ? { tags: { some: { tag: { slug: filter.tag } } } } : {}),
      ...(filter.ids ? { id: { in: filter.ids } } : {}),
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

  /**
   * Ids of posts whose title, excerpt or content contains `text` in one of `locales`, ignoring
   * case and accents (Postgres `unaccent`). Publication is filtered by the caller.
   */
  async searchPostIds(text: string, locales: Locale[]): Promise<string[]> {
    // `%` and `_` typed by the reader are literal characters, not wildcards.
    const pattern = `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const rows = await this.prisma.$queryRaw<{ post_id: string }[]>`
      SELECT DISTINCT post_id FROM post_translations
      WHERE locale::text = ANY(${locales})
        AND (unaccent(title) ILIKE unaccent(${pattern})
          OR unaccent(excerpt) ILIKE unaccent(${pattern})
          OR unaccent(content) ILIKE unaccent(${pattern}))`;
    return rows.map((row) => row.post_id);
  }

  findPublishedBySlug(slug: string): Promise<PostWithTranslations | null> {
    return this.prisma.post.findFirst({
      where: { slug, ...liveWhere() },
      include: withTranslations,
    });
  }

  /** The current slug of the live post an old slug redirects to (decision 51), if any. */
  async findLiveSlugByRedirect(slug: string): Promise<string | null> {
    const post = await this.prisma.post.findFirst({
      where: { ...liveWhere(), slugRedirects: { some: { slug } } },
      select: { slug: true },
    });
    return post?.slug ?? null;
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
  ): Promise<{ items: AdminPostRecord[]; total: number }> {
    const where: Prisma.PostWhereInput = status ? { status } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.post.findMany({
        where,
        include: withRedirects,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.post.count({ where }),
    ]);
    return { items, total };
  }

  findById(id: string): Promise<AdminPostRecord | null> {
    return this.prisma.post.findUnique({ where: { id }, include: withRedirects });
  }

  /** Creates the post; a redirect with its slug is deleted, since a slug in use wins. */
  create(data: PostCreateData): Promise<AdminPostRecord> {
    const { translations, authorId, tagIds, ...post } = data;
    return this.prisma.$transaction(async (tx) => {
      await tx.postSlugRedirect.deleteMany({ where: { slug: post.slug } });
      return tx.post.create({
        data: {
          ...post,
          ...(authorId ? { author: { connect: { id: authorId } } } : {}),
          translations: { create: translations },
          tags: { create: tagIds.map((tagId) => ({ tagId })) },
        },
        include: withRedirects,
      });
    });
  }

  /**
   * Updates the post; when `translations` is given they replace the existing ones wholesale.
   * With a slug, in the same transaction (decision 51): a redirect with the new slug is deleted
   * (a slug in use wins, and renaming back drops it), and the old slug of a post with a
   * publication date is kept as a redirect to the post.
   */
  update(id: string, data: PostUpdateData): Promise<AdminPostRecord> {
    const { translations, tagIds, ...post } = data;
    return this.prisma.$transaction(async (tx) => {
      if (post.slug !== undefined) {
        const before = await tx.post.findUniqueOrThrow({
          where: { id },
          select: { slug: true, publishedAt: true },
        });
        await tx.postSlugRedirect.deleteMany({ where: { slug: post.slug } });
        const oldSlug = slugToRedirect(before, post.slug);
        if (oldSlug) {
          await tx.postSlugRedirect.upsert({
            where: { slug: oldSlug },
            create: { slug: oldSlug, postId: id },
            update: { postId: id, createdAt: new Date() },
          });
        }
      }
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
      return tx.post.update({ where: { id }, data: post, include: withRedirects });
    });
  }

  /** Deletes the post and its checked links (no foreign key: architecture 4.6, Broken links). */
  async delete(id: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.linkCheck.deleteMany({ where: { sourceType: 'POST', sourceId: id } }),
      this.prisma.post.delete({ where: { id } }),
    ]);
  }
}
