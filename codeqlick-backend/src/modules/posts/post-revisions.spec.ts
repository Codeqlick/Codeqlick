import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityService } from '../activity/activity.service.js';
import { postSnapshot } from './post-snapshot.js';
import type { PostsRepository, PostWithTranslations } from './posts.repository.js';
import { PostsService } from './posts.service.js';
import type { TagsService } from './tags.service.js';

const at = new Date('2026-11-01T09:00:00Z');
const replacedAt = new Date('2026-11-10T12:30:00Z');
const actor = { id: 'a1', email: 'admin@codeqlick.com', name: 'Admin', role: 'ADMIN' } as const;

function post(extra: Partial<PostWithTranslations> = {}): PostWithTranslations {
  return {
    id: 'p1',
    slug: 'hello',
    status: 'PUBLISHED',
    publishedAt: at,
    coverImageUrl: null,
    authorId: null,
    createdAt: at,
    updatedAt: at,
    translations: [{ locale: 'ES', title: 'Hola', excerpt: 'Hola', content: 'Cuerpo' }],
    tags: [{ tag: { id: 't1' } }],
    ...extra,
  } as PostWithTranslations;
}

const snapshot = {
  coverImageUrl: 'https://x.test/old.png',
  tagIds: ['t1', 'gone'],
  translations: [{ locale: 'es', title: 'Antes', excerpt: 'Antes', content: 'Viejo' }],
};

describe('post snapshots', () => {
  it('hold the content only: no status, date or slug, locales as the API writes them', () => {
    expect(postSnapshot(post())).toEqual({
      coverImageUrl: null,
      tagIds: ['t1'],
      translations: [{ locale: 'es', title: 'Hola', excerpt: 'Hola', content: 'Cuerpo' }],
    });
  });
});

describe('PostsService revisions', () => {
  let repository: {
    findById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    revisions: ReturnType<typeof vi.fn>;
    findRevision: ReturnType<typeof vi.fn>;
  };
  let tags: { assertExist: ReturnType<typeof vi.fn>; existing: ReturnType<typeof vi.fn> };
  let activity: { record: ReturnType<typeof vi.fn> };
  let service: PostsService;

  beforeEach(() => {
    repository = {
      findById: vi.fn().mockResolvedValue(post()),
      update: vi.fn().mockResolvedValue(post()),
      revisions: vi.fn(),
      findRevision: vi.fn(),
    };
    tags = {
      assertExist: vi.fn().mockResolvedValue(undefined),
      existing: vi.fn().mockResolvedValue(['t1']),
    };
    activity = { record: vi.fn().mockResolvedValue(undefined) };
    service = new PostsService(
      repository as unknown as PostsRepository,
      activity as unknown as ActivityService,
      tags as unknown as TagsService,
    );
  });

  it('passes the editor as the author of the revision an update may store', async () => {
    await service.update(actor, 'p1', { coverImageUrl: null });
    expect(repository.update).toHaveBeenCalledWith('p1', { coverImageUrl: null }, 'a1');
  });

  it('lists revisions with their author, and 404s for an unknown post', async () => {
    repository.revisions.mockResolvedValue([
      { id: 'r1', createdAt: replacedAt, author: { name: 'Ana' } },
      { id: 'r2', createdAt: at, author: null },
    ]);
    await expect(service.revisions('p1')).resolves.toEqual([
      { id: 'r1', createdAt: replacedAt.toISOString(), author: { name: 'Ana' } },
      { id: 'r2', createdAt: at.toISOString(), author: null },
    ]);
    repository.findById.mockResolvedValue(null);
    await expect(service.revisions('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns a revision with its snapshot, and 404s when it is not that post’s', async () => {
    repository.findRevision.mockResolvedValue({
      id: 'r1',
      createdAt: replacedAt,
      author: null,
      snapshot,
    });
    await expect(service.revision('p1', 'r1')).resolves.toEqual({
      id: 'r1',
      createdAt: replacedAt.toISOString(),
      author: null,
      snapshot,
    });
    expect(repository.findRevision).toHaveBeenCalledWith('p1', 'r1');
    repository.findRevision.mockResolvedValue(null);
    await expect(service.revision('p1', 'r9')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('restores the content only, leaving out deleted tags, and logs it', async () => {
    repository.findRevision.mockResolvedValue({ id: 'r1', createdAt: replacedAt, snapshot });
    await service.restore(actor, 'p1', 'r1');
    expect(tags.existing).toHaveBeenCalledWith(['t1', 'gone']);
    expect(repository.update).toHaveBeenCalledWith(
      'p1',
      {
        coverImageUrl: 'https://x.test/old.png',
        tagIds: ['t1'],
        translations: [{ locale: 'ES', title: 'Antes', excerpt: 'Antes', content: 'Viejo' }],
      },
      'a1',
    );
    expect(activity.record).toHaveBeenCalledWith(actor, {
      action: 'post.restored',
      targetId: 'p1',
      targetLabel: 'Hola',
      details: { revisionCreatedAt: replacedAt.toISOString() },
    });
  });

  it('refuses to restore a revision that is not the post’s or no longer valid', async () => {
    repository.findRevision.mockResolvedValue(null);
    await expect(service.restore(actor, 'p1', 'r9')).rejects.toBeInstanceOf(NotFoundException);
    repository.findRevision.mockResolvedValue({ id: 'r1', createdAt: at, snapshot: { x: 1 } });
    await expect(service.restore(actor, 'p1', 'r1')).rejects.toBeInstanceOf(ConflictException);
    expect(repository.update).not.toHaveBeenCalled();
  });
});
