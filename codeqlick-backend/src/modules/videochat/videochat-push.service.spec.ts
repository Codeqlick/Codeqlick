import { beforeEach, describe, expect, it, vi } from 'vitest';
import webpush from 'web-push';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { MatchPrefs } from './matchmaker.js';
import { pickRecipients, PUSH_ROUND_MS, VideochatPushService } from './videochat-push.service.js';
import type { VideochatRepository } from './videochat.repository.js';

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
  };
  let service: VideochatPushService;

  beforeEach(() => {
    vi.mocked(webpush.sendNotification).mockReset();
    repository = {
      pushCandidates: vi.fn(),
      markPushNotified: vi.fn(),
      deletePushSubscription: vi.fn(),
    };
    service = new VideochatPushService(
      repository as unknown as VideochatRepository,
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
    expect(payloads[1]?.url).toBe('/en/videochat/room');
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
      {} as unknown as AppConfigService,
    );
    expect(off.publicKey).toBeNull();
    expect(await off.someoneWaiting({ userId: 'w', blocked: new Set() }, [])).toBe(0);
    expect(repository.pushCandidates).not.toHaveBeenCalled();
  });
});
