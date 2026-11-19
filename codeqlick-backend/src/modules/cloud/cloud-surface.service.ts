import { ModuleRef } from '@nestjs/core';
import {
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { toApiLocale, type ApiLocale } from '../../common/schemas/common.schemas.js';
import type { CloudDomain, SurfaceScan } from '../../generated/prisma/client.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { MailService } from '../mail/mail.service.js';
import {
  reportGroups,
  SecurityChecksService,
  type SecurityCheckReport,
  type StoredResult,
} from '../security-checks/security-checks.service.js';
import type { CheckResult } from '../security-checks/security-check-types.js';
import type { CloudCtx } from './cloud-caller.js';
import { cloudSurfaceChangesEmail } from './cloud-emails.js';
import { CloudNotificationsService } from './cloud-notifications.service.js';
import { CloudProjectsService } from './cloud-projects.service.js';
import { CloudTeamsService } from './cloud-teams.service.js';
import {
  boundChange,
  changeText,
  computeChanges,
  nextSurfaceScan,
  readSnapshot,
  storedChecks,
  surfaceErrorCode,
  surfaceFailureText,
  surfaceSkipReason,
  toStoredChecks,
  SURFACE_HISTORY,
  SURFACE_KEEP_DAYS,
  SURFACE_SCANS_PER_RUN,
  SURFACE_TIMEOUT_MS,
  type SurfaceChange,
  type SurfaceError,
} from './cloud-surface.js';
import { CloudSurfaceRepository, type SurfaceDomainRow } from './cloud-surface.repository.js';

const MINUTE = 60_000;
const DAY = 86_400_000;

export interface SurfaceScanSummary {
  id: string;
  status: 'DONE' | 'FAILED';
  error: SurfaceError | null;
  score: number | null;
  grade: string | null;
  /** How many changes against the previous DONE scan; 0 for a FAILED one. */
  changes: number;
  createdAt: string;
}

export interface SurfaceView {
  enabled: boolean;
  nextAt: string | null;
  last: SurfaceScanSummary | null;
  scans: SurfaceScanSummary[];
  domain: { id: string; name: string };
}

export interface SurfaceScanView {
  id: string;
  domain: { id: string; name: string };
  project: { slug: string; name: string };
  status: 'DONE' | 'FAILED';
  error: SurfaceError | null;
  failure: string | null;
  score: number | null;
  grade: string | null;
  groups: SecurityCheckReport['groups'];
  snapshot: ReturnType<typeof readSnapshot>;
  changes: SurfaceChange[];
  previous: { id: string; grade: string | null; score: number | null; createdAt: string } | null;
  createdAt: string;
}

const errorOf = (scan: SurfaceScan): SurfaceError | null =>
  scan.status === 'FAILED' ? ((scan.error as SurfaceError | null) ?? 'error') : null;

/** The Surface monitor: the daily passive scans and their alerts (architecture 4.13, decision 144). */
@Injectable()
export class CloudSurfaceService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CloudSurfaceService.name);
  private timer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly repository: CloudSurfaceRepository,
    private readonly moduleRef: ModuleRef,
    private readonly projects: CloudProjectsService,
    private readonly teams: CloudTeamsService,
    private readonly notifications: CloudNotificationsService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * The Security check's service, found at run time: Cloud can't import `SecurityChecksModule`
   * (it would close a cycle with Auth through Leads and Users), so it is looked up in the app.
   */
  private get security(): SecurityChecksService {
    return this.moduleRef.get(SecurityChecksService, { strict: false });
  }

  onApplicationBootstrap(): void {
    if (this.config.isTest) return;
    this.timer = setInterval(() => void this.runScheduled(), MINUTE).unref();
    this.cleanupTimer = setInterval(() => void this.cleanup(), DAY).unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  /** Daily: deletes the scans past their 90 days. */
  async cleanup(now = new Date()): Promise<void> {
    try {
      const deleted = await this.repository.deleteOlderThan(
        new Date(now.getTime() - SURFACE_KEEP_DAYS * DAY),
      );
      if (deleted) this.logger.log(`Deleted ${deleted} old surface scans`);
    } catch (error) {
      this.logger.error(`Surface scans cleanup failed: ${String(error)}`);
    }
  }

  /**
   * Every minute: scans the domains that are due, up to five, one after another, each claimed
   * first by moving its next run on. A tick does nothing while the previous one still runs. Public
   * so the tests can run it.
   */
  async runScheduled(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.repository.due(now, SURFACE_SCANS_PER_RUN).catch((error: unknown) => {
        this.logger.error(`Surface monitor lookup failed: ${String(error)}`);
        return [] as SurfaceDomainRow[];
      });
      for (const domain of due) {
        try {
          await this.scanDomain(domain, now);
        } catch (error) {
          this.logger.error(`Domain ${domain.id}: surface scan failed: ${String(error)}`);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async scanDomain(domain: SurfaceDomainRow, now: Date): Promise<void> {
    if (!domain.surfaceNextAt) return;
    const claimed = await this.repository.claim(
      domain.id,
      domain.surfaceNextAt,
      nextSurfaceScan(domain.id, now),
    );
    // Another process or restart has it, or the monitor was switched off meanwhile.
    if (!claimed) return;
    const reason = surfaceSkipReason(domain);
    if (reason) {
      this.logger.log(`Domain ${domain.id}: surface scan skipped, ${reason}`);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SURFACE_TIMEOUT_MS);
    let row: SurfaceScan;
    try {
      let security: SecurityChecksService;
      try {
        security = this.security;
      } catch (error) {
        this.logger.error(
          `Domain ${domain.id}: the Security check service is missing: ${String(error)}`,
        );
        throw error;
      }
      const scan = await security.scan(domain.name, controller.signal);
      row = await this.repository.createScan({
        domainId: domain.id,
        projectId: domain.projectId,
        teamId: domain.project.teamId,
        status: 'DONE',
        score: scan.score,
        grade: scan.grade,
        result: toStoredChecks(scan.checks) as never,
        snapshot: scan.snapshot as never,
      });
    } catch (error) {
      const code = surfaceErrorCode(error);
      this.logger.warn(`Domain ${domain.id}: surface scan failed (${code}): ${String(error)}`);
      // Stored, never compared and never alerted: downtime is the monitors' business.
      await this.repository.createScan({
        domainId: domain.id,
        projectId: domain.projectId,
        teamId: domain.project.teamId,
        status: 'FAILED',
        error: code,
        result: [],
        snapshot: {},
      });
      return;
    } finally {
      clearTimeout(timer);
    }

    try {
      await this.alert(domain, row);
    } catch (error) {
      this.logger.error(`Domain ${domain.id}: surface alert failed: ${String(error)}`);
    }
  }

  /** Compares the new scan with the previous DONE one and tells people when something changed. */
  private async alert(domain: SurfaceDomainRow, row: SurfaceScan): Promise<void> {
    const previous = await this.repository.previousDone(row);
    if (!previous) return;
    const changes = computeChanges(previous, row);
    if (changes.length === 0) return;
    const { project } = domain;
    for (const admin of await this.notifications.admins(project.teamId)) {
      const locale = toApiLocale(admin.locale);
      await this.mail
        .send(
          cloudSurfaceChangesEmail({
            to: admin.email,
            locale,
            domain: domain.name,
            project: project.name,
            lines: changes.map((change) => changeText(change, locale)),
            grade: row.grade,
            previousGrade: previous.grade,
            scanUrl: `${this.config.cloudUrl}/${locale}/console/${project.team.slug}/${project.slug}/domains/${domain.id}/security?scan=${row.id}`,
            siteUrl: this.config.siteUrl,
          }),
        )
        .catch((error: unknown) => this.logger.warn(`Domain ${domain.id}: ${String(error)}`));
    }
    await this.notifications.surfaceChanged(project.id, {
      domain: domain.name,
      domainId: domain.id,
      scan: row,
      previous,
      changes,
    });
  }

  // ── Reading ───────────────────────────────────────────────────────────────────────────────────

  /** Summaries of `rows` (newest first); the oldest one is compared with `outside`. */
  private summaries(rows: SurfaceScan[], outside: SurfaceScan | null): SurfaceScanSummary[] {
    return rows.map((row, index) => {
      const baseline =
        row.status === 'DONE'
          ? (rows.slice(index + 1).find((older) => older.status === 'DONE') ?? outside)
          : null;
      return {
        id: row.id,
        status: row.status,
        error: errorOf(row),
        score: row.score,
        grade: row.grade,
        changes: baseline ? computeChanges(baseline, row).length : 0,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  /** The newest scan of each domain for the team, for the Domains tab. */
  async lastScans(
    domains: Array<Pick<CloudDomain, 'id'>>,
    teamId: string,
  ): Promise<Map<string, SurfaceScanSummary | null>> {
    const entries = await Promise.all(
      domains.map(async (domain): Promise<[string, SurfaceScanSummary | null]> => {
        const [row] = await this.repository.scans(domain.id, teamId, 1);
        if (!row) return [domain.id, null];
        const baseline = row.status === 'DONE' ? await this.repository.previousDone(row) : null;
        return [domain.id, this.summaries([row], baseline)[0] ?? null];
      }),
    );
    return new Map(entries);
  }

  /** `GET /cloud/projects/:id/domains/:domainId/surface`: the setting and the last 30 scans. */
  async history(ctx: CloudCtx, projectId: string, domainId: string): Promise<SurfaceView> {
    const { project } = await this.projects.project(ctx, projectId);
    const domain = project.domains.find((d) => d.id === domainId);
    if (!domain) throw new NotFoundException('Domain not found');
    const rows = await this.repository.scans(domain.id, project.teamId, SURFACE_HISTORY);
    const oldest = rows.at(-1);
    // One more than listed: the oldest is compared with the DONE scan before it.
    const outside =
      oldest && rows.length === SURFACE_HISTORY ? await this.repository.previousDone(oldest) : null;
    const scans = this.summaries(rows, outside);
    return {
      enabled: domain.surfaceMonitor,
      nextAt: domain.surfaceMonitor ? (domain.surfaceNextAt?.toISOString() ?? null) : null,
      last: scans[0] ?? null,
      scans,
      domain: { id: domain.id, name: domain.name },
    };
  }

  /** `GET /cloud/surface-scans/:id`: a scan with its changes against the previous one. */
  async scan(ctx: CloudCtx, id: string, locale: ApiLocale): Promise<SurfaceScanView> {
    const row = await this.repository.findScan(id);
    if (!row) throw new NotFoundException('Scan not found');
    // A member of the scan's team (the source team after a transfer); anyone else gets a 404.
    await this.teams.accessById(ctx, row.teamId);
    const done = row.status === 'DONE';
    const previous = done ? await this.repository.previousDone(row) : null;
    const result: StoredResult = {
      finalUrl: null,
      checks: done ? (storedChecks(row.result) as CheckResult[]) : [],
      retireFetchedAt: null,
    };
    return {
      id: row.id,
      domain: row.domain,
      project: row.project,
      status: row.status,
      error: errorOf(row),
      failure: done ? null : surfaceFailureText(row.error, locale),
      score: row.score,
      grade: row.grade,
      groups: done ? reportGroups(result, locale) : [],
      snapshot: done ? readSnapshot(row.snapshot) : null,
      changes: previous ? computeChanges(previous, row).map(boundChange) : [],
      previous: previous
        ? {
            id: previous.id,
            grade: previous.grade,
            score: previous.score,
            createdAt: previous.createdAt.toISOString(),
          }
        : null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
