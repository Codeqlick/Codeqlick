import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityService } from '../activity/activity.service.js';
import type { TagsService } from './tags.service.js';
import type { PostTranslation } from '../../generated/prisma/client.js';
import type { PostsRepository, PostWithTranslations } from './posts.repository.js';
import { PostsService } from './posts.service.js';

const publishedAt = new Date('2026-09-01T08:00:00Z');

function translation(locale: 'EN' | 'ES', title: string): PostTranslation {
  return {
    id: `t-${locale}`,
    postId: 'p1',
    locale,
    title,
    excerpt: `${title} excerpt`,
    content: `${title} content`,
    createdAt: publishedAt,
    updatedAt: publishedAt,
  } as PostTranslation;
}

function tag(slug: string) {
  return {
    tag: { id: `t-${slug}`, slug, nameEn: slug.toUpperCase(), nameEs: `es-${slug}` },
  } as PostWithTranslations['tags'][number];
}

function post(
  translations: PostTranslation[],
  extra: Partial<PostWithTranslations> = {},
): PostWithTranslations {
  return {
    id: 'p1',
    slug: 'hello-world',
    status: 'PUBLISHED',
    publishedAt,
    coverImageUrl: null,
    authorId: null,
    createdAt: publishedAt,
    updatedAt: publishedAt,
    translations,
    tags: [],
    ...extra,
  } as PostWithTranslations;
}

const actor = { id: 'a1', email: 'admin@codeqlick.com', name: 'Admin', role: 'ADMIN' } as const;

describe('PostsService', () => {
  let repository: {
    findPublishedBySlug: ReturnType<typeof vi.fn>;
    listPublished: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findLiveCandidates: ReturnType<typeof vi.fn>;
  };
  let service: PostsService;

  beforeEach(() => {
    repository = {
      findPublishedBySlug: vi.fn(),
      listPublished: vi.fn(),
      findById: vi.fn(),
      update: vi.fn(),
      findLiveCandidates: vi.fn().mockResolvedValue([]),
    };
    service = new PostsService(
      repository as unknown as PostsRepository,
      { record: vi.fn().mockResolvedValue(undefined) } as unknown as ActivityService,
      { assertExist: vi.fn().mockResolvedValue(undefined) } as unknown as TagsService,
    );
  });

  it('returns the requested locale when it exists', async () => {
    repository.findPublishedBySlug.mockResolvedValue(
      post([translation('EN', 'Hello'), translation('ES', 'Hola')]),
    );

    const detail = await service.getPublishedBySlug('hello-world', 'es');

    expect(detail).toEqual({
      slug: 'hello-world',
      title: 'Hola',
      excerpt: 'Hola excerpt',
      content: 'Hola content',
      coverImageUrl: null,
      publishedAt: publishedAt.toISOString(),
      locales: ['en', 'es'],
      tags: [],
    });
  });

  it('falls back to English when the requested locale is missing', async () => {
    repository.findPublishedBySlug.mockResolvedValue(post([translation('EN', 'Hello')]));

    const detail = await service.getPublishedBySlug('hello-world', 'es');

    expect(detail.title).toBe('Hello');
    expect(detail.locales).toEqual(['en']);
  });

  it('throws NotFound for an unknown or unpublished slug', async () => {
    repository.findPublishedBySlug.mockResolvedValue(null);
    await expect(service.getPublishedBySlug('missing', 'en')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('paginates published summaries with the fallback applied', async () => {
    repository.listPublished.mockResolvedValue({
      items: [post([translation('EN', 'Hello')])],
      total: 21,
    });

    const page = await service.listPublished({ page: 2, pageSize: 20, locale: 'es' });

    expect(repository.listPublished).toHaveBeenCalledWith(
      { tag: undefined, ids: undefined },
      20,
      20,
    );
    expect(page).toEqual({
      items: [
        {
          slug: 'hello-world',
          title: 'Hello',
          excerpt: 'Hello excerpt',
          coverImageUrl: null,
          publishedAt: publishedAt.toISOString(),
          tags: [],
        },
      ],
      page: 2,
      pageSize: 20,
      total: 21,
      totalPages: 2,
    });
  });

  it('sets publishedAt only the first time a post is published', async () => {
    const draft = { ...post([translation('EN', 'Hello')]), status: 'DRAFT', publishedAt: null };
    repository.findById.mockResolvedValue(draft);
    repository.update.mockResolvedValue({ ...draft, status: 'PUBLISHED', publishedAt });

    await service.update(actor, 'p1', { status: 'PUBLISHED' });

    const data = repository.update.mock.calls[0]?.[1] as { publishedAt?: Date };
    expect(data.publishedAt).toBeInstanceOf(Date);

    repository.update.mockClear();
    repository.findById.mockResolvedValue(post([translation('EN', 'Hello')]));
    repository.update.mockResolvedValue(post([translation('EN', 'Hello')]));
    await service.update(actor, 'p1', { status: 'PUBLISHED' });
    const second = repository.update.mock.calls[0]?.[1] as { publishedAt?: Date };
    expect(second.publishedAt).toBeUndefined();
  });

  it('throws NotFound when updating a missing post', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(service.update(actor, 'nope', { status: 'DRAFT' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  describe('related', () => {
    const en = [translation('EN', 'Hello')];
    const current = post(en, { id: 'p1', tags: [tag('nestjs'), tag('prisma')] });
    const one = post(en, { id: 'p2', slug: 'one-shared', tags: [tag('nestjs')] });
    const two = post(en, { id: 'p3', slug: 'two-shared', tags: [tag('nestjs'), tag('prisma')] });
    const latest = post(en, { id: 'p4', slug: 'latest' });

    it('puts the posts sharing the most tags first and names tags in the locale', async () => {
      repository.findPublishedBySlug.mockResolvedValue(current);
      repository.findLiveCandidates.mockResolvedValueOnce([one, two]);

      const related = await service.related('hello-world', 'es', 2);

      expect(related.map((item) => item.slug)).toEqual(['two-shared', 'one-shared']);
      expect(related[0]?.tags).toEqual([
        { slug: 'nestjs', name: 'es-nestjs' },
        { slug: 'prisma', name: 'es-prisma' },
      ]);
    });

    it('tops up with the latest posts, without repeating one', async () => {
      repository.findPublishedBySlug.mockResolvedValue(current);
      repository.findLiveCandidates
        .mockResolvedValueOnce([one])
        .mockResolvedValueOnce([one, latest]);

      const related = await service.related('hello-world', 'en', 3);

      expect(related.map((item) => item.slug)).toEqual(['one-shared', 'latest']);
    });
  });
});
