import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { ActivityService } from '../activity/activity.service.js';
import { portfolioSnapshot } from './portfolio-snapshot.js';
import { PortfolioRepository, type PortfolioWithTranslations } from './portfolio.repository.js';
import { PortfolioService } from './portfolio.service.js';

const at = new Date('2026-11-01T09:00:00Z');
const replacedAt = new Date('2026-11-10T12:30:00Z');
const actor = { id: 'a1', email: 'admin@codeqlick.com', name: 'Admin', role: 'ADMIN' } as const;

function item(extra: Partial<PortfolioWithTranslations> = {}): PortfolioWithTranslations {
  return {
    id: 'c1',
    slug: 'shop',
    status: 'PUBLISHED',
    publishedAt: at,
    coverImageUrl: null,
    clientName: 'Acme',
    projectUrl: null,
    technologies: ['Next.js', 'NestJS'],
    services: ['web'],
    sortOrder: 3,
    testimonialAuthor: null,
    createdAt: at,
    updatedAt: at,
    translations: [
      {
        locale: 'EN',
        title: 'Shop',
        summary: 'A shop',
        content: 'Body',
        testimonialQuote: null,
        testimonialRole: null,
      },
    ],
    ...extra,
  } as PortfolioWithTranslations;
}

describe('portfolio snapshots', () => {
  it('hold the content only: no status, date, slug or order', () => {
    const snapshot = portfolioSnapshot(item());
    expect(snapshot).toEqual({
      coverImageUrl: null,
      clientName: 'Acme',
      projectUrl: null,
      technologies: ['Next.js', 'NestJS'],
      services: ['web'],
      testimonialAuthor: null,
      translations: [
        {
          locale: 'en',
          title: 'Shop',
          summary: 'A shop',
          content: 'Body',
          testimonialQuote: null,
          testimonialRole: null,
        },
      ],
    });
  });
});

describe('PortfolioRepository revisions', () => {
  let tx: {
    portfolioItem: {
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    portfolioTranslation: {
      deleteMany: ReturnType<typeof vi.fn>;
      createMany: ReturnType<typeof vi.fn>;
    };
    portfolioRevision: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
  };
  let repository: PortfolioRepository;

  beforeEach(() => {
    tx = {
      portfolioItem: { findUniqueOrThrow: vi.fn().mockResolvedValue(item()), update: vi.fn() },
      portfolioTranslation: { deleteMany: vi.fn(), createMany: vi.fn() },
      portfolioRevision: {
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)),
    };
    repository = new PortfolioRepository(prisma as unknown as PrismaService);
  });

  it('keeps the previous content when it changes, by its author', async () => {
    tx.portfolioItem.update.mockResolvedValue(item({ technologies: ['NestJS', 'Next.js'] }));
    await repository.update('c1', { technologies: ['NestJS', 'Next.js'] }, 'a1');
    expect(tx.portfolioRevision.create).toHaveBeenCalledWith({
      data: { portfolioItemId: 'c1', snapshot: portfolioSnapshot(item()), authorId: 'a1' },
    });
  });

  it('stores nothing when only the order or publication change', async () => {
    tx.portfolioItem.update.mockResolvedValue(item({ sortOrder: 9, status: 'DRAFT' }));
    await repository.update('c1', { sortOrder: 9, status: 'DRAFT' }, 'a1');
    expect(tx.portfolioRevision.create).not.toHaveBeenCalled();
  });
});

describe('PortfolioService revisions', () => {
  let repository: {
    findById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    revisions: ReturnType<typeof vi.fn>;
    findRevision: ReturnType<typeof vi.fn>;
  };
  let activity: { record: ReturnType<typeof vi.fn> };
  let service: PortfolioService;

  beforeEach(() => {
    repository = {
      findById: vi.fn().mockResolvedValue(item()),
      update: vi.fn().mockResolvedValue(item()),
      revisions: vi.fn().mockResolvedValue([]),
      findRevision: vi.fn(),
    };
    activity = { record: vi.fn().mockResolvedValue(undefined) };
    service = new PortfolioService(
      repository as unknown as PortfolioRepository,
      activity as unknown as ActivityService,
    );
  });

  it('restores the content, never the status, date, slug or order, and logs it', async () => {
    const snapshot = {
      ...portfolioSnapshot(item()),
      clientName: null,
      testimonialAuthor: 'Ana',
      translations: [
        {
          locale: 'es',
          title: 'Tienda',
          summary: 'Una tienda',
          content: 'Cuerpo',
          testimonialQuote: 'Genial',
          testimonialRole: null,
        },
      ],
    };
    repository.findRevision.mockResolvedValue({ id: 'r1', createdAt: replacedAt, snapshot });
    await service.restore(actor, 'c1', 'r1');
    expect(repository.update).toHaveBeenCalledWith(
      'c1',
      {
        coverImageUrl: null,
        clientName: null,
        projectUrl: null,
        technologies: ['Next.js', 'NestJS'],
        services: ['web'],
        testimonialAuthor: 'Ana',
        translations: [
          {
            locale: 'ES',
            title: 'Tienda',
            summary: 'Una tienda',
            content: 'Cuerpo',
            testimonialQuote: 'Genial',
            testimonialRole: null,
          },
        ],
      },
      'a1',
    );
    expect(activity.record).toHaveBeenCalledWith(actor, {
      action: 'portfolio.restored',
      targetId: 'c1',
      targetLabel: 'Shop',
      details: { revisionCreatedAt: replacedAt.toISOString() },
    });
  });

  it('404s for a revision of another case study and for an unknown one', async () => {
    repository.findRevision.mockResolvedValue(null);
    await expect(service.revision('c1', 'r9')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.restore(actor, 'c1', 'r9')).rejects.toBeInstanceOf(NotFoundException);
    repository.findById.mockResolvedValue(null);
    await expect(service.revisions('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
