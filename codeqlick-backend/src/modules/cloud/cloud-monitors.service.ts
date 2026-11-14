import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { toApiLocale } from '../../common/schemas/common.schemas.js';
import type { CloudMonitor, CloudMonitorStatus } from '../../generated/prisma/client.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { MailService } from '../mail/mail.service.js';
import { assertCheckableUrl, safeFetch } from '../site-audits/safe-fetch.js';
import type { CloudCtx } from './cloud-caller.js';
import { cloudMonitorEmail } from './cloud-emails.js';
import { CloudMonitorsRepository, type MonitorWithTeam } from './cloud-monitors.repository.js';
import { CloudNotificationsService } from './cloud-notifications.service.js';
import { CLOUD_PLANS } from './cloud-plans.js';
import type { CreateMonitorInput, StatusPageInput, UpdateMonitorInput } from './cloud.schemas.js';
import { slowStep } from './cloud-slow.js';
import { CloudTeamsService } from './cloud-teams.service.js';
import {
  dailyUptime,
  incidents,
  overall,
  uptime,
  type DayUptime,
  type Incident,
  type MonitorState,
  type StateChange,
} from './cloud-uptime.js';

export interface MonitorView {
  id: string;
  name: string;
  kind: 'HTTP' | 'HEARTBEAT';
  url: string | null;
  /** Heartbeats: the URL the job calls. */
  heartbeatUrl: string | null;
  periodMinutes: number | null;
  graceMinutes: number | null;
  projectId: string | null;
  enabled: boolean;
  status: MonitorState;
  statusSince: string;
  lastCheckedAt: string | null;
  lastPingAt: string | null;
  deadlineAt: string | null;
  lastError: string | null;
  certExpiresAt: string | null;
  /** HTTP: alert above this many ms (null = off). */
  slowMs: number | null;
  /** Set while a slow episode lasts. */
  slowSince: string | null;
  alertIds: string[];
  createdAt: string;
}

export interface MonitorDetail extends MonitorView {
  checks: Array<{
    at: string;
    ok: boolean;
    statusCode: number | null;
    responseMs: number | null;
    error: string | null;
  }>;
  uptime30: number | null;
  days: DayUptime[];
  incidents: Incident[];
}

export interface StatusPageSettings {
  enabled: boolean;
  title: string;
  intro: string | null;
  items: Array<{ monitorId: string; label: string }>;
}

export interface PublicStatus {
  title: string;
  intro: string | null;
  overall: 'operational' | 'partial' | 'major' | 'unknown';
  updatedAt: string;
  monitors: Array<{
    label: string;
    status: MonitorState;
    uptime90: number | null;
    days: DayUptime[];
    incidents: Incident[];
  }>;
}

const MINUTE = 60_000;
const DAY = 86_400_000;
const CHECK_EVERY = 5 * MINUTE;
const ALERT_GAP = 15 * MINUTE;
const CERT_WARN_DAYS = 14;
const newKey = () => `cqh_${randomBytes(16).toString('base64url')}`;

/** Monitors, heartbeats and status pages of Cloud teams (architecture 4.13; decisions 38, 39). */
@Injectable()
export class CloudMonitorsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CloudMonitorsService.name);
  private timer?: NodeJS.Timeout;
  private daily?: NodeJS.Timeout;
  private running = false;
  /** Public status JSON for 60 s per team. */
  private readonly cache = new Map<string, { at: number; value: PublicStatus }>();

  constructor(
    private readonly repository: CloudMonitorsRepository,
    private readonly teams: CloudTeamsService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
    private readonly notifications: CloudNotificationsService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.isTest) return;
    this.timer = setInterval(() => void this.tick(), MINUTE).unref();
    this.daily = setInterval(() => void this.cleanup(), DAY).unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.daily) clearInterval(this.daily);
  }

  heartbeatUrl(key: string): string {
    return `${this.config.publicApiUrl}/cloud/heartbeats/${key}`;
  }

  view(monitor: CloudMonitor): MonitorView {
    return {
      id: monitor.id,
      name: monitor.name,
      kind: monitor.kind,
      url: monitor.url,
      heartbeatUrl: monitor.key ? this.heartbeatUrl(monitor.key) : null,
      periodMinutes: monitor.periodMinutes,
      graceMinutes: monitor.graceMinutes,
      projectId: monitor.projectId,
      enabled: monitor.enabled,
      status: monitor.status,
      statusSince: monitor.statusSince.toISOString(),
      lastCheckedAt: monitor.lastCheckedAt?.toISOString() ?? null,
      lastPingAt: monitor.lastPingAt?.toISOString() ?? null,
      deadlineAt: monitor.deadlineAt?.toISOString() ?? null,
      lastError: monitor.lastError,
      certExpiresAt: monitor.certExpiresAt?.toISOString() ?? null,
      slowMs: monitor.slowMs,
      slowSince: monitor.slowMs === null ? null : (monitor.slowSince?.toISOString() ?? null),
      alertIds: monitor.alertIds,
      createdAt: monitor.createdAt.toISOString(),
    };
  }

  // ── Managing monitors ──────────────────────────────────────────────────────────────────────

  private checkUrl(raw: string): string {
    try {
      const url = new URL(raw);
      assertCheckableUrl(url);
      return url.toString();
    } catch {
      throw new BadRequestException(
        'Use an http(s) address on port 80 or 443, without a user or password',
      );
    }
  }

  private async checkAlertees(teamId: string, ids: string[]): Promise<string[]> {
    const unique = [...new Set(ids)];
    if ((await this.repository.membersAmong(teamId, unique)).length !== unique.length) {
      throw new BadRequestException('Alerts go to members of the team');
    }
    return unique;
  }

  private async monitor(ctx: CloudCtx, id: string, min: 'MEMBER' | 'ADMIN' = 'MEMBER') {
    const monitor = await this.repository.find(id);
    if (!monitor) throw new NotFoundException('Monitor not found');
    await this.teams.accessById(ctx, monitor.teamId, min);
    return monitor;
  }

  async list(ctx: CloudCtx, teamSlug: string): Promise<MonitorView[]> {
    const membership = await this.teams.access(ctx, teamSlug);
    return (await this.repository.list(membership.teamId)).map((m) => this.view(m));
  }

  async create(
    ctx: CloudCtx,
    teamSlug: string,
    input: CreateMonitorInput,
    now = new Date(),
  ): Promise<MonitorView> {
    const membership = await this.teams.access(ctx, teamSlug, 'ADMIN');
    const teamId = membership.teamId;
    const limit = CLOUD_PLANS[membership.team.plan].monitorsPerTeam;
    if ((await this.repository.count(teamId)) >= limit) {
      throw new ConflictException(`A team has at most ${limit} monitors`);
    }
    if (input.projectId && !(await this.repository.projectInTeam(input.projectId, teamId))) {
      throw new NotFoundException('Project not found');
    }
    if (input.kind === 'HEARTBEAT' && typeof input.slowMs === 'number') {
      throw new BadRequestException('Only HTTP monitors can alert on slow responses');
    }
    const alertIds = await this.checkAlertees(teamId, input.alertIds);
    const monitor = await this.repository.create(
      input.kind === 'HTTP'
        ? {
            teamId,
            projectId: input.projectId ?? null,
            name: input.name,
            kind: 'HTTP',
            url: this.checkUrl(input.url),
            slowMs: input.slowMs ?? null,
            alertIds,
          }
        : {
            teamId,
            projectId: input.projectId ?? null,
            name: input.name,
            kind: 'HEARTBEAT',
            key: newKey(),
            periodMinutes: input.periodMinutes,
            graceMinutes: input.graceMinutes,
            deadlineAt: new Date(
              now.getTime() + (input.periodMinutes + input.graceMinutes) * MINUTE,
            ),
            alertIds,
          },
    );
    await this.teams.record(ctx, teamId, 'monitor.created', monitor.name, { kind: monitor.kind });
    return this.view(monitor);
  }

  async update(
    ctx: CloudCtx,
    id: string,
    input: UpdateMonitorInput,
    now = new Date(),
  ): Promise<MonitorView> {
    const monitor = await this.monitor(ctx, id, 'ADMIN');
    const data: Parameters<CloudMonitorsRepository['update']>[1] = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.alertIds) data.alertIds = await this.checkAlertees(monitor.teamId, input.alertIds);
    if (monitor.kind === 'HEARTBEAT' && typeof input.slowMs === 'number') {
      throw new BadRequestException('Only HTTP monitors can alert on slow responses');
    }
    // Changing or clearing the threshold, changing the URL or pausing ends a slow episode silently.
    let resetSlow = false;
    if (input.url !== undefined && monitor.kind === 'HTTP') {
      data.url = this.checkUrl(input.url);
      data.failures = 0;
      if (data.url !== monitor.url) resetSlow = true;
    }
    if (input.slowMs !== undefined && monitor.kind === 'HTTP' && input.slowMs !== monitor.slowMs) {
      data.slowMs = input.slowMs;
      resetSlow = true;
    }
    const period = input.periodMinutes ?? monitor.periodMinutes;
    const grace = input.graceMinutes ?? monitor.graceMinutes;
    if (monitor.kind === 'HEARTBEAT' && (input.periodMinutes || input.graceMinutes)) {
      data.periodMinutes = period;
      data.graceMinutes = grace;
      data.deadlineAt = new Date(
        (monitor.lastPingAt ?? now).getTime() + ((period ?? 0) + (grace ?? 0)) * MINUTE,
      );
    }
    if (input.enabled !== undefined && input.enabled !== monitor.enabled) {
      data.enabled = input.enabled;
      const status: CloudMonitorStatus = input.enabled ? 'UNKNOWN' : 'PAUSED';
      data.status = status;
      data.statusSince = now;
      data.failures = 0;
      if (!input.enabled) resetSlow = true;
      if (input.enabled && monitor.kind === 'HEARTBEAT') {
        data.deadlineAt = new Date(now.getTime() + ((period ?? 0) + (grace ?? 0)) * MINUTE);
      }
      await this.repository.event(monitor.id, status, now);
    }
    if (resetSlow) {
      data.slowSince = null;
      data.slowCount = 0;
    }
    const updated = await this.repository.update(monitor.id, data);
    await this.teams.record(ctx, monitor.teamId, 'monitor.updated', updated.name);
    return this.view(updated);
  }

  async remove(ctx: CloudCtx, id: string): Promise<void> {
    const monitor = await this.monitor(ctx, id, 'ADMIN');
    await this.repository.remove(monitor.id);
    await this.teams.record(ctx, monitor.teamId, 'monitor.deleted', monitor.name);
  }

  async detail(ctx: CloudCtx, id: string, now = new Date()): Promise<MonitorDetail> {
    const monitor = await this.monitor(ctx, id);
    const [checks, events] = await Promise.all([
      this.repository.checksSince(monitor.id, new Date(now.getTime() - DAY)),
      this.repository.eventsSince([monitor.id], new Date(now.getTime() - 90 * DAY)),
    ]);
    return {
      ...this.view(monitor),
      checks: checks.map((c) => ({
        at: c.checkedAt.toISOString(),
        ok: c.ok,
        statusCode: c.statusCode,
        responseMs: c.responseMs,
        error: c.error,
      })),
      uptime30: uptime(events, new Date(now.getTime() - 30 * DAY), now),
      days: dailyUptime(events, 90, now),
      incidents: incidents(events, new Date(now.getTime() - 30 * DAY), now),
    };
  }

  // ── State changes and alerts ───────────────────────────────────────────────────────────────

  /** Moves a monitor to `status` (recording the event) and alerts when it went down or came back. */
  private async transition(
    monitor: MonitorWithTeam,
    status: 'UP' | 'DOWN',
    now: Date,
    error: string | null,
    extra: Parameters<CloudMonitorsRepository['update']>[1] = {},
  ): Promise<void> {
    const changed = monitor.status !== status;
    const data: Parameters<CloudMonitorsRepository['update']>[1] = { ...extra, lastError: error };
    // Going down ends any slow episode silently: the down alert says enough.
    if (status === 'DOWN') {
      data.slowSince = null;
      data.slowCount = 0;
    }
    if (changed) {
      data.status = status;
      data.statusSince = now;
      await this.repository.event(monitor.id, status, now, error);
    }
    // Back UP from UNKNOWN is the first result, not a recovery: no email.
    const alert = changed && (status === 'DOWN' || monitor.status === 'DOWN');
    const last = status === 'DOWN' ? monitor.lastDownAlertAt : monitor.lastUpAlertAt;
    const send = alert && (!last || now.getTime() - last.getTime() >= ALERT_GAP);
    if (send) data[status === 'DOWN' ? 'lastDownAlertAt' : 'lastUpAlertAt'] = now;
    await this.repository.update(monitor.id, data);
    if (send) {
      const minutes =
        status === 'UP'
          ? Math.round((now.getTime() - monitor.statusSince.getTime()) / MINUTE)
          : undefined;
      void this.alert(monitor, status === 'DOWN' ? 'down' : 'up', error, { minutes });
    }
  }

  private async alert(
    monitor: MonitorWithTeam,
    kind: 'down' | 'up' | 'cert' | 'slow' | 'fast',
    error: string | null,
    extra: { minutes?: number; certExpires?: Date; responseMs?: number; slowMs?: number },
  ): Promise<void> {
    // A monitor tied to a project also tells its Slack, Discord and webhook channels that asked
    // for monitor alerts (decision 64), in the background like these emails.
    if (monitor.projectId) void this.notifications.monitorAlert(monitor, kind, error, extra);
    try {
      for (const person of await this.repository.alertees(monitor.teamId, monitor.alertIds)) {
        const locale = toApiLocale(person.locale);
        await this.mail.send(
          cloudMonitorEmail({
            to: person.email,
            locale,
            kind,
            monitor: monitor.name,
            target: monitor.url ?? (locale === 'es' ? 'tarea programada' : 'scheduled job'),
            team: monitor.team.name,
            error,
            minutes: extra.minutes,
            responseMs: extra.responseMs,
            slowMs: extra.slowMs,
            certExpires: extra.certExpires
              ? new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
                  dateStyle: 'long',
                  timeZone: 'Europe/Madrid',
                }).format(extra.certExpires)
              : undefined,
            url: `${this.config.cloudUrl}/${locale}/console/${monitor.team.slug}/monitors/${monitor.id}`,
            siteUrl: this.config.siteUrl,
          }),
        );
      }
    } catch (failure) {
      this.logger.error(`Monitor ${monitor.id}: the alert couldn't be sent: ${String(failure)}`);
    }
  }

  // ── The engine ─────────────────────────────────────────────────────────────────────────────

  /** Every minute: HTTP checks due and late heartbeats. */
  async tick(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const monitor of await this.repository.dueHttp(
        new Date(now.getTime() - CHECK_EVERY + 10_000),
        10,
      )) {
        if (!(await this.repository.claim(monitor.id, monitor.lastCheckedAt, now))) continue;
        await this.checkHttp(monitor, now).catch((error: unknown) =>
          this.logger.warn(`Monitor ${monitor.id} check failed: ${String(error)}`),
        );
      }
      for (const monitor of await this.repository.lateHeartbeats(now)) {
        const late = monitor.lastPingAt
          ? `No call since ${monitor.lastPingAt.toISOString()}`
          : 'No call yet';
        await this.repository.check(monitor.id, { ok: false, error: late }, now);
        await this.transition(monitor, 'DOWN', now, late);
      }
    } catch (error) {
      this.logger.error(`Cloud monitors tick failed: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }

  /** One HTTP check through the website check's safe fetching (no private addresses, decision 38). */
  async checkHttp(monitor: MonitorWithTeam, now = new Date()): Promise<void> {
    if (!monitor.url) return;
    let result: {
      ok: boolean;
      statusCode: number | null;
      responseMs: number | null;
      error: string | null;
    };
    let certificate: Date | null = null;
    const started = Date.now();
    try {
      const page = await safeFetch(monitor.url, {
        timeoutMs: 15_000,
        maxBytes: 64 * 1024,
        maxRedirects: 5,
      });
      certificate = page.certificateValidTo;
      const ok = page.status < 400;
      result = {
        ok,
        statusCode: page.status,
        responseMs: Date.now() - started,
        error: ok ? null : `HTTP ${page.status}`,
      };
    } catch (error) {
      const reason =
        error instanceof Error
          ? ((error.cause as Error | undefined)?.message ?? error.message)
          : String(error);
      result = { ok: false, statusCode: null, responseMs: null, error: reason.slice(0, 300) };
    }
    await this.repository.check(monitor.id, result, now);

    const extra: Parameters<CloudMonitorsRepository['update']>[1] = {};
    // A check that raced a PATCH reset (threshold cleared) clears the leftovers here.
    if (!monitor.slowMs && (monitor.slowSince || monitor.slowCount)) {
      extra.slowSince = null;
      extra.slowCount = 0;
    }
    if (
      certificate &&
      (!monitor.certCheckedAt || now.getTime() - monitor.certCheckedAt.getTime() >= 60 * MINUTE)
    ) {
      extra.certExpiresAt = certificate;
      extra.certCheckedAt = now;
      const warn = certificate.getTime() - now.getTime() < CERT_WARN_DAYS * DAY;
      if (warn && monitor.certWarnedFor?.getTime() !== certificate.getTime()) {
        extra.certWarnedFor = certificate;
        void this.alert(monitor, 'cert', null, { certExpires: certificate });
      }
    }
    if (result.ok) {
      // Slow-response episodes: only successful checks with a response time count.
      let slowAlert: { kind: 'slow' | 'fast'; minutes?: number } | null = null;
      if (monitor.slowMs && result.responseMs !== null) {
        const step = slowStep(monitor, result.responseMs, monitor.slowMs, now);
        extra.slowCount = step.slowCount;
        extra.slowSince = step.slowSince;
        if (step.alert) {
          slowAlert = {
            kind: step.alert,
            minutes:
              step.alert === 'fast' && monitor.slowSince
                ? Math.round((now.getTime() - monitor.slowSince.getTime()) / MINUTE)
                : undefined,
          };
        }
      }
      await this.transition(monitor, 'UP', now, null, { ...extra, failures: 0 });
      if (slowAlert) {
        void this.alert(monitor, slowAlert.kind, null, {
          minutes: slowAlert.minutes,
          responseMs: result.responseMs ?? undefined,
          slowMs: monitor.slowMs ?? undefined,
        });
      }
    } else {
      const failures = monitor.failures + 1;
      // DOWN after two failures in a row; the first one only counts.
      if (failures >= 2)
        await this.transition(monitor, 'DOWN', now, result.error, { ...extra, failures });
      else
        await this.repository.update(monitor.id, { ...extra, failures, lastError: result.error });
    }
  }

  /** A scheduled job's call: on time (UP) or reporting a failure (DOWN). */
  async ping(key: string, failed: boolean, now = new Date()): Promise<{ ok: true }> {
    const monitor = await this.repository.findByKey(key);
    if (!monitor || !monitor.enabled) throw new NotFoundException('Heartbeat not found');
    const deadlineAt = new Date(
      now.getTime() + ((monitor.periodMinutes ?? 0) + (monitor.graceMinutes ?? 0)) * MINUTE,
    );
    const error = failed ? 'The job reported a failure' : null;
    await this.repository.check(monitor.id, { ok: !failed, error }, now);
    await this.transition(monitor, failed ? 'DOWN' : 'UP', now, error, {
      lastPingAt: now,
      lastCheckedAt: now,
      deadlineAt,
    });
    return { ok: true };
  }

  async cleanup(now = new Date()): Promise<void> {
    try {
      await this.repository.deleteChecksBefore(new Date(now.getTime() - 90 * DAY));
      await this.repository.deleteEventsBefore(new Date(now.getTime() - 400 * DAY));
    } catch (error) {
      this.logger.error(`Cloud monitors cleanup failed: ${String(error)}`);
    }
  }

  // ── Status pages ───────────────────────────────────────────────────────────────────────────

  async statusPage(ctx: CloudCtx, teamSlug: string): Promise<StatusPageSettings> {
    const membership = await this.teams.access(ctx, teamSlug);
    const page = await this.repository.statusPage(membership.teamId);
    return page
      ? {
          enabled: page.enabled,
          title: page.title,
          intro: page.intro,
          items: page.items as StatusPageSettings['items'],
        }
      : { enabled: false, title: membership.team.name, intro: null, items: [] };
  }

  async saveStatusPage(
    ctx: CloudCtx,
    teamSlug: string,
    input: StatusPageInput,
  ): Promise<StatusPageSettings> {
    const membership = await this.teams.access(ctx, teamSlug, 'ADMIN');
    const ids = [...new Set(input.items.map((item) => item.monitorId))];
    const found = await this.repository.monitorsByIds(membership.teamId, ids);
    if (found.length !== ids.length)
      throw new BadRequestException('Every item must be a monitor of the team');
    const items = ids.map((id) => ({
      monitorId: id,
      label: input.items.find((i) => i.monitorId === id)!.label,
    }));
    const page = await this.repository.saveStatusPage(membership.teamId, {
      enabled: input.enabled,
      title: input.title,
      intro: input.intro || null,
      items,
    });
    this.cache.delete(teamSlug);
    await this.teams.record(ctx, membership.teamId, 'status_page.saved', page.title, {
      enabled: page.enabled,
    });
    return { enabled: page.enabled, title: page.title, intro: page.intro, items };
  }

  /** The public status of a team (cached 60 s); 404 without an enabled page. */
  async publicStatus(teamSlug: string, now = new Date()): Promise<PublicStatus> {
    const cached = this.cache.get(teamSlug);
    if (cached && now.getTime() - cached.at < 60_000) return cached.value;
    const page = await this.repository.publicPage(teamSlug);
    if (!page) throw new NotFoundException('Status page not found');
    const items = page.items as StatusPageSettings['items'];
    const monitors = await this.repository.monitorsByIds(
      page.team.id,
      items.map((i) => i.monitorId),
    );
    const events = await this.repository.eventsSince(
      monitors.map((m) => m.id),
      new Date(now.getTime() - 90 * DAY),
    );
    const byMonitor = (id: string): StateChange[] => events.filter((e) => e.monitorId === id);
    const rows = items
      .map((item) => ({ item, monitor: monitors.find((m) => m.id === item.monitorId) }))
      .filter(
        (row): row is { item: (typeof items)[number]; monitor: CloudMonitor } => !!row.monitor,
      )
      .map(({ item, monitor }) => ({
        label: item.label,
        status: monitor.status,
        uptime90: uptime(byMonitor(monitor.id), new Date(now.getTime() - 90 * DAY), now),
        days: dailyUptime(byMonitor(monitor.id), 90, now),
        incidents: incidents(byMonitor(monitor.id), new Date(now.getTime() - 14 * DAY), now),
      }));
    const value: PublicStatus = {
      title: page.title,
      intro: page.intro,
      overall: overall(rows.map((r) => r.status)),
      updatedAt: now.toISOString(),
      monitors: rows,
    };
    this.cache.set(teamSlug, { at: now.getTime(), value });
    return value;
  }

  /** A small SVG badge with the overall state. */
  async badge(teamSlug: string): Promise<string> {
    const status = await this.publicStatus(teamSlug);
    const [text, color] = {
      operational: ['operational', '#1e7a4a'],
      partial: ['partial outage', '#b26b00'],
      major: ['major outage', '#b3261e'],
      unknown: ['unknown', '#5c5768'],
    }[status.overall];
    const left = 'status';
    const lw = 6 * left.length + 12;
    const rw = 6.5 * text.length + 12;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + rw}" height="20" role="img" aria-label="${left}: ${text}"><title>${left}: ${text}</title><rect width="${lw}" height="20" fill="#14101f"/><rect x="${lw}" width="${rw}" height="20" fill="${color}"/><g fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle"><text x="${lw / 2}" y="14">${left}</text><text x="${lw + rw / 2}" y="14">${text}</text></g></svg>`;
  }
}
