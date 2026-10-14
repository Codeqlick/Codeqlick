import { Injectable, NotFoundException } from '@nestjs/common';
import { toApiLocale, toDbLocale, type ApiLocale } from '../../common/schemas/common.schemas.js';
import { availableLocales, pickTranslation } from '../../common/translations.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { pageToSkipTake, paginate, type Paginated } from '../../common/types/paginated.js';
import { PublishStatus } from '../../generated/prisma/client.js';
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
  constructor(
    private readonly repository: PostsRepository,
    private readonly activity: ActivityService,
  ) {}

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

  async create(actor: AuthUser, input: CreatePostInput): Promise<AdminPost> {
    const authorId = actor.id;
    const post = await this.repository.create({
      slug: input.slug,
      status: input.status,
      publishedAt: publishedAtOnCreate(input.status, input.publishedAt),
      coverImageUrl: input.coverImageUrl ?? null,
      authorId,
      translations: input.translations.map(toTranslationData),
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
    };
  }
}
