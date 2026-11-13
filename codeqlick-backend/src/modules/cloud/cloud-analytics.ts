import { createHash } from 'node:crypto';

/**
 * Cloud's web analytics (architecture 4.13 "Web analytics", decision 44): what an event says,
 * who sent it and the tracker every site loads. Pure functions, tested on their own.
 */

export const ANALYTICS_PERIODS = ['24h', '7d', '30d', '90d', '365d'] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

export interface AnalyticsHit {
  name: string;
  url: URL;
  referrer: string | null;
  width: number | null;
}

const EVENT_NAME = /^[A-Za-z0-9_.:-]{1,40}$/;

/** The body the tracker sends (`{ n, u, r, w }`), or null when it isn't one. */
export function parseHit(raw: unknown): AnalyticsHit | null {
  let body: unknown = raw;
  if (typeof raw === 'string') {
    try {
      body = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!body || typeof body !== 'object') return null;
  const { n, u, r, w } = body as Record<string, unknown>;
  const name = n === undefined ? 'pageview' : n;
  if (typeof name !== 'string' || !EVENT_NAME.test(name)) return null;
  if (typeof u !== 'string' || u.length > 2000) return null;
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  return {
    name,
    url,
    referrer: typeof r === 'string' && r.length <= 2000 ? r : null,
    width: typeof w === 'number' && Number.isFinite(w) && w > 0 ? Math.round(w) : null,
  };
}

/** The site an address belongs to: a project slug (on the hosting domain) or a custom domain. */
export function siteOf(
  host: string,
  hostingDomain: string,
): { slug: string } | { domain: string } | null {
  const name = host.toLowerCase();
  const suffix = `.${hostingDomain}`;
  if (name.endsWith(suffix)) {
    const match = /^([a-z0-9-]+?)(?:--[0-9a-f]{8})?$/.exec(name.slice(0, -suffix.length));
    return match ? { slug: match[1]! } : null;
  }
  return name.includes('.') ? { domain: name } : null;
}

const BOTS =
  /bot|crawl|spider|slurp|archiver|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|quora link|whatsapp|telegram|discord|slack|curl|wget|python|httpie|axios|node-fetch|undici|go-http|java\/|okhttp|libwww|scrapy|phantom|selenium|puppeteer|playwright/i;

/** Crawlers, link previews, headless browsers and HTTP libraries aren't visitors. */
export function isBot(userAgent: string | undefined): boolean {
  return !userAgent || userAgent.length < 20 || BOTS.test(userAgent);
}

export function browserOf(ua: string): string {
  if (/Edg(e|A|iOS)?\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet';
  if (/Firefox\/|FxiOS\//.test(ua)) return 'Firefox';
  if (/Chrome\/|CriOS\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Other';
}

export function osOf(ua: string): string {
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Other';
}

export function deviceOf(width: number | null, ua: string): string {
  if (width === null) return /Mobi|iPhone|Android/.test(ua) ? 'mobile' : 'desktop';
  return width < 768 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop';
}

/** The referring site's host, unless it is the same site. */
export function referrerOf(referrer: string | null, pageHost: string): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === pageHost.toLowerCase().replace(/^www\./, '')) return null;
    return host.slice(0, 100);
  } catch {
    return null;
  }
}

export function campaignOf(url: URL): string | null {
  const value = url.searchParams.get('utm_source') ?? url.searchParams.get('ref');
  const clean = value?.trim().toLowerCase().slice(0, 60);
  return clean ? clean : null;
}

export function pathOf(url: URL): string {
  return (decodeURIComponentSafe(url.pathname) || '/').slice(0, 300);
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** A visitor's id for one day: nothing that can be followed once the day's salt is gone. */
export function visitorId(salt: string, projectId: string, ip: string, userAgent: string): string {
  return createHash('sha256')
    .update(`${salt}|${projectId}|${ip}|${userAgent}`)
    .digest('hex')
    .slice(0, 32);
}

/** The UTC day an event belongs to (its salt's key). */
export const utcDay = (now: Date) => now.toISOString().slice(0, 10);

/** Where a period starts and how its series is cut. */
export function periodRange(
  period: AnalyticsPeriod,
  now = new Date(),
): { since: Date; unit: 'hour' | 'day'; buckets: number } {
  if (period === '24h') {
    const hour = new Date(now);
    hour.setUTCMinutes(0, 0, 0);
    return { since: new Date(hour.getTime() - 23 * 3_600_000), unit: 'hour', buckets: 24 };
  }
  const days = Number(period.slice(0, -1));
  return { since: madridMidnight(dayBefore(madridDay(now), days - 1)), unit: 'day', buckets: days };
}

/** The Madrid date (`YYYY-MM-DD`) of an instant. */
export const madridDay = (at: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(at);

/** The calendar day `n` days before `day` (`YYYY-MM-DD`). */
const dayBefore = (day: string, n: number) =>
  new Date(Date.parse(`${day}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

/** The instant a Madrid calendar day starts. */
export function madridMidnight(day: string): Date {
  const noon = Date.parse(`${day}T12:00:00Z`);
  const local = Date.parse(
    `${new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Madrid',
      dateStyle: 'short',
      timeStyle: 'medium',
    })
      .format(noon)
      .replace(' ', 'T')}Z`,
  );
  return new Date(Date.parse(`${day}T00:00:00Z`) - (local - noon));
}

/** Every bucket of a period, oldest first, filled from the rows that exist. */
export function fillSeries(
  rows: Array<{ t: string; visitors: number; pageviews: number }>,
  period: AnalyticsPeriod,
  now = new Date(),
): Array<{ t: string; visitors: number; pageviews: number }> {
  const { since, unit, buckets } = periodRange(period, now);
  const byKey = new Map(rows.map((row) => [row.t, row]));
  const out: Array<{ t: string; visitors: number; pageviews: number }> = [];
  if (unit === 'hour') {
    for (let i = 0; i < buckets; i += 1) {
      const t = new Date(since.getTime() + i * 3_600_000).toISOString();
      out.push(byKey.get(t) ?? { t, visitors: 0, pageviews: 0 });
    }
    return out;
  }
  const today = madridDay(now);
  for (let i = buckets - 1; i >= 0; i -= 1) {
    const t = dayBefore(today, i);
    out.push(byKey.get(t) ?? { t, visitors: 0, pageviews: 0 });
  }
  return out;
}

/** The tracker: page views (single-page apps too) and `codeqlick.track(name)`. */
export function trackerScript(endpoint: string): string {
  return `/* Codeqlick Cloud analytics: no cookies, no local storage. */
(function(){var w=window,d=document,n=navigator,l=w.location;
if(l.protocol!=="https:"||/^(localhost|127\\.|\\[::1\\])/.test(l.hostname)||n.doNotTrack==="1"||w.doNotTrack==="1"){w.codeqlick=w.codeqlick||{track:function(){}};return}
var e=${JSON.stringify(endpoint)},last;
function send(name){var b=JSON.stringify({n:name,u:l.href,r:d.referrer||null,w:w.innerWidth});
try{if(n.sendBeacon&&n.sendBeacon(e,b))return}catch(x){}
try{fetch(e,{method:"POST",body:b,keepalive:true,mode:"no-cors",headers:{"Content-Type":"text/plain"}})}catch(x){}}
function view(){if(last===l.pathname)return;last=l.pathname;send("pageview")}
var h=w.history;["pushState","replaceState"].forEach(function(k){var o=h[k];if(o)h[k]=function(){var r=o.apply(this,arguments);view();return r}});
w.addEventListener("popstate",view);
w.codeqlick={track:function(name){if(typeof name==="string")send(name)}};
if(d.visibilityState==="prerender")d.addEventListener("visibilitychange",function f(){if(d.visibilityState!=="prerender"){d.removeEventListener("visibilitychange",f);view()}});else view()})();
`;
}
