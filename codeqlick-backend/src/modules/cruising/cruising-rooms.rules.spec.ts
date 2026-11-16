import { describe, expect, it } from 'vitest';
import {
  hasLink,
  isMuted,
  mergeRooms,
  muteUntil,
  PERMANENT_MUTE,
  roomHidesAtOnce,
  roomPostingBlock,
  roomRateAllows,
  roomTextRefusal,
  ROOM_PER_DAY,
  ROOM_PER_MINUTE,
  type RoomPoster,
} from './cruising-rooms.rules.js';

const NOW = new Date('2026-11-16T12:00:00Z');
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000);

describe('Cruising city rooms rules (decision 100)', () => {
  describe('roomPostingBlock', () => {
    const poster = (overrides: Partial<RoomPoster> = {}): RoomPoster => ({
      hasNickname: true,
      suspended: false,
      accountCreatedAt: hoursAgo(48),
      roomMutedUntil: null,
      ...overrides,
    });

    it('lets an entered member with a nickname and an account over a day old post', () => {
      expect(roomPostingBlock(poster(), NOW)).toBeNull();
    });

    it('needs the account to be over 24 hours old', () => {
      expect(roomPostingBlock(poster({ accountCreatedAt: hoursAgo(23) }), NOW)).toBe('new-account');
      expect(roomPostingBlock(poster({ accountCreatedAt: hoursAgo(24) }), NOW)).toBeNull();
    });

    it('refuses muted, suspended and nickname-less members', () => {
      expect(roomPostingBlock(poster({ roomMutedUntil: hoursAgo(-1) }), NOW)).toBe('muted');
      expect(roomPostingBlock(poster({ roomMutedUntil: hoursAgo(1) }), NOW)).toBeNull();
      expect(roomPostingBlock(poster({ suspended: true }), NOW)).toBe('suspended');
      expect(roomPostingBlock(poster({ hasNickname: false }), NOW)).toBe('nickname');
    });
  });

  it('allows 10 messages a minute and 200 a day', () => {
    expect(roomRateAllows(0, 0)).toBe(true);
    expect(roomRateAllows(ROOM_PER_MINUTE - 1, 10)).toBe(true);
    expect(roomRateAllows(ROOM_PER_MINUTE, 10)).toBe(false);
    expect(roomRateAllows(0, ROOM_PER_DAY - 1)).toBe(true);
    expect(roomRateAllows(0, ROOM_PER_DAY)).toBe(false);
  });

  describe('the contact filter, always on in rooms, and links', () => {
    it('takes ordinary text', () => {
      expect(roomTextRefusal('Anyone at the beach tonight? It was busy around 9.')).toBeNull();
      expect(roomTextRefusal('See you there, e.g. by the dunes.')).toBeNull();
    });

    it('refuses contact details from the first message', () => {
      expect(roomTextRefusal('Call me 612 345 678')).toBe('contact');
      expect(roomTextRefusal('mail me at someone@example.org')).toBe('contact');
      expect(roomTextRefusal('add me on telegram')).toBe('contact');
      expect(roomTextRefusal('I am @pier_fan elsewhere')).toBe('contact');
    });

    it('refuses links, even to domains the contact filter does not list', () => {
      expect(roomTextRefusal('look https://example.com')).toBe('link');
      expect(roomTextRefusal('www.example.de')).toBe('link');
      expect(roomTextRefusal('see t.me/somebody')).toBe('link');
      expect(roomTextRefusal('example.de/page')).toBe('link');
      expect(hasLink('ftp://files')).toBe(true);
      expect(hasLink('plain words. More words')).toBe(false);
    });
  });

  it('hides a message at once for MINOR, ILLEGAL and HARASSMENT', () => {
    expect(roomHidesAtOnce('MINOR')).toBe(true);
    expect(roomHidesAtOnce('ILLEGAL')).toBe(true);
    expect(roomHidesAtOnce('HARASSMENT')).toBe(true);
    expect(roomHidesAtOnce('SPAM')).toBe(false);
    expect(roomHidesAtOnce('OTHER')).toBe(false);
  });

  it('mutes for 24 h, 7 d, 30 d or for good', () => {
    expect(muteUntil('24h', NOW)).toEqual(hoursAgo(-24));
    expect(muteUntil('7d', NOW)).toEqual(hoursAgo(-7 * 24));
    expect(muteUntil('30d', NOW)).toEqual(hoursAgo(-30 * 24));
    expect(muteUntil('permanent', NOW)).toEqual(PERMANENT_MUTE);
    expect(isMuted(PERMANENT_MUTE, NOW)).toBe(true);
    expect(isMuted(null, NOW)).toBe(false);
  });

  it('lists each room once, latest message first, rooms without one by name', () => {
    const room = (citySlug: string, lastAt: Date | null, city = citySlug) => ({
      countryCode: 'ES',
      citySlug,
      city,
      lastAt,
      count24h: 0,
    });
    const merged = mergeRooms(
      [room('valencia', null, 'Valencia'), room('madrid', hoursAgo(2), 'Madrid')],
      [room('madrid', null, 'Madrid (again)'), room('bilbao', null, 'Bilbao')],
      [room('sevilla', hoursAgo(1), 'Sevilla')],
    );
    expect(merged.map((entry) => entry.city)).toEqual(['Sevilla', 'Madrid', 'Bilbao', 'Valencia']);
  });
});
