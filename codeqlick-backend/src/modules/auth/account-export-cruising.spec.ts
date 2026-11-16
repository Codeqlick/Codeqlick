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

  it('includes the profile, spots, reviews, reports, check-ins, messages, favourites, alerts, media, meetups, trips, safety alerts, contacts, timers, winks, visits and notifications', async () => {
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
    const contacts = [
      {
        email: 'friend@example.com',
        displayName: 'Ana',
        status: 'ACCEPTED',
        createdAt: new Date('2026-11-16T09:00:00Z'),
      },
    ];
    const timers = [
      {
        endsAt: new Date('2026-11-16T12:00:00Z'),
        message: 'At the pier',
        warnedAt: null,
        firedAt: null,
        endedAt: new Date('2026-11-16T11:30:00Z'),
        createdAt: new Date('2026-11-16T10:00:00Z'),
        spot: null,
      },
    ];
    const meetups = [{ title: 'Sunset walk', status: 'LIVE', spot: { slug: 'the-pier' } }];
    const joined = [{ anonymous: true, meetup: { title: 'Picnic', spot: { slug: 'the-pier' } } }];
    const trips = [{ countryCode: 'ES', city: 'Madrid', listed: true }];
    const safety = [{ kind: 'THEFT', note: null, spot: { slug: 'the-pier' } }];
    const winks = [{ createdAt: new Date('2026-11-16T09:00:00Z') }];
    const visits = [{ day: new Date('2026-11-16'), seenAt: new Date('2026-11-16T09:00:00Z') }];
    const notifications = [{ kind: 'WINK', data: { count: 1 }, readAt: null }];
    const prisma = fakePrisma({
      cruisingTrustedContact: { findMany: vi.fn().mockResolvedValue(contacts) },
      cruisingTimer: { findMany: vi.fn().mockResolvedValue(timers) },
      cruisingProfile: { findUnique: vi.fn().mockResolvedValue(profile) },
      cruisingSpot: { findMany: vi.fn().mockResolvedValue(spots) },
      cruisingReview: { findMany: vi.fn().mockResolvedValue(reviews) },
      cruisingReport: { findMany: vi.fn().mockResolvedValue(reports) },
      cruisingCheckIn: { findMany: vi.fn().mockResolvedValue(checkIns) },
      cruisingMessage: { findMany: vi.fn().mockResolvedValue(messages) },
      cruisingMedia: { findMany: vi.fn().mockResolvedValue(media) },
      cruisingFavorite: { findMany: vi.fn().mockResolvedValue(favorites) },
      cruisingAlert: { findMany: vi.fn().mockResolvedValue(alerts) },
      cruisingMeetup: { findMany: vi.fn().mockResolvedValue(meetups) },
      cruisingMeetupAttendee: { findMany: vi.fn().mockResolvedValue(joined) },
      cruisingTrip: { findMany: vi.fn().mockResolvedValue(trips) },
      cruisingSafetyAlert: { findMany: vi.fn().mockResolvedValue(safety) },
      cruisingWink: { findMany: vi.fn().mockResolvedValue(winks) },
      cruisingProfileView: { findMany: vi.fn().mockResolvedValue(visits) },
      cruisingNotification: { findMany: vi.fn().mockResolvedValue(notifications) },
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
      // Someone else's address is masked.
      trustedContacts: [{ ...contacts[0], email: 'f***@example.com' }],
      timers,
      meetupsPlanned: meetups,
      meetupsJoined: joined,
      trips,
      safetyAlerts: safety,
      winksSent: winks,
      profilesVisited: visits,
      notifications,
    });
    // The date of birth is never kept, so it cannot be exported: only the year is selected.
    expect(Object.keys(data.cruising?.profile ?? {})).not.toContain('birthDate');
  });
});
