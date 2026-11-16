import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import { PROTECTED_PATH } from './auth/constants';
import { isMediaAlbum, mediaCounts, movedPosition } from './cruising-media';
import {
  hasGiven,
  hasReceived,
  isMuteActive,
  isRoomMessageId,
  isRoomPath,
  mergeRoomMessages,
  postingRefusalKey,
  readRoomSnapshot,
  reportedRoomMessage,
  ROOM_MESSAGE_MAX,
  ROOM_REPORT_REASONS,
  roomCounter,
  roomHref,
  roomMessagesEndpoint,
  roomProxiedStatus,
  roomSendErrorKey,
  trimRoomMessages,
  type RoomMessage,
} from './cruising-rooms';

const message = (id: string, at: string, over: Partial<RoomMessage> = {}): RoomMessage => ({
  id,
  nickname: 'ana',
  verified: false,
  text: id,
  at,
  mine: false,
  ...over,
});

describe('the city chat (decision 100)', () => {
  it('counts characters against the 500 limit', () => {
    expect(roomCounter('')).toEqual({ length: 0, remaining: 500, over: false });
    expect(roomCounter('x'.repeat(ROOM_MESSAGE_MAX))).toEqual({
      length: 500,
      remaining: 0,
      over: false,
    });
    expect(roomCounter('x'.repeat(501)).over).toBe(true);
  });

  it('maps why I cannot post to a message key', () => {
    const base = { allowed: false, until: null };
    expect(postingRefusalKey({ allowed: true, reason: null, until: null })).toBeNull();
    expect(postingRefusalKey({ ...base, reason: 'nickname' })).toBe('nickname');
    expect(postingRefusalKey({ ...base, reason: 'new-account' })).toBe('newAccount');
    expect(postingRefusalKey({ ...base, reason: 'muted' })).toBe('muted');
    expect(postingRefusalKey({ ...base, reason: 'suspended' })).toBe('suspended');
  });

  it('maps the API status of a refused message to a message key', () => {
    expect(roomSendErrorKey(400)).toBe('contact');
    expect(roomSendErrorKey(401)).toBe('session');
    expect(roomSendErrorKey(403)).toBe('refused');
    expect(roomSendErrorKey(404)).toBe('gone');
    expect(roomSendErrorKey(409)).toBe('nickname');
    expect(roomSendErrorKey(429)).toBe('rate');
    expect(roomSendErrorKey(500)).toBe('error');
    expect(roomProxiedStatus(403)).toBe(403);
    expect(roomProxiedStatus(500)).toBe(502);
  });

  it('merges messages by id in time order and trims the oldest', () => {
    const a = message('a', '2026-11-16T10:00:00Z');
    const b = message('b', '2026-11-16T10:01:00Z');
    const c = message('c', '2026-11-16T10:02:00Z');
    expect(mergeRoomMessages([a, c], [b, c]).map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(trimRoomMessages([a, b, c], 2).map((item) => item.id)).toEqual(['b', 'c']);
    expect(trimRoomMessages([a], 2)).toEqual([a]);
  });

  it('builds the addresses and checks a room path', () => {
    expect(roomHref('ES', 'madrid')).toBe('/cruising/rooms/es/madrid');
    expect(roomMessagesEndpoint('es', true, 'ES', 'madrid')).toBe(
      '/es/api/rooms/es/madrid/messages',
    );
    expect(roomMessagesEndpoint('en', false, 'es', 'madrid')).toBe(
      '/en/cruising/api/rooms/es/madrid/messages',
    );
    expect(isRoomPath('es', 'san-sebastian')).toBe(true);
    expect(isRoomPath('esp', 'madrid')).toBe(false);
    expect(isRoomPath('es', '../x')).toBe(false);
    expect(isRoomMessageId('2f6d4e0a-1b2c-4d3e-8f9a-0b1c2d3e4f5a')).toBe(true);
    expect(isRoomMessageId('nope')).toBe(false);
  });

  it('reads the snapshot the route answers', () => {
    expect(readRoomSnapshot(null)).toBeNull();
    expect(readRoomSnapshot({ items: 3 })).toBeNull();
    const snapshot = readRoomSnapshot({
      items: [message('a', '2026-11-16T10:00:00Z'), { id: 1 }],
      posting: { allowed: false, reason: 'muted', until: '2026-11-17T10:00:00Z' },
    });
    expect(snapshot?.items).toHaveLength(1);
    expect(snapshot?.posting).toEqual({
      allowed: false,
      reason: 'muted',
      until: '2026-11-17T10:00:00Z',
    });
    expect(readRoomSnapshot({ items: [] })?.posting.allowed).toBe(true);
  });

  it('knows whether a mute is still on', () => {
    const now = new Date('2026-11-16T12:00:00Z');
    expect(isMuteActive('2026-11-17T12:00:00Z', now)).toBe(true);
    expect(isMuteActive('2026-11-15T12:00:00Z', now)).toBe(false);
    expect(isMuteActive(null, now)).toBe(false);
    expect(isMuteActive('nonsense', now)).toBe(false);
  });

  it('reads a reported room message for the team', () => {
    expect(
      reportedRoomMessage({
        type: 'ROOM_MESSAGE',
        roomMessage: { id: 'm1', countryCode: 'ES', citySlug: 'madrid', hidden: true },
      }),
    ).toEqual({ id: 'm1', countryCode: 'ES', citySlug: 'madrid', hidden: true });
    expect(reportedRoomMessage({ type: 'ROOM_MESSAGE', roomMessage: null })).toBeNull();
    expect(reportedRoomMessage(undefined)).toBeNull();
  });

  it('offers only the reasons a room message can be reported for', () => {
    expect(ROOM_REPORT_REASONS).toEqual([
      'MINOR',
      'ILLEGAL',
      'DANGER',
      'HARASSMENT',
      'SPAM',
      'OTHER',
    ]);
  });

  it('keeps rooms behind the account', () => {
    expect(PROTECTED_PATH.test('/en/cruising/rooms')).toBe(true);
    expect(PROTECTED_PATH.test('/es/cruising/rooms/es/madrid')).toBe(true);
  });

  it('has the same texts in both languages', () => {
    for (const group of ['rooms', 'album', 'media', 'gallery', 'nav'] as const) {
      expect(Object.keys(es.Cruising[group]).toSorted()).toEqual(
        Object.keys(en.Cruising[group]).toSorted(),
      );
    }
    expect(Object.keys(es.Cruising.rooms.refusal).toSorted()).toEqual(
      Object.keys(en.Cruising.rooms.refusal).toSorted(),
    );
    expect(Object.keys(es.Cruising.rooms.errors).toSorted()).toEqual(
      Object.keys(en.Cruising.rooms.errors).toSorted(),
    );
    expect(Object.keys(es.AdminCruising.rooms).toSorted()).toEqual(
      Object.keys(en.AdminCruising.rooms).toSorted(),
    );
    expect(en.AdminCruising.targets.ROOM_MESSAGE).toBeTruthy();
    expect(es.AdminCruising.targets.ROOM_MESSAGE).toBeTruthy();
  });
});

describe('the private album (decision 99)', () => {
  it('knows the albums', () => {
    expect(isMediaAlbum('PUBLIC')).toBe(true);
    expect(isMediaAlbum('PRIVATE')).toBe(true);
    expect(isMediaAlbum('other')).toBe(false);
  });

  it('counts each album on its own', () => {
    const items = [
      { kind: 'PHOTO', status: 'LIVE', album: 'PUBLIC' },
      { kind: 'PHOTO', status: 'LIVE', album: 'PRIVATE' },
      { kind: 'VIDEO', status: 'PROCESSING', album: 'PRIVATE' },
      { kind: 'PHOTO', status: 'FAILED', album: 'PRIVATE' },
    ] as const;
    expect(mediaCounts(items, 'PUBLIC')).toEqual({ photos: 1, videos: 0 });
    expect(mediaCounts(items, 'PRIVATE')).toEqual({ photos: 1, videos: 1 });
    expect(mediaCounts(items)).toEqual({ photos: 2, videos: 1 });
  });

  it('moves an item among the ones of its own album', () => {
    const items = [
      { id: 'a', album: 'PUBLIC' },
      { id: 'b', album: 'PRIVATE' },
      { id: 'c', album: 'PUBLIC' },
      { id: 'd', album: 'PRIVATE' },
    ] as const;
    expect(movedPosition(items, 'c', -1)).toBe(0);
    expect(movedPosition(items, 'a', 1)).toBe(2);
    expect(movedPosition(items, 'a', -1)).toBeNull();
    expect(movedPosition(items, 'd', 1)).toBeNull();
    expect(movedPosition(items, 'd', -1)).toBe(1);
  });

  it('tells who shared with whom', () => {
    const grants = {
      given: [{ nickname: 'ana', at: '2026-11-16T10:00:00Z' }],
      received: [{ nickname: 'bo', at: '2026-11-16T10:00:00Z' }],
    };
    expect(hasGiven(grants, 'ana')).toBe(true);
    expect(hasGiven(grants, 'bo')).toBe(false);
    expect(hasReceived(grants, 'bo')).toBe(true);
  });
});
