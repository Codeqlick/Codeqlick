import { describe, expect, it } from 'vitest';
import { cruisingNoticeEmail } from './cruising-emails.js';
import {
  alertChannel,
  ALERTS_PER_DAY,
  pushPayload,
  type AlertCandidate,
  type RecentAlert,
} from './cruising.rules.js';

const NOW = new Date('2026-11-16T12:00:00Z');
const HOUR = 3600_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const push: AlertCandidate = {
  favoriteAlerts: true,
  favoriteEmails: false,
  emailAlerts: true,
  hasPush: true,
};
const emailOnly: AlertCandidate = { ...push, hasPush: false, favoriteEmails: true };

describe('alertChannel (decision 85)', () => {
  it('pushes to a member with a device and favourite alerts on', () => {
    expect(alertChannel(push, 'a', [], NOW)).toBe('PUSH');
    expect(alertChannel({ ...push, favoriteAlerts: false }, 'a', [], NOW)).toBeNull();
  });

  it('never alerts twice about the same spot within 3 hours', () => {
    const recent: RecentAlert[] = [{ spotId: 'a', channel: 'PUSH', createdAt: ago(2 * HOUR) }];
    expect(alertChannel(push, 'a', recent, NOW)).toBeNull();
    expect(alertChannel(push, 'b', recent, NOW)).toBe('PUSH');
    const older: RecentAlert[] = [{ spotId: 'a', channel: 'PUSH', createdAt: ago(3 * HOUR) }];
    expect(alertChannel(push, 'a', older, NOW)).toBe('PUSH');
  });

  it('stops at 10 a day, counting only the last 24 hours', () => {
    const many = (at: number): RecentAlert[] =>
      Array.from({ length: ALERTS_PER_DAY }, (_, i) => ({
        spotId: `s${i}`,
        channel: 'PUSH',
        createdAt: ago(at + i * 60_000),
      }));
    expect(alertChannel(push, 'a', many(4 * HOUR), NOW)).toBeNull();
    expect(alertChannel(push, 'a', many(25 * HOUR), NOW)).toBe('PUSH');
  });

  it('emails members without a device only when they asked, once a day', () => {
    expect(alertChannel(emailOnly, 'a', [], NOW)).toBe('EMAIL');
    expect(alertChannel({ ...emailOnly, favoriteEmails: false }, 'a', [], NOW)).toBeNull();
    // Cruising's email switch off turns this email off too.
    expect(alertChannel({ ...emailOnly, emailAlerts: false }, 'a', [], NOW)).toBeNull();
    const emailed: RecentAlert[] = [{ spotId: 'b', channel: 'EMAIL', createdAt: ago(20 * HOUR) }];
    expect(alertChannel(emailOnly, 'a', emailed, NOW)).toBeNull();
    const yesterday: RecentAlert[] = [
      { spotId: 'b', channel: 'EMAIL', createdAt: ago(24 * HOUR + 1) },
    ];
    expect(alertChannel(emailOnly, 'a', yesterday, NOW)).toBe('EMAIL');
  });

  it('never emails a member who has a device', () => {
    expect(
      alertChannel({ ...push, favoriteEmails: true, favoriteAlerts: false }, 'a', [], NOW),
    ).toBeNull();
  });
});

describe('pushPayload', () => {
  it('names neither a spot nor a person and opens the right page', () => {
    expect(pushPayload('favorite', 'en')).toEqual({
      title: 'Cruising',
      body: 'Someone is at one of your favourite spots',
      url: '/en/favorites',
      tag: 'cruising-favorite',
    });
    expect(pushPayload('message', 'es')).toEqual({
      title: 'Cruising',
      body: 'Mensaje nuevo',
      url: '/es/messages',
      tag: 'cruising-message',
    });
    expect(pushPayload('favorite', 'es').body).toBe('Hay alguien en uno de tus lugares favoritos');
    expect(pushPayload('message', 'en').body).toBe('New message');
  });
});

describe('the favourites email', () => {
  it('says only that there is activity, and links to the favourites', () => {
    const email = cruisingNoticeEmail(
      'member@example.com',
      'en',
      'favorites',
      null,
      'https://cruising.codeqlick.com',
      'https://codeqlick.com',
    );
    expect(email.subject).toBe("There's activity at your favourite spots — Cruising");
    expect(email.html).toContain('https://cruising.codeqlick.com/en/favorites');
    expect(email.text).toContain('You can stop this email in your Cruising profile.');
  });
});
