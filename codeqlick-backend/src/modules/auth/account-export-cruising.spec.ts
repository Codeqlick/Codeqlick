import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { AccountRepository } from './account.repository.js';

const USER = '11111111-1111-4111-8111-111111111111';

/** A database where every model answers with nothing, apart from what a test overrides. */
function fakePrisma(overrides: Record<string, Record<string, unknown>> = {}) {
  const models = new Map<string, Record<string, unknown>>();
  return new Proxy(
    {},
    {
      get(_target, model: string) {
        if (!models.has(model)) {
          models.set(
            model,
            new Proxy(overrides[model] ?? {}, {
              get(own, method: string) {
                if (method in own) return own[method as keyof typeof own];
                if (method === 'findUniqueOrThrow') return vi.fn().mockResolvedValue({ id: USER });
                if (method === 'findUnique') return vi.fn().mockResolvedValue(null);
                return vi.fn().mockResolvedValue([]);
              },
            }),
          );
        }
        return models.get(model);
      },
    },
  ) as unknown as PrismaService;
}

describe('the account export (Cruising)', () => {
  it('has no Cruising section for someone who never entered', async () => {
    const data = await new AccountRepository(fakePrisma()).export(USER, null);
    expect(data.cruising).toBeNull();
  });

  it('includes the profile, spots, reviews, reports, check-ins, messages, favourites, alerts and media', async () => {
    const profile = {
      birthYear: 1990,
      termsVersion: 'v1',
      emailAlerts: true,
      nickname: 'pier_fan',
      bio: 'Hi',
      showAge: true,
    };
    const spots = [{ slug: 'the-pier', name: 'The pier', status: 'LIVE' }];
    const reviews = [{ rating: 4, text: 'Quiet', spot: { slug: 'the-pier' } }];
    const reports = [{ targetType: 'SPOT', reason: 'DANGER' }];
    const checkIns = [{ anonymous: true, spot: { slug: 'the-pier' } }];
    const messages = [{ text: 'Hello', createdAt: new Date('2026-11-15T12:00:00Z') }];
    const media = [{ ref: 'K7QM2XPA', kind: 'PHOTO', status: 'LIVE' }];
    const favorites = [{ createdAt: new Date('2026-11-16T10:00:00Z'), spot: { slug: 'the-pier' } }];
    const alerts = [
      { channel: 'PUSH', createdAt: new Date('2026-11-16T11:00:00Z'), spot: { slug: 'the-pier' } },
    ];
    const prisma = fakePrisma({
      cruisingProfile: { findUnique: vi.fn().mockResolvedValue(profile) },
      cruisingSpot: { findMany: vi.fn().mockResolvedValue(spots) },
      cruisingReview: { findMany: vi.fn().mockResolvedValue(reviews) },
      cruisingReport: { findMany: vi.fn().mockResolvedValue(reports) },
      cruisingCheckIn: { findMany: vi.fn().mockResolvedValue(checkIns) },
      cruisingMessage: { findMany: vi.fn().mockResolvedValue(messages) },
      cruisingMedia: { findMany: vi.fn().mockResolvedValue(media) },
      cruisingFavorite: { findMany: vi.fn().mockResolvedValue(favorites) },
      cruisingAlert: { findMany: vi.fn().mockResolvedValue(alerts) },
    });
    const data = await new AccountRepository(prisma).export(USER, null);
    expect(data.cruising).toEqual({
      profile,
      spotsProposed: spots,
      reviews,
      reportsMade: reports,
      checkIns,
      messagesSent: messages,
      media,
      favorites,
      alerts,
    });
    // The date of birth is never kept, so it cannot be exported: only the year is selected.
    expect(Object.keys(data.cruising?.profile ?? {})).not.toContain('birthDate');
  });
});
