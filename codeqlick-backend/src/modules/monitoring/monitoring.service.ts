import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { accountOf, type AuthUser } from '../../common/types/auth-user.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { ActivityService, type ActivityActor } from '../activity/activity.service.js';
import { MailService, type MailMessage } from '../mail/mail.service.js';
import { siteAlertEmail } from './monitoring-emails.js';
import { MonitoringRepository, type MonitorRow } from './monitoring.repository.js';
import { certificateExpiry, probe } from './site-probe.js';
import { dailyUptime, uptimeRatio, type DayUptime } from './uptime.js';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** How often sites are checked. */
export const CHECK_EVERY_MS = 5 * MINUTE_MS;
/** Certificates are read at most this often. */
const CERT_EVERY_MS = 60 * MINUTE_MS;
/** Warn when the certificate has fewer days than this left. */
const CERT_WARN_DAYS = 14;
const KEEP_CHECKS_MS = 90 * DAY_MS;

export interface MonitorView {
  projectId: string;
  project: string;
  client: string;
  url: string | null;
  enabled: boolean;
  status: 'UNKNOWN' | 'UP' | 'DOWN';
  statusSince: string;
  lastCheckedAt: string | null;
  lastError: string | null;
  certExpiresAt: string | null;
  /** Share of good checks in the last 30 days, or null without checks. */
  uptime30: number | null;
  days: DayUptime[];
}

/** "2 h 5 min", "12 min". */
function duration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / MINUTE_MS));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

/**
 * Uptime monitoring of the client sites the team hosts: every 5 minutes, in the API process,
 * each monitored project's production address is requested; two failures in a row make it DOWN
 * and email the team, and so does its return. Certificates are read hourly and the team is warned
 * 14 days before one expires. Checks are kept 90 days.
 */
@Injectable()
export class MonitoringService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MonitoringService.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly repository: MonitoringRepository,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
    private readonly activity: ActivityService,
  ) {}

  onApplicationBootstrap(): void {
    // Tests run against a shared database and start the app many times: no background work there.
    if (this.config.nodeEnv === 'test') return;
    this.timer = setInterval(() => void this.runDue(), CHECK_EVERY_MS);
    this.timer.unref();
    setTimeout(() => void this.runDue(), 60_000).unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Checks every monitored site. Never throws. */
  async runDue(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const monitor of await this.repository.listDue()) {
        try {
          await this.checkOne(monitor, now);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          this.logger.error(`Check of ${monitor.project.name} failed: ${reason}`);
        }
      }
      await this.repository.prune(new Date(now.getTime() - KEEP_CHECKS_MS));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Monitoring run failed: ${reason}`);
    } finally {
      this.running = false;
    }
  }

  // ---- Admin ----------------------------------------------------------------------------

  async list(now = new Date()): Promise<MonitorView[]> {
    return this.views(await this.repository.listAll(), now);
  }

  async setEnabled(
    actor: ActivityActor,
    projectId: string,
    enabled: boolean,
  ): Promise<MonitorView> {
    const project = await this.repository.findProject(projectId);
    if (!project) throw new NotFoundException('Project not found');
    if (enabled && !project.productionUrl) {
      throw new BadRequestException('Set the project production URL before monitoring it');
    }
    const monitor = await this.repository.upsert(projectId, enabled);
    await this.activity.record(actor, {
      action: enabled ? 'project.monitor_enabled' : 'project.monitor_disabled',
      targetId: projectId,
      targetLabel: project.name,
    });
    if (enabled) await this.checkOne(monitor, new Date());
    return this.viewOf(projectId);
  }

  /** Checks one project's site now (from the admin panel). */
  async checkNow(projectId: string): Promise<MonitorView> {
    const monitor = await this.repository.findByProject(projectId);
    if (!monitor || !monitor.project.productionUrl) throw new NotFoundException('Not monitored');
    await this.checkOne(monitor, new Date(), true);
    return this.viewOf(projectId);
  }

  async getForTeam(projectId: string): Promise<MonitorView | null> {
    const monitor = await this.repository.findByProject(projectId);
    return monitor ? (await this.views([monitor], new Date()))[0]! : null;
  }

  // ---- Portal ---------------------------------------------------------------------------

  /** The client's view; 404 unless it's their project and it is monitored. */
  async getForClient(caller: AuthUser, projectId: string): Promise<MonitorView> {
    const monitor = await this.repository.findByProject(projectId);
    const visible =
      monitor?.enabled &&
      (caller.role === 'ADMIN' || monitor.project.clientId === accountOf(caller));
    if (!monitor || !visible) throw new NotFoundException('Not monitored');
    return (await this.views([monitor], new Date()))[0]!;
  }

  // ---- Helpers --------------------------------------------------------------------------

  private async viewOf(projectId: string): Promise<MonitorView> {
    const view = await this.getForTeam(projectId);
    if (!view) throw new NotFoundException('Not monitored');
    return view;
  }

  /** `force`: read the certificate now too (the admin's "check now"). */
  private async checkOne(monitor: MonitorRow, now: Date, force = false): Promise<void> {
    const url = monitor.project.productionUrl;
    if (!url) return;
    const result = await probe(url);
    await this.repository.addCheck({
      monitorId: monitor.id,
      checkedAt: now,
      ok: result.ok,
      statusCode: result.statusCode,
      responseMs: result.responseMs,
      error: result.error,
    });

    const site = { project: monitor.project.name, client: monitor.project.client.name, url };
    const adminUrl = `${this.config.siteUrl}/es/admin/monitoring`;
    const failures = result.ok ? 0 : monitor.failures + 1;
    let status = monitor.status;
    let statusSince = monitor.statusSince;
    if (result.ok && monitor.status !== 'UP') {
      if (monitor.status === 'DOWN') {
        this.send(
          siteAlertEmail(
            this.config.leadsNotifyTo,
            site,
            { kind: 'up', downFor: duration(now.getTime() - monitor.statusSince.getTime()) },
            adminUrl,
            this.config.siteUrl,
          ),
        );
      }
      status = 'UP';
      statusSince = now;
    } else if (!result.ok && failures >= 2 && monitor.status !== 'DOWN') {
      // Two in a row: a deploy's restart or a network blip doesn't page anyone.
      this.send(
        siteAlertEmail(
          this.config.leadsNotifyTo,
          site,
          { kind: 'down', error: result.error ?? 'no answer' },
          adminUrl,
          this.config.siteUrl,
        ),
      );
      status = 'DOWN';
      statusSince = new Date(now.getTime() - (failures - 1) * CHECK_EVERY_MS);
    }

    let certExpiresAt = monitor.certExpiresAt;
    let certCheckedAt = monitor.certCheckedAt;
    let certWarnedFor = monitor.certWarnedFor;
    if (force || !certCheckedAt || now.getTime() - certCheckedAt.getTime() >= CERT_EVERY_MS) {
      certExpiresAt = await certificateExpiry(url);
      certCheckedAt = now;
      const daysLeft = certExpiresAt
        ? Math.floor((certExpiresAt.getTime() - now.getTime()) / DAY_MS)
        : null;
      const alreadyWarned =
        certWarnedFor && certExpiresAt && certWarnedFor.getTime() === certExpiresAt.getTime();
      if (daysLeft !== null && daysLeft < CERT_WARN_DAYS && !alreadyWarned) {
        this.send(
          siteAlertEmail(
            this.config.leadsNotifyTo,
            site,
            { kind: 'cert', days: Math.max(0, daysLeft) },
            adminUrl,
            this.config.siteUrl,
          ),
        );
        certWarnedFor = certExpiresAt;
      }
    }

    await this.repository.update(monitor.id, {
      status,
      statusSince,
      failures,
      lastCheckedAt: now,
      lastError: result.error,
      certExpiresAt,
      certCheckedAt,
      certWarnedFor,
    });
  }

  private async views(monitors: MonitorRow[], now: Date): Promise<MonitorView[]> {
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const checks = await this.repository.checksSince(
      monitors.map((monitor) => monitor.id),
      since,
    );
    return monitors.map((monitor) => {
      const own = checks.filter((check) => check.monitorId === monitor.id);
      return {
        projectId: monitor.projectId,
        project: monitor.project.name,
        client: monitor.project.client.name,
        url: monitor.project.productionUrl,
        enabled: monitor.enabled,
        status: monitor.status,
        statusSince: monitor.statusSince.toISOString(),
        lastCheckedAt: monitor.lastCheckedAt?.toISOString() ?? null,
        lastError: monitor.lastError,
        certExpiresAt: monitor.certExpiresAt?.toISOString() ?? null,
        uptime30: uptimeRatio(own),
        days: dailyUptime(own, 30, now),
      };
    });
  }

  private send(message: MailMessage): void {
    this.mail.send(message).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Monitoring email failed: ${reason}`);
    });
  }
}
