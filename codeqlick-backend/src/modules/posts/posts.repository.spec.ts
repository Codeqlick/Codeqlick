import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { postSnapshot } from './post-snapshot.js';
import { PostsRepository, type PostWithTranslations } from './posts.repository.js';

const at = new Date('2026-11-01T09:00:00Z');

function row(extra: Partial<PostWithTranslations> = {}): PostWithTranslations {
  return {
    id: 'p1',
    slug: 'hello',
    status: 'DRAFT',
    publishedAt: null,
    coverImageUrl: null,
    authorId: null,
    createdAt: at,
    updatedAt: at,
    translations: [
      { locale: 'EN', title: 'Hello', excerpt: 'Hi', content: 'Body' },
      { locale: 'ES', title: 'Hola', excerpt: 'Hola', content: 'Cuerpo' },
    ],
    tags: [{ tag: { id: 't1' } }, { tag: { id: 't2' } }],
    ...extra,
  } as PostWithTranslations;
}

describe('PostsRepository revisions', () => {
  let tx: {
    post: { findUniqueOrThrow: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    postTag: { deleteMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> };
    postTranslation: {
      deleteMany: ReturnType<typeof vi.fn>;
      createMany: ReturnType<typeof vi.fn>;
    };
    postRevision: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
  };
  let repository: PostsRepository;

  beforeEach(() => {
    tx = {
      post: { findUniqueOrThrow: vi.fn().mockResolvedValue(row()), update: vi.fn() },
      postTag: { deleteMany: vi.fn(), createMany: vi.fn() },
      postTranslation: { deleteMany: vi.fn(), createMany: vi.fn() },
      postRevision: {
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)),
    };
    repository = new PostsRepository(prisma as unknown as PrismaService);
  });

  it('keeps the previous content as a revision when the content changes', async () => {
    tx.post.update.mockResolvedValue(row({ coverImageUrl: 'https://x.test/new.png' }));
    await repository.update('p1', { coverImageUrl: 'https://x.test/new.png' }, 'a1');
    expect(tx.postRevision.create).toHaveBeenCalledWith({
      data: { postId: 'p1', snapshot: postSnapshot(row()), authorId: 'a1' },
    });
    expect(tx.postRevision.deleteMany).not.toHaveBeenCalled();
  });

  it('stores nothing when only the status, date or slug change', async () => {
    tx.post.update.mockResolvedValue(row({ status: 'PUBLISHED', publishedAt: at, slug: 'new' }));
    await repository.update('p1', { status: 'PUBLISHED', publishedAt: at, slug: 'new' }, 'a1');
    expect(tx.postRevision.create).not.toHaveBeenCalled();
  });

  it('stores nothing when tags and translations come back in another order', async () => {
    const before = row();
    tx.post.update.mockResolvedValue(
      row({
        translations: before.translations.toReversed(),
        tags: before.tags.toReversed(),
      }),
    );
    await repository.update('p1', { tagIds: ['t2', 't1'] }, 'a1');
    expect(tx.postRevision.create).not.toHaveBeenCalled();
  });

  it('deletes the revisions beyond the newest 20', async () => {
    tx.post.update.mockResolvedValue(row({ tags: [] }));
    tx.postRevision.findMany.mockResolvedValue(
      Array.from({ length: 21 }, (_, i) => ({ id: `r${i}` })),
    );
    await repository.update('p1', { tagIds: [] }, null);
    expect(tx.postRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ authorId: null }) }),
    );
    expect(tx.postRevision.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['r20'] } } });
  });
});
