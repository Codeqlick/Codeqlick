import { randomBytes } from 'node:crypto';
import {
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { toApiLocale } from '../../common/schemas/common.schemas.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { SecretBox } from '../auth/secret-box.js';
import { MailService } from '../mail/mail.service.js';
import {
  analyticsToCsv,
  browserOf,
  campaignOf,
  deviceOf,
  EXPORT_ROWS,
  fillSeries,
  hashShareToken,
  newShareToken,
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
import { analyticsShareTokenSchema } from './cloud.schemas.js';
import { CloudProjectsService } from './cloud-projects.service.js';
import { CloudRepository } from './cloud.repository.js';
import { CloudTeamsService } from './cloud-teams.service.js';

/** A project's numbers for a period: what the console and a shared link both show. */
export interface AnalyticsNumbers {
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

export interface AnalyticsReport extends AnalyticsNumbers {
  enabled: boolean;
  snippet: string;
}

export interface SharedAnalyticsReport extends AnalyticsNumbers {
  project: { name: string };
}

export interface AnalyticsShareStatus {
  enabled: boolean;
  /** Only for team admins; `token` is what the website builds the localized address from. */
  url?: string;
  token?: string;
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
  private readonly box: SecretBox;

  constructor(
    private readonly analytics: CloudAnalyticsRepository,
    private readonly projects: CloudProjectsService,
    private readonly teams: CloudTeamsService,
    private readonly cloud: CloudRepository,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {
    this.box = new SecretBox(config.credentialsSecret, 'cloud-analytics-share-v1');
  }

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

  /**
   * After a project moved to another team: the teams' cached month counts and the hosts that
   * pointed at the project (they carry its team) are read again on the next hit.
   */
  forget(projectId: string, teamIds: string[]): void {
    for (const teamId of teamIds) this.counts.delete(teamId);
    for (const [host, cached] of this.sites) {
      if (cached.site?.id === projectId) this.sites.delete(host);
    }
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
    return {
      enabled: project.analytics,
      snippet: this.snippet,
      ...(await this.numbers(project.id, period)),
    };
  }

  private async numbers(projectId: string, period: AnalyticsPeriod): Promise<AnalyticsNumbers> {
    const { since, unit } = periodRange(period);
    const [totals, series, pages, referrers, browsers, os, devices, events] = await Promise.all([
      this.analytics.totals(projectId, since),
      this.analytics.series(projectId, since, unit),
      this.analytics.top(projectId, since, 'pages'),
      this.analytics.referrers(projectId, since),
      this.analytics.top(projectId, since, 'browsers'),
      this.analytics.top(projectId, since, 'os'),
      this.analytics.top(projectId, since, 'devices'),
      this.analytics.events(projectId, since),
    ]);
    return {
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

  /** The period's page views and events as CSV; works while analytics is off. */
  async csv(
    ctx: CloudCtx,
    projectId: string,
    period: AnalyticsPeriod,
  ): Promise<{ name: string; body: string; truncated: boolean }> {
    const { project } = await this.projects.project(ctx, projectId);
    const { since, unit } = periodRange(period);
    const rows = await this.analytics.exportRows(project.id, since, unit, EXPORT_ROWS + 1);
    const truncated = rows.length > EXPORT_ROWS;
    return {
      name: `${project.slug}-analytics-${period}.csv`,
      body: analyticsToCsv(truncated ? rows.slice(0, EXPORT_ROWS) : rows),
      truncated,
    };
  }

  // ── The shared link (architecture 4.13 "Web analytics" → Shared link) ──────────────────────

  private shareUrl(token: string): string {
    return `${this.config.cloudUrl}/en/analytics/${token}`;
  }

  async shareStatus(ctx: CloudCtx, projectId: string): Promise<AnalyticsShareStatus> {
    const { project, membership } = await this.projects.project(ctx, projectId);
    if (!project.analyticsShareHash || !project.analyticsShareSealed) return { enabled: false };
    if (membership.role === 'MEMBER') return { enabled: true };
    try {
      const token = this.box.open(project.analyticsShareSealed);
      return { enabled: true, url: this.shareUrl(token), token };
    } catch {
      // Sealed with another key: still on, and an admin can replace or stop it.
      this.logger.error(`Project ${project.id}: the shared analytics link couldn't be opened`);
      return { enabled: true };
    }
  }

  /** Creates the link, or replaces it (the old one stops working). */
  async share(ctx: CloudCtx, projectId: string): Promise<{ url: string; token: string }> {
    const { project, membership } = await this.projects.project(ctx, projectId, 'ADMIN');
    const token = newShareToken();
    await this.analytics.setShare(project.id, hashShareToken(token), this.box.seal(token));
    await this.teams.record(ctx, membership.teamId, 'analytics.shared', project.slug);
    return { url: this.shareUrl(token), token };
  }

  async unshare(ctx: CloudCtx, projectId: string): Promise<void> {
    const { project, membership } = await this.projects.project(ctx, projectId, 'ADMIN');
    await this.analytics.setShare(project.id, null, null);
    await this.teams.record(ctx, membership.teamId, 'analytics.unshared', project.slug);
  }

  /** What a shared link shows; unknown, malformed, suspended, deleted or switched off: 404. */
  async sharedReport(token: string, period: AnalyticsPeriod): Promise<SharedAnalyticsReport> {
    const parsed = analyticsShareTokenSchema.safeParse(token);
    const project = parsed.success
      ? await this.analytics.projectByShareHash(hashShareToken(parsed.data))
      : null;
    if (!project?.analytics) throw new NotFoundException('Not found');
    return { project: { name: project.name }, ...(await this.numbers(project.id, period)) };
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
