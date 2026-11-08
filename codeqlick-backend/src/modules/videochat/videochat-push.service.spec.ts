import { beforeEach, describe, expect, it, vi } from 'vitest';
import webpush from 'web-push';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { MatchPrefs } from './matchmaker.js';
import {
  madridHour,
  peakHours,
  pickRecipients,
  PUSH_ROUND_MS,
  VideochatPushService,
} from './videochat-push.service.js';
import type { VideochatRepository } from './videochat.repository.js';
import type { VideochatStatsRepository } from './videochat-stats.repository.js';

vi.mock('web-push', () => ({ default: { sendNotification: vi.fn() } }));

function prefs(overrides: Partial<MatchPrefs>): MatchPrefs {
  return {
    gender: null,
    seeking: [],
    country: null,
    language: null,
    sameCountryOnly: false,
    sameLanguageOnly: false,
    ...overrides,
  };
}

const row = (userId: string, endpoint: string, locale = 'es') => ({
  userId,
  endpoint,
  p256dh: 'key',
  auth: 'auth',
  locale,
  user: { videochatProfile: prefs({}) },
});

describe('pickRecipients', () => {
  it('skips blocks, the waiter and filters that do not match both ways', () => {
    const waiter = {
      userId: 'w',
      blocked: new Set(['blocked']),
      prefs: prefs({ gender: 'WOMAN', seeking: ['MAN'] }),
    };
    const picked = pickRecipients(
      waiter,
      [
        { userId: 'w' },
        { userId: 'blocked', prefs: prefs({ gender: 'MAN' }) },
        { userId: 'woman', prefs: prefs({ gender: 'WOMAN' }) },
        { userId: 'man-seeking-men', prefs: prefs({ gender: 'MAN', seeking: ['MAN'] }) },
        { userId: 'man', prefs: prefs({ gender: 'MAN' }) },
        { userId: 'man', prefs: prefs({ gender: 'MAN' }) },
      ],
      10,
    );
    expect(picked).toEqual(['man']);
  });

  it('stops at the maximum', () => {
    const candidates = Array.from({ length: 30 }, (_, i) => ({ userId: `u${i}` }));
    expect(pickRecipients({ userId: 'w', blocked: new Set() }, candidates, 5)).toHaveLength(5);
  });
});

describe('VideochatPushService', () => {
  const vapid = { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:hello@codeqlick.com' };
  let repository: {
    pushCandidates: ReturnType<typeof vi.fn>;
    markPushNotified: ReturnType<typeof vi.fn>;
    deletePushSubscription: ReturnType<typeof vi.fn>;
    peakCandidates: ReturnType<typeof vi.fn>;
    markPeakNotified: ReturnType<typeof vi.fn>;
  };
  let service: VideochatPushService;
  let stats: { callsByHour: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.mocked(webpush.sendNotification).mockReset();
    repository = {
      pushCandidates: vi.fn(),
      markPushNotified: vi.fn(),
      deletePushSubscription: vi.fn(),
      peakCandidates: vi.fn(),
      markPeakNotified: vi.fn(),
    };
    stats = { callsByHour: vi.fn() };
    service = new VideochatPushService(
      repository as unknown as VideochatRepository,
      stats as unknown as VideochatStatsRepository,
      { vapid } as unknown as AppConfigService,
    );
  });

  it('notifies matching people once per round, in their language, and drops gone endpoints', async () => {
    repository.pushCandidates.mockResolvedValue([
      row('a', 'https://push.example/a1'),
      row('a', 'https://push.example/a2', 'en'),
      row('b', 'https://push.example/b'),
    ]);
    vi.mocked(webpush.sendNotification)
      .mockResolvedValueOnce({} as never)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }));
    const now = new Date('2026-11-07T20:00:00Z');

    const sent = await service.someoneWaiting({ userId: 'w', blocked: new Set() }, ['online'], now);

    expect(sent).toBe(2);
    expect(repository.pushCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ excludeUserIds: ['w', 'online'] }),
    );
    expect(repository.markPushNotified).toHaveBeenCalledWith(['a', 'b'], now);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(3);
    const payloads = vi
      .mocked(webpush.sendNotification)
      .mock.calls.map((call) => JSON.parse(String(call[1])) as { body: string; url: string });
    expect(payloads[0]?.body).toContain('Hay alguien esperando');
    expect(payloads[1]?.url).toBe('/en/room');
    expect(repository.deletePushSubscription).toHaveBeenCalledWith('https://push.example/b');

    // A second round within the minute does nothing.
    const again = await service.someoneWaiting(
      { userId: 'w', blocked: new Set() },
      [],
      new Date(now.getTime() + PUSH_ROUND_MS - 1),
    );
    expect(again).toBe(0);
    expect(repository.pushCandidates).toHaveBeenCalledTimes(1);
  });

  it('is off without VAPID keys', async () => {
    const off = new VideochatPushService(
      repository as unknown as VideochatRepository,
      stats as unknown as VideochatStatsRepository,
      {} as unknown as AppConfigService,
    );
    expect(off.publicKey).toBeNull();
    expect(await off.someoneWaiting({ userId: 'w', blocked: new Set() }, [])).toBe(0);
    expect(repository.pushCandidates).not.toHaveBeenCalled();
  });

  it('alerts at peak time: a busy hour and enough people online, once per account', async () => {
    // 20:00 UTC on 7 November is 21:00 in Madrid.
    const now = new Date('2026-11-07T20:00:00Z');
    stats.callsByHour.mockResolvedValue([
      { hour: 21, total: 40 },
      { hour: 22, total: 30 },
      { hour: 23, total: 10 },
      { hour: 10, total: 2 },
    ]);
    repository.peakCandidates.mockResolvedValue([
      row('a', 'https://push.example/a1'),
      row('a', 'https://push.example/a2', 'en'),
    ]);
    vi.mocked(webpush.sendNotification).mockResolvedValue({} as never);

    expect(await service.peakTime(4, [], now)).toBe(0);
    expect(await service.peakTime(12, ['online'], now)).toBe(1);
    expect(repository.peakCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ excludeUserIds: ['online'] }),
    );
    expect(repository.markPeakNotified).toHaveBeenCalledWith(['a'], now);
    const payloads = vi
      .mocked(webpush.sendNotification)
      .mock.calls.map((call) => JSON.parse(String(call[1])) as { body: string });
    expect(payloads[0]?.body).toContain('hora punta');
    expect(payloads[0]?.body).toContain('12');
    expect(payloads[1]?.body).toContain('peak time');

    // 10:00 in Madrid is not a busy hour (and the ranking is cached).
    expect(await service.peakTime(12, [], new Date('2026-11-07T09:00:00Z'))).toBe(0);
    expect(stats.callsByHour).toHaveBeenCalledTimes(1);
  });
});

describe('peakHours', () => {
  it('keeps the three busiest hours with at least three calls', () => {
    expect([
      ...peakHours([
        { hour: 1, total: 2 },
        { hour: 20, total: 9 },
        { hour: 21, total: 9 },
        { hour: 22, total: 5 },
        { hour: 23, total: 4 },
      ]),
    ]).toEqual([20, 21, 22]);
    expect(peakHours([{ hour: 3, total: 2 }]).size).toBe(0);
  });

  it('reads the hour in Madrid', () => {
    expect(madridHour(new Date('2026-07-01T22:30:00Z'))).toBe(0);
    expect(madridHour(new Date('2026-11-07T20:00:00Z'))).toBe(21);
  });
});
