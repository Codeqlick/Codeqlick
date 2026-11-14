import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityService } from '../activity/activity.service.js';
import type { IndexNowService } from '../indexnow/indexnow.service.js';
import type { PortfolioRepository, PortfolioWithTranslations } from './portfolio.repository.js';
import type { CreatePortfolioInput } from './portfolio.schemas.js';
import { PortfolioService } from './portfolio.service.js';

const publishedAt = new Date('2026-09-01T08:00:00Z');
const actor = { id: 'a1', email: 'admin@codeqlick.com', name: 'Admin', role: 'ADMIN' } as const;

function item(extra: Partial<PortfolioWithTranslations> = {}): PortfolioWithTranslations {
  return {
    id: 'w1',
    slug: 'acme-shop',
    status: 'PUBLISHED',
    publishedAt,
    clientName: null,
    testimonialAuthor: null,
    projectUrl: null,
    coverImageUrl: null,
    technologies: [],
    services: [],
    sortOrder: 0,
    createdAt: publishedAt,
    updatedAt: publishedAt,
    translations: [
      {
        id: 't-en',
        portfolioItemId: 'w1',
        locale: 'EN',
        title: 'Acme shop',
        summary: 'A shop',
        content: 'Content',
        testimonialQuote: null,
        testimonialRole: null,
        createdAt: publishedAt,
        updatedAt: publishedAt,
      },
    ],
    ...extra,
  } as PortfolioWithTranslations;
}

const live = item();
const draft = item({ status: 'DRAFT', publishedAt: null });
const future = item({ publishedAt: new Date(Date.now() + 86_400_000) });

function createInput(status: 'DRAFT' | 'PUBLISHED', date?: string): CreatePortfolioInput {
  return {
    slug: 'acme-shop',
    status,
    publishedAt: date,
    technologies: [],
    services: [],
    sortOrder: 0,
    translations: [{ locale: 'en', title: 'Acme shop', summary: 'A shop', content: 'Content' }],
  } as CreatePortfolioInput;
}

describe('PortfolioService and IndexNow', () => {
  let announce: ReturnType<typeof vi.fn>;
  let repository: Record<string, ReturnType<typeof vi.fn>>;
  let service: PortfolioService;

  beforeEach(() => {
    announce = vi.fn();
    repository = { findById: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() };
    service = new PortfolioService(
      repository as unknown as PortfolioRepository,
      { record: vi.fn().mockResolvedValue(undefined) } as unknown as ActivityService,
      { announce } as unknown as IndexNowService,
    );
  });

  it('announces a case study created live', async () => {
    repository.create.mockResolvedValue(live);
    await service.create(actor, createInput('PUBLISHED'));
    expect(announce).toHaveBeenCalledWith({ kind: 'portfolio', slugs: ['acme-shop'] });
  });

  it('does not announce a draft or a case study scheduled for later', async () => {
    repository.create.mockResolvedValue(draft);
    await service.create(actor, createInput('DRAFT'));
    repository.create.mockResolvedValue(future);
    await service.create(actor, createInput('PUBLISHED', future.publishedAt?.toISOString()));
    expect(announce).not.toHaveBeenCalled();
  });

  it('announces an edit of a live case study', async () => {
    repository.findById.mockResolvedValue(live);
    repository.update.mockResolvedValue(live);
    await service.update(actor, 'w1', { sortOrder: 2 });
    expect(announce).toHaveBeenCalledWith({ kind: 'portfolio', slugs: ['acme-shop'] });
  });

  it('announces a draft being published and a live one made a draft', async () => {
    repository.findById.mockResolvedValue(draft);
    repository.update.mockResolvedValue(live);
    await service.update(actor, 'w1', { status: 'PUBLISHED' });
    expect(announce).toHaveBeenCalledTimes(1);

    repository.findById.mockResolvedValue(live);
    repository.update.mockResolvedValue(draft);
    await service.update(actor, 'w1', { status: 'DRAFT' });
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenLastCalledWith({ kind: 'portfolio', slugs: ['acme-shop'] });
  });

  it('announces the old slug too after a slug change', async () => {
    repository.findById.mockResolvedValue(live);
    repository.update.mockResolvedValue(item({ slug: 'acme-store' }));
    await service.update(actor, 'w1', { slug: 'acme-store' });
    expect(announce).toHaveBeenCalledWith({
      kind: 'portfolio',
      slugs: ['acme-store', 'acme-shop'],
    });
  });

  it('does not announce an edit of a draft', async () => {
    repository.findById.mockResolvedValue(draft);
    repository.update.mockResolvedValue(draft);
    await service.update(actor, 'w1', { sortOrder: 3 });
    expect(announce).not.toHaveBeenCalled();
  });

  it('announces the deletion of a live case study, not of a draft', async () => {
    repository.findById.mockResolvedValue(live);
    await service.delete(actor, 'w1');
    expect(announce).toHaveBeenCalledWith({ kind: 'portfolio', slugs: ['acme-shop'] });

    announce.mockClear();
    repository.findById.mockResolvedValue(draft);
    await service.delete(actor, 'w1');
    expect(announce).not.toHaveBeenCalled();
  });
});
