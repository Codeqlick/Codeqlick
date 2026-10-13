import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

function post(translations: PostTranslation[]): PostWithTranslations {
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
  } as PostWithTranslations;
}

describe('PostsService', () => {
  let repository: {
    findPublishedBySlug: ReturnType<typeof vi.fn>;
    listPublished: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let service: PostsService;

  beforeEach(() => {
    repository = {
      findPublishedBySlug: vi.fn(),
      listPublished: vi.fn(),
      findById: vi.fn(),
      update: vi.fn(),
    };
    service = new PostsService(repository as unknown as PostsRepository);
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

    expect(repository.listPublished).toHaveBeenCalledWith(20, 20);
    expect(page).toEqual({
      items: [
        {
          slug: 'hello-world',
          title: 'Hello',
          excerpt: 'Hello excerpt',
          coverImageUrl: null,
          publishedAt: publishedAt.toISOString(),
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

    await service.update('p1', { status: 'PUBLISHED' });

    const data = repository.update.mock.calls[0]?.[1] as { publishedAt?: Date };
    expect(data.publishedAt).toBeInstanceOf(Date);

    repository.update.mockClear();
    repository.findById.mockResolvedValue(post([translation('EN', 'Hello')]));
    repository.update.mockResolvedValue(post([translation('EN', 'Hello')]));
    await service.update('p1', { status: 'PUBLISHED' });
    const second = repository.update.mock.calls[0]?.[1] as { publishedAt?: Date };
    expect(second.publishedAt).toBeUndefined();
  });

  it('throws NotFound when updating a missing post', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(service.update('nope', { status: 'DRAFT' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
