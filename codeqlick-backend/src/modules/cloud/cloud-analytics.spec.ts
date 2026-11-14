import { describe, expect, it } from 'vitest';
import {
  analyticsToCsv,
  browserOf,
  campaignOf,
  deviceOf,
  fillSeries,
  hashShareToken,
  isBot,
  madridMidnight,
  newShareToken,
  osOf,
  parseHit,
  pathOf,
  periodRange,
  previousRange,
  referrerOf,
  siteOf,
  trackerScript,
  visitorId,
} from './cloud-analytics.js';

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const EDGE_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';
const FIREFOX_ANDROID = 'Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0';

describe('Cloud web analytics', () => {
  it('reads the tracker body, as text or JSON', () => {
    const hit = parseHit('{"n":"pageview","u":"https://web.codeqlick.app/a?b=1","r":null,"w":390}');
    expect(hit?.name).toBe('pageview');
    expect(hit?.url.pathname).toBe('/a');
    expect(hit?.width).toBe(390);
    expect(parseHit({ u: 'https://x.example/' })?.name).toBe('pageview');
    expect(parseHit({ n: 'signup', u: 'https://x.example/' })?.name).toBe('signup');
    expect(parseHit({ n: 'bad name!', u: 'https://x.example/' })).toBeNull();
    expect(parseHit({ u: 'http://x.example/' })).toBeNull();
    expect(parseHit('not json')).toBeNull();
    expect(parseHit({})).toBeNull();
  });

  it('tells which project an address belongs to', () => {
    expect(siteOf('web.codeqlick.app', 'codeqlick.app')).toEqual({ slug: 'web' });
    expect(siteOf('my-site--a1b2c3d4.codeqlick.app', 'codeqlick.app')).toEqual({ slug: 'my-site' });
    expect(siteOf('my-site--b-feature-x.codeqlick.app', 'codeqlick.app')).toEqual({
      slug: 'my-site',
    });
    expect(siteOf('my-site--b-.codeqlick.app', 'codeqlick.app')).toBeNull();
    expect(siteOf('my-site--other.codeqlick.app', 'codeqlick.app')).toBeNull();
    expect(siteOf('a.b.codeqlick.app', 'codeqlick.app')).toBeNull();
    expect(siteOf('WWW.Example.com', 'codeqlick.app')).toEqual({ domain: 'www.example.com' });
    expect(siteOf('localhost', 'codeqlick.app')).toBeNull();
  });

  it('leaves out bots and empty user agents', () => {
    expect(isBot(undefined)).toBe(true);
    expect(isBot('curl/8.4.0')).toBe(true);
    expect(isBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(
      true,
    );
    expect(isBot('Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/131.0.0.0 Safari/537.36')).toBe(
      true,
    );
    expect(isBot(CHROME_MAC)).toBe(false);
  });

  it('names browsers, systems and devices', () => {
    expect([browserOf(CHROME_MAC), osOf(CHROME_MAC)]).toEqual(['Chrome', 'macOS']);
    expect([browserOf(SAFARI_IPHONE), osOf(SAFARI_IPHONE)]).toEqual(['Safari', 'iOS']);
    expect([browserOf(EDGE_WIN), osOf(EDGE_WIN)]).toEqual(['Edge', 'Windows']);
    expect([browserOf(FIREFOX_ANDROID), osOf(FIREFOX_ANDROID)]).toEqual(['Firefox', 'Android']);
    expect(deviceOf(390, SAFARI_IPHONE)).toBe('mobile');
    expect(deviceOf(800, CHROME_MAC)).toBe('tablet');
    expect(deviceOf(1440, CHROME_MAC)).toBe('desktop');
    expect(deviceOf(null, SAFARI_IPHONE)).toBe('mobile');
  });

  it('keeps only other sites as referrers, and campaigns', () => {
    expect(referrerOf('https://www.google.com/search?q=x', 'web.codeqlick.app')).toBe('google.com');
    expect(referrerOf('https://web.codeqlick.app/other', 'web.codeqlick.app')).toBeNull();
    expect(referrerOf('https://www.example.com/', 'example.com')).toBeNull();
    expect(referrerOf('android-app://x', 'example.com')).toBeNull();
    expect(campaignOf(new URL('https://x.example/?utm_source=Newsletter'))).toBe('newsletter');
    expect(campaignOf(new URL('https://x.example/?ref=producthunt'))).toBe('producthunt');
    expect(campaignOf(new URL('https://x.example/'))).toBeNull();
    expect(pathOf(new URL('https://x.example/caf%C3%A9?secret=1#top'))).toBe('/café');
  });

  it('counts a visitor per day without anything that follows them', () => {
    const a = visitorId('salt-1', 'p', '1.2.3.4', CHROME_MAC);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(visitorId('salt-1', 'p', '1.2.3.4', CHROME_MAC)).toBe(a);
    expect(visitorId('salt-2', 'p', '1.2.3.4', CHROME_MAC)).not.toBe(a);
    expect(visitorId('salt-1', 'q', '1.2.3.4', CHROME_MAC)).not.toBe(a);
  });

  it('cuts periods by hour or by Madrid day', () => {
    const now = new Date('2026-11-13T15:30:00Z');
    expect(periodRange('24h', now)).toEqual({
      since: new Date('2026-11-12T16:00:00Z'),
      unit: 'hour',
      buckets: 24,
    });
    // 7 Madrid days, today included: from 2026-11-07 00:00 Madrid (UTC+1).
    expect(periodRange('7d', now).since).toEqual(new Date('2026-11-06T23:00:00Z'));
    expect(madridMidnight('2026-07-01')).toEqual(new Date('2026-06-30T22:00:00Z'));
    const series = fillSeries([{ t: '2026-11-12', visitors: 3, pageviews: 5 }], '7d', now);
    expect(series).toHaveLength(7);
    expect(series[0]!.t).toBe('2026-11-07');
    expect(series[5]).toEqual({ t: '2026-11-12', visitors: 3, pageviews: 5 });
    expect(series[6]).toEqual({ t: '2026-11-13', visitors: 0, pageviews: 0 });
    const hours = fillSeries([], '24h', now);
    expect(hours[23]!.t).toBe('2026-11-13T15:00:00.000Z');
  });

  it('finds the window of the same length right before a period', () => {
    const now = new Date('2026-11-13T15:30:00Z');
    const day = periodRange('24h', now);
    expect(previousRange('24h', day.since)).toEqual({
      from: new Date('2026-11-11T16:00:00Z'),
      until: day.since,
    });
    // 7d from 2026-11-07 (Madrid) → 2026-10-31 00:00 Madrid, after the change: winter time (UTC+1).
    const week = periodRange('7d', now);
    expect(previousRange('7d', week.since)).toEqual({
      from: new Date('2026-10-30T23:00:00Z'),
      until: week.since,
    });
    // The clocks go back on 2026-10-25 (UTC+2 → UTC+1). Here the change is inside both windows'
    // neighbourhood but the edges stay on Madrid midnights: 2026-10-22 and 2026-10-15 (UTC+2).
    const across = periodRange('7d', new Date('2026-10-28T10:00:00Z'));
    expect(across.since).toEqual(new Date('2026-10-21T22:00:00Z'));
    expect(previousRange('7d', across.since).from).toEqual(new Date('2026-10-14T22:00:00Z'));
    // The previous window spans the change: it starts 2026-10-19 00:00 (UTC+2) and ends
    // 2026-10-26 00:00 (UTC+1), so it is 169 hours long and still 7 Madrid days.
    const spanning = periodRange('7d', new Date('2026-11-01T10:00:00Z'));
    expect(spanning.since).toEqual(new Date('2026-10-25T23:00:00Z'));
    const before = previousRange('7d', spanning.since);
    expect(before.from).toEqual(new Date('2026-10-18T22:00:00Z'));
    expect((before.until.getTime() - before.from.getTime()) / 3_600_000).toBe(169);
  });

  it('builds a tracker that posts to the endpoint', () => {
    const script = trackerScript('https://api.codeqlick.com/v1/cloud/analytics/event');
    expect(script).toContain('"https://api.codeqlick.com/v1/cloud/analytics/event"');
    expect(script).toContain('sendBeacon');
    // It is valid JavaScript.
    expect(() => new Function(script)).not.toThrow();
    expect(script).not.toMatch(/\.cookie|localStorage|sessionStorage/);
  });

  it('writes the analytics CSV with a BOM, a header and safe cells', () => {
    const csv = analyticsToCsv([
      { date: '2026-11-13', kind: 'page', name: '/pricing', visitors: 3, count: 5 },
      { date: '2026-11-13 14:00', kind: 'page', name: '=cmd|calc', visitors: 1, count: 1 },
      { date: '2026-11-13', kind: 'event', name: '/a,b "c"', visitors: 2, count: 2 },
    ]);
    expect(csv.startsWith('\uFEFFkind,date,name,visitors,count\r\n')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.slice(1).trimEnd().split('\r\n')).toEqual([
      'kind,date,name,visitors,count',
      'page,2026-11-13,/pricing,3,5',
      "page,2026-11-13 14:00,'=cmd|calc,1,1",
      'event,2026-11-13,"/a,b ""c""",2,2',
    ]);
    expect(analyticsToCsv([])).toBe('\uFEFFkind,date,name,visitors,count\r\n');
  });

  it('makes shared-link tokens that are random and found again by their hash', () => {
    const token = newShareToken();
    expect(token).toMatch(/^cqa_[A-Za-z0-9_-]{32}$/);
    expect(newShareToken()).not.toBe(token);
    expect(hashShareToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashShareToken(token)).toBe(hashShareToken(token));
    expect(hashShareToken(token)).not.toBe(hashShareToken(newShareToken()));
  });
});
