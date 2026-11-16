import { describe, expect, it } from 'vitest';
import { MEDIA_REPORT_REASONS, TAKEDOWN_REASONS } from './cruising';
import {
  canAddMedia,
  forwardableRange,
  hasProcessing,
  isMediaId,
  isMediaRef,
  mediaCounts,
  mediaErrorKey,
  mediaFailureKey,
  mediaFileEndpoint,
  mediaKindOf,
  mediaPosterEndpoint,
  mediaResponseHeaders,
  mediaUploadEndpoint,
  movedPosition,
  proxiedStatus,
  reportedMedia,
  sameOrigin,
  watermarkText,
} from './cruising-media';

describe('media counts and limits', () => {
  const items = [
    { id: 'a', kind: 'PHOTO' as const, status: 'LIVE' as const },
    { id: 'b', kind: 'VIDEO' as const, status: 'PROCESSING' as const },
    { id: 'c', kind: 'PHOTO' as const, status: 'HIDDEN' as const },
    { id: 'd', kind: 'VIDEO' as const, status: 'FAILED' as const },
  ];

  it('counts photos and videos, not the failed ones', () => {
    expect(mediaCounts(items)).toEqual({ photos: 2, videos: 1 });
  });

  it('stops at the limits', () => {
    const limits = { photos: 2, videos: 4 };
    expect(canAddMedia('PHOTO', mediaCounts(items), limits)).toBe(false);
    expect(canAddMedia('VIDEO', mediaCounts(items), limits)).toBe(true);
  });

  it('knows when something is processing', () => {
    expect(hasProcessing(items)).toBe(true);
    expect(hasProcessing([items[0]!])).toBe(false);
  });

  it('moves an item one place, not past the ends', () => {
    expect(movedPosition(items, 'b', -1)).toBe(0);
    expect(movedPosition(items, 'b', 1)).toBe(2);
    expect(movedPosition(items, 'a', -1)).toBeNull();
    expect(movedPosition(items, 'd', 1)).toBeNull();
    expect(movedPosition(items, 'zzz', 1)).toBeNull();
  });

  it('tells a photo from a video', () => {
    expect(mediaKindOf({ type: 'image/webp' })).toBe('PHOTO');
    expect(mediaKindOf({ type: 'video/quicktime' })).toBe('VIDEO');
    expect(mediaKindOf({ type: 'application/pdf' })).toBeNull();
  });
});

describe('errors and failures', () => {
  it('maps the API statuses to messages', () => {
    expect(mediaErrorKey(400)).toBe('invalid');
    expect(mediaErrorKey(403)).toBe('notVerified');
    expect(mediaErrorKey(409)).toBe('limit');
    expect(mediaErrorKey(413)).toBe('tooLarge');
    expect(mediaErrorKey(429)).toBe('tooManyToday');
    expect(mediaErrorKey(507)).toBe('diskFull');
    expect(mediaErrorKey(0)).toBe('error');
    expect(mediaErrorKey(500)).toBe('error');
  });

  it('maps the failure codes, with a generic one', () => {
    expect(mediaFailureKey('too-long')).toBe('tooLong');
    expect(mediaFailureKey('unreadable')).toBe('unreadable');
    expect(mediaFailureKey('blocked')).toBe('blocked');
    expect(mediaFailureKey('interrupted')).toBe('interrupted');
    expect(mediaFailureKey('something new')).toBe('unknown');
    expect(mediaFailureKey(null)).toBe('unknown');
  });
});

describe('addresses', () => {
  it('writes the proxy addresses for each host', () => {
    expect(mediaFileEndpoint('es', true, 'abc12345')).toBe('/es/media/abc12345');
    expect(mediaFileEndpoint('es', false, 'abc12345')).toBe('/es/cruising/media/abc12345');
    expect(mediaPosterEndpoint('en', true, 'abc12345')).toBe('/en/media/abc12345/poster');
  });

  it('uploads to the route itself, on every host', () => {
    expect(mediaUploadEndpoint('en')).toBe('/en/cruising/api/media');
  });

  it('writes the watermark', () => {
    expect(watermarkText('ana_22')).toBe('@ana_22 · cruising.codeqlick.com');
  });

  it('checks ids and references', () => {
    expect(isMediaId('0b6c1c2e-1111-4222-8333-444455556666')).toBe(true);
    expect(isMediaId('../x')).toBe(false);
    expect(isMediaId('a/b')).toBe(false);
    expect(isMediaRef('Ab3dE9xZ')).toBe(true);
    expect(isMediaRef('short')).toBe(false);
  });
});

describe('the file proxy', () => {
  it('forwards only byte ranges', () => {
    expect(forwardableRange('bytes=0-1023')).toBe('bytes=0-1023');
    expect(forwardableRange('bytes=100-')).toBe('bytes=100-');
    expect(forwardableRange('bytes=-500')).toBe('bytes=-500');
    expect(forwardableRange('items=0-1')).toBeNull();
    expect(forwardableRange('bytes=0-1\r\nX: y')).toBeNull();
    expect(forwardableRange(null)).toBeNull();
  });

  it('passes the statuses a browser can use and turns the rest into 502', () => {
    expect([200, 206, 404, 416, 401, 403].map(proxiedStatus)).toEqual([
      200, 206, 404, 416, 401, 403,
    ]);
    expect(proxiedStatus(500)).toBe(502);
    expect(proxiedStatus(307)).toBe(502);
  });

  it('keeps the file headers and adds the privacy ones', () => {
    const headers = mediaResponseHeaders(
      new Headers({
        'Content-Type': 'video/mp4',
        'Content-Length': '10',
        'Content-Range': 'bytes 0-9/100',
        'Set-Cookie': 'a=b',
        'Cache-Control': 'public, max-age=1',
      }),
    );
    expect(headers.get('Content-Type')).toBe('video/mp4');
    expect(headers.get('Content-Range')).toBe('bytes 0-9/100');
    expect(headers.get('Accept-Ranges')).toBe('bytes');
    expect(headers.get('Set-Cookie')).toBeNull();
    expect(headers.get('Cache-Control')).toBe('private, no-store');
    expect(headers.get('X-Robots-Tag')).toBe('noindex');
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('Content-Disposition')).toBe('inline');
  });

  it('accepts uploads from this site only', () => {
    expect(sameOrigin('https://cruising.codeqlick.com', 'cruising.codeqlick.com')).toBe(true);
    expect(sameOrigin('https://evil.example', 'cruising.codeqlick.com')).toBe(false);
    expect(sameOrigin('not a url', 'cruising.codeqlick.com')).toBe(false);
    expect(sameOrigin(null, 'cruising.codeqlick.com')).toBe(true);
  });
});

describe('reports and removal requests', () => {
  it('reads the media of a report', () => {
    expect(
      reportedMedia({
        type: 'MEDIA',
        media: { id: 'abc12345', ref: 'Ab3dE9xZ', kind: 'VIDEO', status: 'HIDDEN' },
      }),
    ).toEqual({ id: 'abc12345', ref: 'Ab3dE9xZ', kind: 'VIDEO', status: 'HIDDEN' });
    expect(reportedMedia({ type: 'MEDIA', media: null })).toBeNull();
    expect(reportedMedia(undefined)).toBeNull();
  });

  it('offers the new reasons where they apply', () => {
    expect(MEDIA_REPORT_REASONS).toContain('NON_CONSENSUAL');
    expect(MEDIA_REPORT_REASONS).toContain('STOLEN');
    expect(MEDIA_REPORT_REASONS).not.toContain('DANGER');
    expect(MEDIA_REPORT_REASONS).not.toContain('WRONG_INFO');
    expect(TAKEDOWN_REASONS).toEqual([
      'MINOR',
      'ILLEGAL',
      'NON_CONSENSUAL',
      'STOLEN',
      'DANGER',
      'OTHER',
    ]);
  });
});
