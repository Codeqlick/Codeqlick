import { Injectable, NotFoundException } from '@nestjs/common';
import { toApiLocale, toDbLocale, type ApiLocale } from '../../common/schemas/common.schemas.js';
import { availableLocales, pickTranslation } from '../../common/translations.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { pageToSkipTake, paginate, type Paginated } from '../../common/types/paginated.js';
import { Locale, PublishStatus } from '../../generated/prisma/client.js';
import {
  ActivityService,
  contentLabel,
  publishVerb,
  scheduledDetails,
} from '../activity/activity.service.js';
import { publishedAtOnCreate, publishedAtOnUpdate } from '../../common/publishing.js';
import {
  PostsRepository,
  type PostTranslationData,
  type PostUpdateData,
  type PostWithTranslations,
} from './posts.repository.js';
import type {
  CreatePostInput,
  ListAdminPostsQuery,
  ListPublicPostsQuery,
  PostTranslationInput,
  UpdatePostInput,
} from './posts.schemas.js';
import { TagsService, tagName, type PublicTag } from './tags.service.js';

export interface PostSummary {
  slug: string;
  title: string;
  excerpt: string;
  coverImageUrl: string | null;
  publishedAt: string;
  tags: PublicTag[];
}

export interface PostDetail extends PostSummary {
  content: string;
  locales: ApiLocale[];
}

export interface AdminPost {
  id: string;
  slug: string;
  status: PublishStatus;
  coverImageUrl: string | null;
  translations: PostTranslationInput[];
  tagIds: string[];
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function toTranslationData(t: PostTranslationInput): PostTranslationData {
  return { locale: toDbLocale(t.locale), title: t.title, excerpt: t.excerpt, content: t.content };
}

function publicTags(post: PostWithTranslations, locale: ApiLocale): PublicTag[] {
  return post.tags.map(({ tag }) => ({ slug: tag.slug, name: tagName(tag, locale) }));
}

function toAdminPost(post: PostWithTranslations): AdminPost {
  return {
    id: post.id,
    slug: post.slug,
    status: post.status,
    coverImageUrl: post.coverImageUrl,
    translations: post.translations.map((t) => ({
      locale: toApiLocale(t.locale),
      title: t.title,
      excerpt: t.excerpt,
      content: t.content,
    })),
    tagIds: post.tags.map((item) => item.tag.id),
    publishedAt: post.publishedAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

@Injectable()
export class PostsService {
  constructor(
    private readonly repository: PostsRepository,
    private readonly activity: ActivityService,
    private readonly tags: TagsService,
  ) {}

  // ---- Public -------------------------------------------------------------------------

  async listPublished(query: ListPublicPostsQuery): Promise<Paginated<PostSummary>> {
    const { skip, take } = pageToSkipTake(query.page, query.pageSize);
    // The summary falls back to English, so a search covers that language too.
    const ids = query.q
      ? await this.repository.searchPostIds(query.q, [
          ...new Set([toDbLocale(query.locale), Locale.EN]),
        ])
      : undefined;
    const { items, total } = await this.repository.listPublished(
      { tag: query.tag, ids },
      skip,
      take,
    );
    const summaries = items
      .map((post) => this.toSummary(post, query.locale))
      .filter((summary): summary is PostSummary => summary !== undefined);
    return paginate(summaries, total, query.page, query.pageSize);
  }

  async getPublishedBySlug(slug: string, locale: ApiLocale): Promise<PostDetail> {
    const post = await this.repository.findPublishedBySlug(slug);
    const translation = post ? pickTranslation(post.translations, locale) : undefined;
    if (!post || !translation) throw new NotFoundException('Post not found');
    return {
      slug: post.slug,
      title: translation.title,
      excerpt: translation.excerpt,
      coverImageUrl: post.coverImageUrl,
      publishedAt: (post.publishedAt ?? post.createdAt).toISOString(),
      content: translation.content,
      locales: availableLocales(post.translations),
      tags: publicTags(post, locale),
    };
  }

  /**
   * Up to `limit` live posts to read next: those sharing the most tags with this one, newest
   * first among equals, topped up with the latest posts when there aren't enough.
   */
  async related(slug: string, locale: ApiLocale, limit: number): Promise<PostSummary[]> {
    const post = await this.repository.findPublishedBySlug(slug);
    if (!post) throw new NotFoundException('Post not found');
    const tagIds = new Set(post.tags.map((item) => item.tag.id));

    const sharing =
      tagIds.size > 0 ? await this.repository.findLiveCandidates(post.id, [...tagIds], 50) : [];
    const shared = (candidate: PostWithTranslations) =>
      candidate.tags.filter((item) => tagIds.has(item.tag.id)).length;
    // Stable sort: candidates arrive newest first, so ties stay in that order.
    const picked = sharing.toSorted((a, b) => shared(b) - shared(a)).slice(0, limit);

    if (picked.length < limit) {
      const chosen = new Set(picked.map((candidate) => candidate.id));
      const latest = await this.repository.findLiveCandidates(post.id, undefined, limit * 2);
      picked.push(
        ...latest.filter((candidate) => !chosen.has(candidate.id)).slice(0, limit - picked.length),
      );
    }
    return picked
      .map((candidate) => this.toSummary(candidate, locale))
      .filter((summary): summary is PostSummary => summary !== undefined);
  }

  // ---- Admin --------------------------------------------------------------------------

  async listAll(query: ListAdminPostsQuery): Promise<Paginated<AdminPost>> {
    const { skip, take } = pageToSkipTake(query.page, query.pageSize);
    const { items, total } = await this.repository.listAll(query.status, skip, take);
    return paginate(items.map(toAdminPost), total, query.page, query.pageSize);
  }

  async get(id: string): Promise<AdminPost> {
    return toAdminPost(await this.findOrThrow(id));
  }

  async create(actor: AuthUser, input: CreatePostInput): Promise<AdminPost> {
    await this.tags.assertExist(input.tagIds);
    const authorId = actor.id;
    const post = await this.repository.create({
      slug: input.slug,
      status: input.status,
      publishedAt: publishedAtOnCreate(input.status, input.publishedAt),
      coverImageUrl: input.coverImageUrl ?? null,
      authorId,
      translations: input.translations.map(toTranslationData),
      tagIds: [...new Set(input.tagIds)],
    });
    const created = toAdminPost(post);
    await this.activity.record(actor, {
      action: 'post.created',
      targetId: created.id,
      targetLabel: contentLabel(created),
      details: { status: created.status, ...scheduledDetails(created) },
    });
    return created;
  }

  async update(actor: AuthUser, id: string, input: UpdatePostInput): Promise<AdminPost> {
    const existing = await this.findOrThrow(id);
    const data: PostUpdateData = {};
    if (input.slug !== undefined) data.slug = input.slug;
    if (input.coverImageUrl !== undefined) data.coverImageUrl = input.coverImageUrl;
    if (input.status !== undefined) data.status = input.status;
    const publishedAt = publishedAtOnUpdate(existing, input.status, input.publishedAt);
    if (publishedAt !== undefined) data.publishedAt = publishedAt;
    if (input.translations !== undefined) {
      data.translations = input.translations.map(toTranslationData);
    }
    if (input.tagIds !== undefined) {
      await this.tags.assertExist(input.tagIds);
      data.tagIds = [...new Set(input.tagIds)];
    }
    const updated = toAdminPost(await this.repository.update(id, data));
    await this.activity.record(actor, {
      action: `post.${publishVerb(existing, updated, input)}`,
      targetId: id,
      targetLabel: contentLabel(updated),
    });
    return updated;
  }

  async delete(actor: AuthUser, id: string): Promise<void> {
    const existing = toAdminPost(await this.findOrThrow(id));
    await this.repository.delete(id);
    await this.activity.record(actor, {
      action: 'post.deleted',
      targetId: id,
      targetLabel: contentLabel(existing),
    });
  }

  private async findOrThrow(id: string): Promise<PostWithTranslations> {
    const post = await this.repository.findById(id);
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  private toSummary(post: PostWithTranslations, locale: ApiLocale): PostSummary | undefined {
    const translation = pickTranslation(post.translations, locale);
    if (!translation) return undefined;
    return {
      slug: post.slug,
      title: translation.title,
      excerpt: translation.excerpt,
      coverImageUrl: post.coverImageUrl,
      publishedAt: (post.publishedAt ?? post.createdAt).toISOString(),
      tags: publicTags(post, locale),
    };
  }
}
