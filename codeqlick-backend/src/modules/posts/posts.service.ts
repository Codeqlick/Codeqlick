import { Injectable, NotFoundException } from '@nestjs/common';
import { toApiLocale, toDbLocale, type ApiLocale } from '../../common/schemas/common.schemas.js';
import { availableLocales, pickTranslation } from '../../common/translations.js';
import { pageToSkipTake, paginate, type Paginated } from '../../common/types/paginated.js';
import { PublishStatus } from '../../generated/prisma/client.js';
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

export interface PostSummary {
  slug: string;
  title: string;
  excerpt: string;
  coverImageUrl: string | null;
  publishedAt: string;
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
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function toTranslationData(t: PostTranslationInput): PostTranslationData {
  return { locale: toDbLocale(t.locale), title: t.title, excerpt: t.excerpt, content: t.content };
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
    publishedAt: post.publishedAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

@Injectable()
export class PostsService {
  constructor(private readonly repository: PostsRepository) {}

  // ---- Public -------------------------------------------------------------------------

  async listPublished(query: ListPublicPostsQuery): Promise<Paginated<PostSummary>> {
    const { skip, take } = pageToSkipTake(query.page, query.pageSize);
    const { items, total } = await this.repository.listPublished(skip, take);
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
    };
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

  async create(input: CreatePostInput, authorId: string | null): Promise<AdminPost> {
    const post = await this.repository.create({
      slug: input.slug,
      status: input.status,
      publishedAt: input.status === PublishStatus.PUBLISHED ? new Date() : null,
      coverImageUrl: input.coverImageUrl ?? null,
      authorId,
      translations: input.translations.map(toTranslationData),
    });
    return toAdminPost(post);
  }

  async update(id: string, input: UpdatePostInput): Promise<AdminPost> {
    const existing = await this.findOrThrow(id);
    const data: PostUpdateData = {};
    if (input.slug !== undefined) data.slug = input.slug;
    if (input.coverImageUrl !== undefined) data.coverImageUrl = input.coverImageUrl;
    if (input.status !== undefined) {
      data.status = input.status;
      // publishedAt is set the first time a post is published and kept afterwards.
      if (input.status === PublishStatus.PUBLISHED && !existing.publishedAt) {
        data.publishedAt = new Date();
      }
    }
    if (input.translations !== undefined) {
      data.translations = input.translations.map(toTranslationData);
    }
    return toAdminPost(await this.repository.update(id, data));
  }

  async delete(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.repository.delete(id);
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
    };
  }
}
