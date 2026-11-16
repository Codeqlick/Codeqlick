import { describe, expect, it } from 'vitest';
import {
  canSeeMedia,
  coverOf,
  cruisingWatermark,
  detectVideoType,
  hasRoom,
  mediaHidesAtOnce,
  normalizeMediaRef,
  parseProbe,
  parseRange,
  posterArgs,
  posterTime,
  reasonAllowedOn,
  reorder,
  transcodeArgs,
  useDailyAllowance,
  videoLengthAllowed,
  type MediaAccess,
} from './cruising-media.rules.js';

const bytes = (text: string, prefix: number[] = []) =>
  new Uint8Array([...prefix, ...Array.from(text, (char) => char.charCodeAt(0))]);

describe('Cruising media rules', () => {
  describe('detectVideoType', () => {
    it('tells MP4, QuickTime and WebM from their first bytes', () => {
      expect(detectVideoType(bytes('ftypisom0000', [0, 0, 0, 0x20]))).toBe('mp4');
      expect(detectVideoType(bytes('ftypqt  0000', [0, 0, 0, 0x14]))).toBe('mov');
      expect(detectVideoType(bytes('wide', [0, 0, 0, 8]))).toBe('mov');
      expect(detectVideoType(bytes('B\u0086\u0081\u0001webm', [0x1a, 0x45, 0xdf, 0xa3]))).toBe(
        'webm',
      );
    });

    it('refuses anything else, Matroska that is not WebM included', () => {
      expect(detectVideoType(bytes('B\u0086matroska', [0x1a, 0x45, 0xdf, 0xa3]))).toBeUndefined();
      expect(detectVideoType(bytes('%PDF-1.7 hello'))).toBeUndefined();
      expect(detectVideoType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBeUndefined();
    });
  });

  describe('parseProbe', () => {
    const probe = (streams: unknown[], duration = '12.4') =>
      JSON.stringify({ streams, format: { duration } });

    it('reads the duration, the size and the audio', () => {
      expect(
        parseProbe(
          probe([{ codec_type: 'video', width: 1920, height: 1080 }, { codec_type: 'audio' }]),
        ),
      ).toEqual({ duration: 12.4, durationSeconds: 12, width: 1920, height: 1080, hasAudio: true });
    });

    it('is null without a video stream, a duration or valid JSON', () => {
      expect(parseProbe(probe([{ codec_type: 'audio' }]))).toBeNull();
      expect(parseProbe(probe([{ codec_type: 'video', width: 10, height: 10 }], 'N/A'))).toBeNull();
      expect(parseProbe('not json')).toBeNull();
      expect(parseProbe('null')).toBeNull();
    });

    it('lets 60 seconds (and rounding) through, not more', () => {
      expect(videoLengthAllowed(60)).toBe(true);
      expect(videoLengthAllowed(60.4)).toBe(true);
      expect(videoLengthAllowed(61)).toBe(false);
    });
  });

  describe('ffmpeg arguments', () => {
    it('transcode to H.264/AAC MP4 ≤ 720p ≤ 60 s without metadata, the index first', () => {
      const args = transcodeArgs('/in/a.upload', '/out/a.mp4');
      const joined = args.join(' ');
      expect(args[args.indexOf('-i') + 1]).toBe('/in/a.upload');
      expect(args.at(-1)).toBe('/out/a.mp4');
      expect(joined).toContain('-c:v libx264');
      expect(joined).toContain('-c:a aac');
      expect(joined).toContain('-map_metadata -1');
      expect(joined).toContain('-movflags +faststart');
      expect(joined).toContain('-t 60');
      expect(joined).toContain('min(1280');
      expect(joined).toContain('min(720');
      // An array for spawn: no shell ever sees it.
      expect(args.every((arg) => typeof arg === 'string')).toBe(true);
    });

    it('take the poster a second in, or in the middle of a shorter video', () => {
      expect(posterTime(30)).toBe(1);
      expect(posterTime(1)).toBe(0.5);
      expect(posterArgs('/v.mp4', 0.5)).toContain('0.50');
    });
  });

  describe('parseRange', () => {
    it('serves the whole file without a range or with one it does not understand', () => {
      expect(parseRange(undefined, 100)).toBeNull();
      expect(parseRange('items=0-1', 100)).toBeNull();
      expect(parseRange('bytes=0-1,5-6', 100)).toBeNull();
      expect(parseRange('bytes=-', 100)).toBeNull();
      expect(parseRange('bytes=50-10', 100)).toBeNull();
    });

    it('reads open, closed and suffix ranges, clamped to the file', () => {
      expect(parseRange('bytes=0-', 100)).toEqual({ start: 0, end: 99 });
      expect(parseRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 });
      expect(parseRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 });
      expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
      expect(parseRange('bytes=-500', 100)).toEqual({ start: 0, end: 99 });
    });

    it('answers 416 past the end', () => {
      expect(parseRange('bytes=100-', 100)).toBe('unsatisfiable');
      expect(parseRange('bytes=-0', 100)).toBe('unsatisfiable');
    });
  });

  describe('canSeeMedia', () => {
    const access = (overrides: Partial<MediaAccess> = {}): MediaAccess => ({
      viewerId: 'viewer',
      viewerIsAdmin: false,
      viewerEntered: true,
      viewerHasNickname: true,
      ownerId: 'owner',
      status: 'LIVE',
      ownerSuspended: false,
      blocked: false,
      ...overrides,
    });

    it('lets an entered member with a nickname see a LIVE item', () => {
      expect(canSeeMedia(access())).toBe(true);
    });

    it('always lets the owner and the team see it, whatever its status', () => {
      for (const status of ['HIDDEN', 'PROCESSING'] as const) {
        expect(canSeeMedia(access({ status, viewerId: 'owner' }))).toBe(true);
        expect(canSeeMedia(access({ status, viewerIsAdmin: true, viewerEntered: false }))).toBe(
          true,
        );
      }
    });

    it('hides it otherwise: not LIVE, not entered, no nickname, suspended owner, blocked', () => {
      expect(canSeeMedia(access({ status: 'HIDDEN' }))).toBe(false);
      expect(canSeeMedia(access({ viewerEntered: false }))).toBe(false);
      expect(canSeeMedia(access({ viewerHasNickname: false }))).toBe(false);
      expect(canSeeMedia(access({ ownerSuspended: true }))).toBe(false);
      expect(canSeeMedia(access({ blocked: true }))).toBe(false);
    });
  });

  describe('reports', () => {
    it('hide an item at once for a minor, no consent, a stolen image or something illegal', () => {
      for (const reason of ['MINOR', 'NON_CONSENSUAL', 'STOLEN', 'ILLEGAL']) {
        expect(mediaHidesAtOnce(reason)).toBe(true);
      }
      for (const reason of ['HARASSMENT', 'SPAM', 'OTHER']) {
        expect(mediaHidesAtOnce(reason)).toBe(false);
      }
    });

    it('take each reason only where it applies', () => {
      expect(reasonAllowedOn('media', 'STOLEN')).toBe(true);
      expect(reasonAllowedOn('profile', 'NON_CONSENSUAL')).toBe(true);
      expect(reasonAllowedOn('spot', 'STOLEN')).toBe(false);
      expect(reasonAllowedOn('review', 'NON_CONSENSUAL')).toBe(false);
      expect(reasonAllowedOn('media', 'DANGER')).toBe(false);
      expect(reasonAllowedOn('media', 'WRONG_INFO')).toBe(false);
      expect(reasonAllowedOn('spot', 'WRONG_INFO')).toBe(true);
      expect(reasonAllowedOn('media', 'MINOR')).toBe(true);
    });
  });

  describe('cover, order and limits', () => {
    const item = (id: string, kind: 'PHOTO' | 'VIDEO', status = 'LIVE', cover = false) => ({
      id,
      kind,
      status: status as 'LIVE' | 'HIDDEN',
      cover,
    });

    it('takes the chosen LIVE photo, else the first LIVE photo, never a video', () => {
      expect(
        coverOf([item('v', 'VIDEO'), item('a', 'PHOTO'), item('b', 'PHOTO', 'LIVE', true)]),
      ).toBe('b');
      expect(coverOf([item('v', 'VIDEO'), item('a', 'PHOTO', 'HIDDEN'), item('b', 'PHOTO')])).toBe(
        'b',
      );
      expect(coverOf([item('a', 'PHOTO', 'HIDDEN', true), item('b', 'PHOTO')])).toBe('b');
      expect(coverOf([item('v', 'VIDEO')])).toBeNull();
    });

    it('moves one item to its new index', () => {
      expect(reorder(['a', 'b', 'c', 'd'], 'd', 0)).toEqual(['d', 'a', 'b', 'c']);
      expect(reorder(['a', 'b', 'c'], 'a', 1)).toEqual(['b', 'a', 'c']);
      expect(reorder(['a', 'b', 'c'], 'a', 99)).toEqual(['b', 'c', 'a']);
      expect(reorder(['a', 'b'], 'x', 0)).toEqual(['a', 'b']);
    });

    it('allows 12 photos and 4 videos', () => {
      expect(hasRoom('PHOTO', 11, 4)).toBe(true);
      expect(hasRoom('PHOTO', 12, 0)).toBe(false);
      expect(hasRoom('VIDEO', 12, 3)).toBe(true);
      expect(hasRoom('VIDEO', 0, 4)).toBe(false);
    });

    it('counts a daily allowance from the first use of the day', () => {
      const now = new Date('2026-11-16T12:00:00Z');
      const earlier = new Date('2026-11-16T08:00:00Z');
      expect(useDailyAllowance(0, null, 20, now)).toEqual({ count: 1, since: now });
      expect(useDailyAllowance(5, earlier, 20, now)).toEqual({ count: 6, since: earlier });
      expect(useDailyAllowance(20, earlier, 20, now)).toBeNull();
      const yesterday = new Date('2026-11-15T11:00:00Z');
      expect(useDailyAllowance(20, yesterday, 20, now)).toEqual({ count: 1, since: now });
    });
  });

  it('reads a media reference as people type it', () => {
    expect(normalizeMediaRef(' #k7qm 2xpa ')).toBe('K7QM2XPA');
    expect(normalizeMediaRef('K7QM2XP')).toBeNull();
    expect(normalizeMediaRef('K7QM2XP0')).toBeNull();
    expect(normalizeMediaRef(undefined)).toBeNull();
  });

  it('watermarks with the nickname and the host', () => {
    expect(cruisingWatermark('pier_fan')).toBe('@pier_fan · cruising.codeqlick.com');
    expect(cruisingWatermark(null)).toBe('cruising.codeqlick.com');
  });
});
