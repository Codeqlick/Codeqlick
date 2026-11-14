import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityService } from '../activity/activity.service.js';
import type { PortfolioTranslation } from '../../generated/prisma/client.js';
import type { AdminPortfolioRecord, PortfolioRepository } from './portfolio.repository.js';
import { PortfolioService } from './portfolio.service.js';

const publishedAt = new Date('2026-09-01T08:00:00Z');

function item(extra: Partial<AdminPortfolioRecord> = {}): AdminPortfolioRecord {
  return {
    id: 'i1',
    slug: 'shop-redesign',
    status: 'PUBLISHED',
    publishedAt,
    coverImageUrl: null,
    clientName: null,
    projectUrl: null,
    technologies: [],
    services: [],
    sortOrder: 0,
    testimonialAuthor: null,
    createdAt: publishedAt,
    updatedAt: publishedAt,
    translations: [
      {
        id: 't-EN',
        portfolioItemId: 'i1',
        locale: 'EN',
        title: 'Shop',
        summary: 'Shop summary',
        content: 'Shop content',
        testimonialQuote: null,
        testimonialRole: null,
        createdAt: publishedAt,
        updatedAt: publishedAt,
      } as PortfolioTranslation,
    ],
    slugRedirects: [],
    ...extra,
  } as AdminPortfolioRecord;
}

const actor = { id: 'a1', email: 'admin@codeqlick.com', name: 'Admin', role: 'ADMIN' } as const;

describe('PortfolioService old slugs', () => {
  let repository: {
    findLiveSlugByRedirect: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let service: PortfolioService;

  beforeEach(() => {
    repository = { findLiveSlugByRedirect: vi.fn(), findById: vi.fn(), update: vi.fn() };
    service = new PortfolioService(
      repository as unknown as PortfolioRepository,
      { record: vi.fn().mockResolvedValue(undefined) } as unknown as ActivityService,
    );
  });

  it("answers an old slug with the live case study's current slug", async () => {
    repository.findLiveSlugByRedirect.mockResolvedValue('shop-redesign');

    await expect(service.redirect('old-shop')).resolves.toEqual({ slug: 'shop-redesign' });
    expect(repository.findLiveSlugByRedirect).toHaveBeenCalledWith('old-shop');
  });

  it('throws NotFound for an unknown old slug or a case study that is not live', async () => {
    repository.findLiveSlugByRedirect.mockResolvedValue(null);
    await expect(service.redirect('old-shop')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists the old slugs in the admin answer, newest first as stored', async () => {
    repository.findById.mockResolvedValue(
      item({ slugRedirects: [{ slug: 'shop-v2' }, { slug: 'shop-v1' }] }),
    );

    expect((await service.get('i1')).oldSlugs).toEqual(['shop-v2', 'shop-v1']);
  });

  it('passes a slug change to the repository and answers with the old slugs', async () => {
    repository.findById.mockResolvedValue(item());
    repository.update.mockResolvedValue(
      item({ slug: 'shop-relaunch', slugRedirects: [{ slug: 'shop-redesign' }] }),
    );

    const updated = await service.update(actor, 'i1', { slug: 'shop-relaunch' });

    expect(repository.update).toHaveBeenCalledWith('i1', { slug: 'shop-relaunch' });
    expect(updated.oldSlugs).toEqual(['shop-redesign']);
  });
});
