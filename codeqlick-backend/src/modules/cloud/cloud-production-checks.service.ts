import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { toApiLocale } from '../../common/schemas/common.schemas.js';
import type { CloudAudit, CloudProject, CloudTeam } from '../../generated/prisma/client.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { MailService } from '../mail/mail.service.js';
import type { Category } from '../site-audits/site-audit-checks.js';
import type { StoredResult } from '../site-audits/site-audits.service.js';
import type { CloudCtx } from './cloud-caller.js';
import { CloudAuditsRepository } from './cloud-audits.repository.js';
import { CloudAuditsService } from './cloud-audits.service.js';
import { cloudProductionCheckEmail } from './cloud-emails.js';
import { CloudNotificationsService } from './cloud-notifications.service.js';
import {
  compareAudits,
  dropLines,
  HISTORY_WEEKS,
  nextProductionCheck,
  PRODUCTION_CHECKS_PER_RUN,
  skipReason,
  type Drop,
} from './cloud-production-checks.js';
import { CloudProjectsService } from './cloud-projects.service.js';

const MINUTE = 60_000;

export interface ProductionChecksView {
  enabled: boolean;
  nextAt: string | null;
  url: string;
  items: Array<{
    id: string;
    score: number;
    categories: Record<Category, number>;
    createdAt: string;
    dropped: boolean;
  }>;
}

/** The weekly website check of production and its alerts (architecture 4.13, decision 80). */
@Injectable()
export class CloudProductionChecksService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CloudProductionChecksService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly audits: CloudAuditsService,
    private readonly repository: CloudAuditsRepository,
    private readonly projects: CloudProjectsService,
    private readonly notifications: CloudNotificationsService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.isTest) return;
    this.timer = setInterval(() => void this.runScheduled(), MINUTE).unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** The address that is checked: the one Cloud serves, never a custom domain. */
  private address(slug: string): string {
    return `${this.projects.projectUrl(slug)}/`;
  }

  /**
   * Every minute: checks the projects whose week is due, up to five, each claimed first by moving
   * its next run on. A tick does nothing while the previous one still runs. Public so the tests can
   * run it.
   */
  async runScheduled(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.repository
        .dueProductionChecks(now, PRODUCTION_CHECKS_PER_RUN)
        .catch((error: unknown) => {
          this.logger.error(`Production checks lookup failed: ${String(error)}`);
          return [];
        });
      for (const project of due) {
        try {
          await this.check(project, now);
        } catch (error) {
          this.logger.error(`Project ${project.id}: production check failed: ${String(error)}`);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async check(project: CloudProject & { team: CloudTeam }, now: Date): Promise<void> {
    if (!project.productionCheckNextAt) return;
    const claimed = await this.repository.claimProductionCheck(
      project.id,
      project.productionCheckNextAt,
      nextProductionCheck(project.id, now),
    );
    // Another process or restart has it.
    if (!claimed) return;
    const reason = skipReason(project);
    if (reason) {
      this.logger.log(`Project ${project.id}: production check skipped, ${reason}`);
      return;
    }
    let row: CloudAudit;
    try {
      row = await this.audits.runScheduled({
        teamId: project.teamId,
        plan: project.team.plan,
        projectId: project.id,
        url: this.address(project.slug),
      });
    } catch (error) {
      // Past the hourly limit (429), unreachable (422) or over 60 s (504): downtime is the
      // monitors' business, and nothing is retried before next week.
      this.logger.warn(`Project ${project.id}: production check skipped, ${String(error)}`);
      return;
    }
    try {
      await this.alert(project, row);
    } catch (error) {
      this.logger.error(`Project ${project.id}: production check alert failed: ${String(error)}`);
    }
  }

  /** Compares the new audit with the previous scheduled one and tells people when it dropped. */
  private async alert(project: CloudProject & { team: CloudTeam }, row: CloudAudit): Promise<void> {
    const previous = await this.audits.previousScheduled(row);
    if (!previous) return;
    const drop = compareAudits(previous, row);
    if (!drop) return;
    await this.emailAdmins(project, row, previous, drop);
    await this.notifications.auditDropped(project.id, { audit: row, previous, drop });
  }

  private async emailAdmins(
    project: CloudProject & { team: CloudTeam },
    row: CloudAudit,
    previous: CloudAudit,
    drop: Drop,
  ): Promise<void> {
    for (const admin of await this.notifications.admins(project.teamId)) {
      const locale = toApiLocale(admin.locale);
      const report = (id: string) =>
        `${this.config.cloudUrl}/${locale}/console/${project.team.slug}/audits/${id}`;
      await this.mail
        .send(
          cloudProductionCheckEmail({
            to: admin.email,
            locale,
            project: project.name,
            url: row.url,
            from: previous.score,
            scoreNow: row.score,
            lines: dropLines(drop, locale),
            previousAt: previous.createdAt,
            checkedAt: row.createdAt,
            previousReportUrl: report(previous.id),
            reportUrl: report(row.id),
            siteUrl: this.config.siteUrl,
          }),
        )
        .catch((error: unknown) => this.logger.warn(`Project ${project.id}: ${String(error)}`));
    }
  }

  /** `GET /cloud/projects/:id/production-checks`: the setting and the last 12 scheduled checks. */
  async history(ctx: CloudCtx, id: string): Promise<ProductionChecksView> {
    const { project } = await this.projects.project(ctx, id);
    // One more than listed: the oldest one is compared with the check before it.
    const rows = await this.repository.scheduled(project.teamId, project.id, HISTORY_WEEKS + 1);
    return {
      enabled: project.productionChecks,
      nextAt: project.productionChecks
        ? (project.productionCheckNextAt?.toISOString() ?? null)
        : null,
      url: this.address(project.slug),
      items: rows.slice(0, HISTORY_WEEKS).map((row, index) => {
        const before = rows[index + 1];
        return {
          id: row.id,
          score: row.score,
          categories: (row.result as unknown as StoredResult).categories,
          createdAt: row.createdAt.toISOString(),
          dropped: before ? compareAudits(before, row) !== null : false,
        };
      }),
    };
  }
}
