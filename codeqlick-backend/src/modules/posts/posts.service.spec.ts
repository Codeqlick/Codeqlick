import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityService } from '../activity/activity.service.js';
import type { TagsService } from './tags.service.js';
import type { IndexNowService } from '../indexnow/indexnow.service.js';
import type { PostTranslation } from '../../generated/prisma/client.js';
import type { AdminPostRecord, PostsRepository, PostWithTranslations } from './posts.repository.js';
import { PostsService } from './posts.service.js';
import type { CreatePostInput } from './posts.schemas.js';

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
  extra: Partial<AdminPostRecord> = {},
): AdminPostRecord {
  return {
    id: 'p1',
    slug: 'hello-world',
    status: 'PUBLISHED',
    publishedAt,
    coverImageUrl: null,
    contentUpdatedAt: null,
    authorId: null,
    createdAt: publishedAt,
    updatedAt: publishedAt,
    translations,
    tags: [],
    slugRedirects: [],
    ...extra,
  } as AdminPostRecord;
}

const actor = {
  id: 'a1',
  email: 'admin@codeqlick.com',
  name: 'Admin',
  role: 'ADMIN',
  realm: 'CODEQLICK',
} as const;

describe('PostsService', () => {
  let repository: {
    findPublishedBySlug: ReturnType<typeof vi.fn>;
    listPublished: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findLiveCandidates: ReturnType<typeof vi.fn>;
    findLiveSlugByRedirect: ReturnType<typeof vi.fn>;
  };
  let service: PostsService;

  beforeEach(() => {
    repository = {
      findPublishedBySlug: vi.fn(),
      listPublished: vi.fn(),
      findById: vi.fn(),
      update: vi.fn(),
      findLiveCandidates: vi.fn().mockResolvedValue([]),
      findLiveSlugByRedirect: vi.fn(),
    };
    service = new PostsService(
      repository as unknown as PostsRepository,
      { record: vi.fn().mockResolvedValue(undefined) } as unknown as ActivityService,
      { assertExist: vi.fn().mockResolvedValue(undefined) } as unknown as TagsService,
      { announce: vi.fn() } as unknown as IndexNowService,
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
      readingMinutes: 1,
      contentUpdatedAt: null,
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
          readingMinutes: 1,
          contentUpdatedAt: null,
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

  it('gives the updated date only from 24 hours after publication', async () => {
    const en = [translation('EN', 'Hello')];
    repository.findPublishedBySlug.mockResolvedValueOnce(
      post(en, { contentUpdatedAt: new Date('2026-09-01T20:00:00Z') }),
    );
    expect((await service.getPublishedBySlug('hello-world', 'en')).contentUpdatedAt).toBeNull();

    repository.findPublishedBySlug.mockResolvedValueOnce(
      post(en, { contentUpdatedAt: new Date('2026-09-03T10:00:00Z') }),
    );
    expect((await service.getPublishedBySlug('hello-world', 'en')).contentUpdatedAt).toBe(
      '2026-09-03T10:00:00.000Z',
    );
  });

  describe('contentUpdatedAt on update', () => {
    const live = post([translation('EN', 'Hello'), translation('ES', 'Hola')]);
    const input = (title: string) => ({
      translations: [
        { locale: 'en' as const, title, excerpt: 'Hello excerpt', content: 'Hello content' },
        { locale: 'es' as const, title: 'Hola', excerpt: 'Hola excerpt', content: 'Hola content' },
      ],
    });
    const sentData = () =>
      repository.update.mock.calls[0]?.[1] as { contentUpdatedAt?: Date; translations?: unknown };

    beforeEach(() => {
      repository.findById.mockResolvedValue(live);
      repository.update.mockResolvedValue(live);
    });

    it("is set when a live post's text changes", async () => {
      await service.update(actor, 'p1', input('Hello again'));
      expect(sentData().contentUpdatedAt).toBeInstanceOf(Date);
    });

    it('is set when a translation is removed or the cover image changes', async () => {
      await service.update(actor, 'p1', { translations: input('Hello').translations.slice(0, 1) });
      expect(sentData().contentUpdatedAt).toBeInstanceOf(Date);

      repository.update.mockClear();
      await service.update(actor, 'p1', { coverImageUrl: 'https://example.com/cover.png' });
      expect(sentData().contentUpdatedAt).toBeInstanceOf(Date);
    });

    it('is left alone when the same text is saved or only the slug or tags change', async () => {
      await service.update(actor, 'p1', { ...input('Hello'), slug: 'new-slug', tagIds: [] });
      expect(sentData()).not.toHaveProperty('contentUpdatedAt');
    });

    it('is left alone for drafts, scheduled posts and unpublishing', async () => {
      repository.findById.mockResolvedValue({ ...live, status: 'DRAFT' });
      await service.update(actor, 'p1', { ...input('Hello again'), status: 'PUBLISHED' });
      expect(sentData()).not.toHaveProperty('contentUpdatedAt');

      repository.update.mockClear();
      repository.findById.mockResolvedValue({ ...live, publishedAt: new Date('2099-01-01') });
      await service.update(actor, 'p1', input('Hello again'));
      expect(sentData()).not.toHaveProperty('contentUpdatedAt');

      repository.update.mockClear();
      repository.findById.mockResolvedValue(live);
      await service.update(actor, 'p1', { ...input('Hello again'), status: 'DRAFT' });
      expect(sentData()).not.toHaveProperty('contentUpdatedAt');
    });
  });

  it('throws NotFound when updating a missing post', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(service.update(actor, 'nope', { status: 'DRAFT' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  describe('old slugs', () => {
    it("answers an old slug with the live post's current slug", async () => {
      repository.findLiveSlugByRedirect.mockResolvedValue('new-slug');

      await expect(service.redirect('old-slug')).resolves.toEqual({ slug: 'new-slug' });
      expect(repository.findLiveSlugByRedirect).toHaveBeenCalledWith('old-slug');
    });

    it('throws NotFound for an unknown old slug or a post that is not live', async () => {
      repository.findLiveSlugByRedirect.mockResolvedValue(null);
      await expect(service.redirect('old-slug')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lists the old slugs in the admin answer, as the repository orders them', async () => {
      repository.findById.mockResolvedValue(
        post([translation('EN', 'Hello')], {
          slugRedirects: [{ slug: 'second-name' }, { slug: 'first-name' }],
        }),
      );

      const admin = await service.get('p1');

      expect(admin.oldSlugs).toEqual(['second-name', 'first-name']);
    });

    it('passes a slug change to the repository, which keeps the old one', async () => {
      const existing = post([translation('EN', 'Hello')]);
      repository.findById.mockResolvedValue(existing);
      repository.update.mockResolvedValue({
        ...existing,
        slug: 'hello-again',
        slugRedirects: [{ slug: 'hello-world' }],
      });

      const updated = await service.update(actor, 'p1', { slug: 'hello-again' });

      expect(repository.update).toHaveBeenCalledWith('p1', { slug: 'hello-again' }, actor.id);
      expect(updated.slug).toBe('hello-again');
      expect(updated.oldSlugs).toEqual(['hello-world']);
    });
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

  describe('IndexNow', () => {
    const en = [translation('EN', 'Hello')];
    const live = post(en);
    const draft = post(en, { status: 'DRAFT', publishedAt: null });
    const future = post(en, { publishedAt: new Date(Date.now() + 86_400_000) });
    let announce: ReturnType<typeof vi.fn>;
    let repo: Record<string, ReturnType<typeof vi.fn>>;
    let posts: PostsService;

    beforeEach(() => {
      announce = vi.fn();
      repo = { findById: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() };
      posts = new PostsService(
        repo as unknown as PostsRepository,
        { record: vi.fn().mockResolvedValue(undefined) } as unknown as ActivityService,
        { assertExist: vi.fn().mockResolvedValue(undefined) } as unknown as TagsService,
        { announce } as unknown as IndexNowService,
      );
    });

    const createInput = (status: 'DRAFT' | 'PUBLISHED', date?: string) =>
      ({
        slug: 'hello-world',
        status,
        publishedAt: date,
        translations: [{ locale: 'en', title: 'Hello', excerpt: 'x', content: 'y' }],
        newsletter: false,
        tagIds: [],
      }) as CreatePostInput;

    it('announces a post created live', async () => {
      repo.create.mockResolvedValue(live);
      await posts.create(actor, createInput('PUBLISHED'));
      expect(announce).toHaveBeenCalledWith({ kind: 'post', slugs: ['hello-world'] });
    });

    it('does not announce a draft or a post scheduled for later', async () => {
      repo.create.mockResolvedValue(draft);
      await posts.create(actor, createInput('DRAFT'));
      repo.create.mockResolvedValue(future);
      await posts.create(actor, createInput('PUBLISHED', future.publishedAt?.toISOString()));
      expect(announce).not.toHaveBeenCalled();
    });

    it('announces an edit of a live post', async () => {
      repo.findById.mockResolvedValue(live);
      repo.update.mockResolvedValue(live);
      await posts.update(actor, 'p1', { coverImageUrl: null });
      expect(announce).toHaveBeenCalledWith({ kind: 'post', slugs: ['hello-world'] });
    });

    it('announces a draft being published', async () => {
      repo.findById.mockResolvedValue(draft);
      repo.update.mockResolvedValue(live);
      await posts.update(actor, 'p1', { status: 'PUBLISHED' });
      expect(announce).toHaveBeenCalledWith({ kind: 'post', slugs: ['hello-world'] });
    });

    it('announces a live post made a draft', async () => {
      repo.findById.mockResolvedValue(live);
      repo.update.mockResolvedValue(draft);
      await posts.update(actor, 'p1', { status: 'DRAFT' });
      expect(announce).toHaveBeenCalledWith({ kind: 'post', slugs: ['hello-world'] });
    });

    it('announces the new and the old slug after a slug change', async () => {
      repo.findById.mockResolvedValue(live);
      repo.update.mockResolvedValue({ ...live, slug: 'hello-again' });
      await posts.update(actor, 'p1', { slug: 'hello-again' });
      expect(announce).toHaveBeenCalledWith({
        kind: 'post',
        slugs: ['hello-again', 'hello-world'],
      });
    });

    it('does not announce an edit of a draft', async () => {
      repo.findById.mockResolvedValue(draft);
      repo.update.mockResolvedValue(draft);
      await posts.update(actor, 'p1', { coverImageUrl: null });
      expect(announce).not.toHaveBeenCalled();
    });

    it('announces the deletion of a live post, not of a draft', async () => {
      repo.findById.mockResolvedValue(live);
      await posts.delete(actor, 'p1');
      expect(announce).toHaveBeenCalledWith({ kind: 'post', slugs: ['hello-world'] });

      announce.mockClear();
      repo.findById.mockResolvedValue(draft);
      await posts.delete(actor, 'p1');
      expect(announce).not.toHaveBeenCalled();
    });
  });
});
