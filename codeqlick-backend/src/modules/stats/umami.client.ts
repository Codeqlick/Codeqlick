import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';

type Metric = { x: string; y: number };
type Range = { startAt: number; endAt: number };

export interface SiteVisits {
  /** False when analytics isn't set up here (development, tests). */
  enabled: boolean;
  /** False when Umami didn't answer; the dashboard says so instead of showing zeros. */
  available: boolean;
  days: number;
  totals: {
    visitors: number;
    visits: number;
    pageviews: number;
    bounceRate: number;
    avgVisitSeconds: number;
  };
  /** Visitors in the previous period of the same length, for the trend. */
  previousVisitors: number;
  daily: Array<{ date: string; pageviews: number; visitors: number }>;
  topPages: Array<{ path: string; visitors: number }>;
  referrers: Array<{ source: string; visitors: number }>;
  countries: Array<{ code: string; visitors: number }>;
  contactsSent: number;
}

const EMPTY_TOTALS = { visitors: 0, visits: 0, pageviews: 0, bounceRate: 0, avgVisitSeconds: 0 };
const DAY_MS = 86_400_000;
const TIME_ZONE = 'Europe/Madrid';

/**
 * Reads the site's numbers from the self-hosted Umami (see deploy/README.md, "Analytics"), inside
 * the Docker network. It signs in with the dashboard's account and keeps the token until Umami
 * rejects it.
 */
@Injectable()
export class UmamiClient {
  private readonly logger = new Logger(UmamiClient.name);
  private token: string | undefined;

  constructor(private readonly config: AppConfigService) {}

  /**
   * The numbers of a website over the last `days`: the public site's by default, or a managed
   * client site's (`websiteId`).
   */
  async visits(days: number, now = Date.now(), websiteId?: string): Promise<SiteVisits> {
    const id = websiteId ?? this.config.umami?.websiteId;
    const empty: SiteVisits = {
      enabled: this.config.umamiApi !== undefined && id !== undefined,
      available: false,
      days,
      totals: EMPTY_TOTALS,
      previousVisitors: 0,
      daily: [],
      topPages: [],
      referrers: [],
      countries: [],
      contactsSent: 0,
    };
    if (!empty.enabled) return empty;

    const range = { startAt: now - days * DAY_MS, endAt: now };
    try {
      const [stats, series, pages, referrers, countries, events] = await Promise.all([
        this.get<Record<string, number>>(id!, 'stats', range),
        this.get<{ pageviews: Metric[]; sessions: Metric[] }>(id!, 'pageviews', range, {
          unit: 'day',
          timezone: TIME_ZONE,
        }),
        this.get<Metric[]>(id!, 'metrics', range, { type: 'path', limit: '10' }),
        this.get<Metric[]>(id!, 'metrics', range, { type: 'referrer', limit: '8' }),
        this.get<Metric[]>(id!, 'metrics', range, { type: 'country', limit: '6' }),
        this.get<Metric[]>(id!, 'metrics', range, { type: 'event', limit: '50' }),
      ]);
      const previous = await this.get<Record<string, number>>(id!, 'stats', {
        startAt: range.startAt - days * DAY_MS,
        endAt: range.startAt,
      });
      const visits = stats.visits ?? 0;
      const sessions = new Map(series.sessions.map((point) => [point.x, point.y]));
      return {
        ...empty,
        available: true,
        totals: {
          visitors: stats.visitors ?? 0,
          visits,
          pageviews: stats.pageviews ?? 0,
          bounceRate: visits > 0 ? (stats.bounces ?? 0) / visits : 0,
          avgVisitSeconds: visits > 0 ? Math.round((stats.totaltime ?? 0) / visits) : 0,
        },
        previousVisitors: previous.visitors ?? 0,
        daily: fillDays(range, days, series.pageviews, sessions),
        topPages: pages.map((m) => ({ path: m.x, visitors: m.y })),
        referrers: referrers.map((m) => ({ source: m.x, visitors: m.y })),
        countries: countries.map((m) => ({ code: m.x, visitors: m.y })),
        contactsSent: events.find((m) => m.x === 'contact-sent')?.y ?? 0,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Umami is unreachable: ${reason}`);
      return empty;
    }
  }

  /** A new website in Umami for a managed client site; its id. */
  async createWebsite(name: string, domain: string, retried = false): Promise<string> {
    const umami = this.config.umamiApi;
    if (!umami) throw new Error('Umami is not configured');
    const response = await fetch(`${umami.url}/api/websites`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await this.signIn()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, domain }),
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 401 && !retried) {
      this.token = undefined;
      return this.createWebsite(name, domain, true);
    }
    if (!response.ok) throw new Error(`creating a website answered ${response.status}`);
    const { id } = (await response.json()) as { id?: string };
    if (!id) throw new Error('Umami returned no website id');
    return id;
  }

  private async get<T>(
    websiteId: string,
    path: string,
    range: Range,
    params: Record<string, string> = {},
    retried = false,
  ): Promise<T> {
    const umami = this.config.umamiApi;
    if (!umami) throw new Error('Umami is not configured');
    const query = new URLSearchParams({
      startAt: String(range.startAt),
      endAt: String(range.endAt),
      ...params,
    });
    const response = await fetch(`${umami.url}/api/websites/${websiteId}/${path}?${query}`, {
      headers: { Authorization: `Bearer ${await this.signIn()}` },
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 401 && !retried) {
      this.token = undefined;
      return this.get<T>(websiteId, path, range, params, true);
    }
    if (!response.ok) throw new Error(`${path} answered ${response.status}`);
    return (await response.json()) as T;
  }

  private async signIn(): Promise<string> {
    if (this.token) return this.token;
    const umami = this.config.umamiApi;
    if (!umami) throw new Error('Umami is not configured');
    const response = await fetch(`${umami.url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: umami.username, password: umami.password }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`sign-in answered ${response.status}`);
    const { token } = (await response.json()) as { token?: string };
    if (!token) throw new Error('sign-in returned no token');
    this.token = token;
    return token;
  }
}

/** One entry per day of the range (Madrid dates), zero where Umami has no data. */
export function fillDays(
  range: Range,
  days: number,
  pageviews: Metric[],
  sessions: Map<string, number>,
): SiteVisits['daily'] {
  const byDay = new Map(pageviews.map((point) => [point.x.slice(0, 10), point.y]));
  const visitorsByDay = new Map([...sessions].map(([x, y]) => [x.slice(0, 10), y]));
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE });
  return Array.from({ length: days }, (_, index) => {
    const date = format.format(new Date(range.endAt - (days - 1 - index) * DAY_MS));
    return { date, pageviews: byDay.get(date) ?? 0, visitors: visitorsByDay.get(date) ?? 0 };
  });
}
