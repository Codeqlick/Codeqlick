import { randomBytes } from 'node:crypto';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { toApiLocale } from '../../common/schemas/common.schemas.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { MailService } from '../mail/mail.service.js';
import {
  browserOf,
  campaignOf,
  deviceOf,
  fillSeries,
  isBot,
  osOf,
  parseHit,
  pathOf,
  periodRange,
  referrerOf,
  siteOf,
  trackerScript,
  utcDay,
  visitorId,
  type AnalyticsPeriod,
} from './cloud-analytics.js';
import {
  CloudAnalyticsRepository,
  type AnalyticsSite,
  type TopRow,
} from './cloud-analytics.repository.js';
import type { CloudCtx } from './cloud-caller.js';
import { cloudAnalyticsLimitEmail } from './cloud-emails.js';
import { madridMonth } from './cloud-form-fields.js';
import { ANALYTICS_DAYS, CLOUD_PLANS } from './cloud-plans.js';
import { CloudProjectsService } from './cloud-projects.service.js';
import { CloudRepository } from './cloud.repository.js';
import { CloudTeamsService } from './cloud-teams.service.js';

export interface AnalyticsReport {
  enabled: boolean;
  snippet: string;
  period: AnalyticsPeriod;
  totals: { visitors: number; pageviews: number };
  series: Array<{ t: string; visitors: number; pageviews: number }>;
  pages: TopRow[];
  referrers: TopRow[];
  browsers: TopRow[];
  os: TopRow[];
  devices: TopRow[];
  events: TopRow[];
}

export interface AnalyticsHitInput {
  body: unknown;
  origin?: string;
  userAgent?: string;
  ip: string;
}

const DAY_MS = 86_400_000;
const SITE_CACHE_MS = 60_000;
const COUNT_CACHE_MS = 60_000;

/** Cloud's web analytics (architecture 4.13 "Web analytics", decision 44). */
@Injectable()
export class CloudAnalyticsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CloudAnalyticsService.name);
  private timer?: NodeJS.Timeout;
  /** Hosts → their project for a minute, so a busy site doesn't ask the database per view. */
  private readonly sites = new Map<string, { site: AnalyticsSite | null; at: number }>();
  /** Teams' events this month, counted at most once a minute and added to in between. */
  private readonly counts = new Map<string, { month: string; count: number; at: number }>();
  private readonly salts = new Map<string, string>();

  constructor(
    private readonly analytics: CloudAnalyticsRepository,
    private readonly projects: CloudProjectsService,
    private readonly teams: CloudTeamsService,
    private readonly cloud: CloudRepository,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.isTest) return;
    this.timer = setInterval(() => void this.cleanup(), DAY_MS / 24).unref();
    void this.cleanup();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Events older than a year and salts older than yesterday go (then ids can't be redone). */
  async cleanup(now = new Date()): Promise<void> {
    try {
      await this.analytics.deleteSaltsBefore(utcDay(new Date(now.getTime() - DAY_MS)));
      await this.analytics.deleteEventsBefore(new Date(now.getTime() - ANALYTICS_DAYS * DAY_MS));
      for (const day of this.salts.keys()) if (day < utcDay(now)) this.salts.delete(day);
    } catch (error) {
      this.logger.error(`Analytics cleanup failed: ${String(error)}`);
    }
  }

  get endpoint(): string {
    return `${this.config.publicApiUrl}/cloud/analytics/event`;
  }

  get snippet(): string {
    return `<script defer src="${this.config.publicApiUrl}/cloud/analytics/script.js"></script>`;
  }

  script(): string {
    return trackerScript(this.endpoint);
  }

  // ── The public endpoint ────────────────────────────────────────────────────────────────────

  /** Keeps a hit when it is a real visit to a project that counts; never says which. */
  async hit(input: AnalyticsHitInput, now = new Date()): Promise<boolean> {
    try {
      if (isBot(input.userAgent)) return false;
      const ua = input.userAgent!;
      const hit = parseHit(input.body);
      if (!hit) return false;
      if (input.origin && input.origin !== 'null' && input.origin !== hit.url.origin) return false;
      if (hit.url.port) return false;
      const site = await this.site(hit.url.hostname);
      if (!site?.analytics) return false;
      if (!(await this.underLimit(site, now))) return false;

      const salt = await this.salt(utcDay(now));
      await this.analytics.keep({
        projectId: site.id,
        teamId: site.teamId,
        name: hit.name,
        path: pathOf(hit.url),
        referrer: referrerOf(hit.referrer, hit.url.hostname),
        campaign: campaignOf(hit.url),
        browser: browserOf(ua),
        os: osOf(ua),
        device: deviceOf(hit.width, ua),
        visitor: visitorId(salt, site.id, input.ip, ua),
        createdAt: now,
      });
      const count = this.counts.get(site.teamId);
      if (count) count.count += 1;
      return true;
    } catch (error) {
      this.logger.error(`An analytics event couldn't be kept: ${String(error)}`);
      return false;
    }
  }

  private async site(host: string): Promise<AnalyticsSite | null> {
    const cached = this.sites.get(host);
    if (cached && Date.now() - cached.at < SITE_CACHE_MS) return cached.site;
    const hosting = this.config.cloudHosting?.domain ?? 'codeqlick.app';
    const where = siteOf(host, hosting);
    const site = !where
      ? null
      : 'slug' in where
        ? await this.analytics.siteBySlug(where.slug)
        : await this.analytics.siteByDomain(where.domain);
    if (this.sites.size > 5000) this.sites.clear();
    this.sites.set(host, { site, at: Date.now() });
    return site;
  }

  private async salt(day: string): Promise<string> {
    const known = this.salts.get(day);
    if (known) return known;
    const salt = await this.analytics.salt(day, randomBytes(32).toString('hex'));
    this.salts.set(day, salt);
    return salt;
  }

  private async underLimit(site: AnalyticsSite, now: Date): Promise<boolean> {
    const month = madridMonth(now);
    let entry = this.counts.get(site.teamId);
    if (!entry || entry.month !== month.key || Date.now() - entry.at > COUNT_CACHE_MS) {
      entry = {
        month: month.key,
        count: await this.analytics.teamEventsSince(site.teamId, month.start),
        at: Date.now(),
      };
      this.counts.set(site.teamId, entry);
    }
    const limit = CLOUD_PLANS[site.plan].analyticsEventsPerMonth;
    if (entry.count < limit) return true;
    void this.warnLimit(site.teamId, limit, month.key);
    return false;
  }

  private async warnLimit(teamId: string, limit: number, month: string): Promise<void> {
    try {
      if (!(await this.analytics.claimOverLimit(teamId, month))) return;
      const team = await this.analytics.team(teamId);
      if (!team) return;
      for (const owner of await this.cloud.ownerEmails(teamId)) {
        const locale = toApiLocale(owner.locale);
        await this.mail.send(
          cloudAnalyticsLimitEmail({
            to: owner.email,
            locale,
            team: team.name,
            limit,
            url: `${this.config.cloudUrl}/${locale}/console/${team.slug}`,
            siteUrl: this.config.siteUrl,
          }),
        );
      }
    } catch (error) {
      this.logger.error(`Team ${teamId}: the analytics limit email failed: ${String(error)}`);
    }
  }

  // ── The console ────────────────────────────────────────────────────────────────────────────

  async report(
    ctx: CloudCtx,
    projectId: string,
    period: AnalyticsPeriod,
  ): Promise<AnalyticsReport> {
    const { project } = await this.projects.project(ctx, projectId);
    const { since, unit } = periodRange(period);
    const [totals, series, pages, referrers, browsers, os, devices, events] = await Promise.all([
      this.analytics.totals(project.id, since),
      this.analytics.series(project.id, since, unit),
      this.analytics.top(project.id, since, 'pages'),
      this.analytics.referrers(project.id, since),
      this.analytics.top(project.id, since, 'browsers'),
      this.analytics.top(project.id, since, 'os'),
      this.analytics.top(project.id, since, 'devices'),
      this.analytics.events(project.id, since),
    ]);
    return {
      enabled: project.analytics,
      snippet: this.snippet,
      period,
      totals,
      series: fillSeries(series, period),
      pages,
      referrers,
      browsers,
      os,
      devices,
      events,
    };
  }

  async setEnabled(
    ctx: CloudCtx,
    projectId: string,
    enabled: boolean,
  ): Promise<{ enabled: boolean; snippet: string }> {
    const { project, membership } = await this.projects.project(ctx, projectId, 'ADMIN');
    await this.analytics.setEnabled(project.id, enabled);
    this.sites.clear();
    await this.teams.record(
      ctx,
      membership.teamId,
      enabled ? 'analytics.enabled' : 'analytics.disabled',
      project.slug,
    );
    return { enabled, snippet: this.snippet };
  }
}
