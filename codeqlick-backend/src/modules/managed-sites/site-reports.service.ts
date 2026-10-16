import {
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { toApiLocale } from '../../common/schemas/common.schemas.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { MailService } from '../mail/mail.service.js';
import { uptimeRatio } from '../monitoring/uptime.js';
import { UmamiClient } from '../stats/umami.client.js';
import { ManagedSitesRepository, type SiteRow } from './managed-sites.repository.js';
import {
  REPORT_UMAMI_GRACE_DAY,
  reportPeriod,
  siteReportEmail,
  type ReportPeriod,
  type SiteReport,
} from './site-report.js';

const HOUR_MS = 3_600_000;

/**
 * The monthly report of each managed site live on its domain (architecture 8.2): an hourly check
 * sends last month's from the 1st at 09:00 Madrid time, once per site (`reportedMonth`).
 */
@Injectable()
export class SiteReportsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SiteReportsService.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly repository: ManagedSitesRepository,
    private readonly umami: UmamiClient,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.nodeEnv === 'test') return;
    this.timer = setInterval(() => void this.runDue(), HOUR_MS);
    this.timer.unref();
    setTimeout(() => void this.runDue(), 240_000).unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Sends last month's report of every site due. Never throws. */
  async runDue(now = new Date()): Promise<void> {
    const period = reportPeriod(now);
    if (this.running || !period.open) return;
    this.running = true;
    try {
      for (const site of await this.repository.reportsDue(period.month)) {
        try {
          // A site that started after the month has nothing to tell about it.
          if (site.createdAt >= period.end) {
            await this.repository.update(site.id, { reportedMonth: period.month });
            continue;
          }
          // Umami not answering: try again next hour, and from the grace day send it without visits.
          const report = await this.reportOf(site, period, period.today >= REPORT_UMAMI_GRACE_DAY);
          if (!report) continue;
          await this.send(site, report);
          await this.repository.update(site.id, { reportedMonth: period.month });
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          this.logger.error(`Monthly report of ${site.slug} failed: ${reason}`);
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Monthly reports failed: ${reason}`);
    } finally {
      this.running = false;
    }
  }

  /** Sends last month's report of the project's site now (admin panel); the people emailed. */
  async sendNow(projectId: string, now = new Date()): Promise<number> {
    const site = await this.repository.findByProject(projectId);
    if (!site) throw new NotFoundException('Website not found');
    const period = reportPeriod(now);
    return this.send(site, (await this.reportOf(site, period, true))!);
  }

  /** Null when the site has statistics but Umami didn't answer (unless `anyway`). */
  private async reportOf(
    site: SiteRow,
    period: ReportPeriod,
    anyway = false,
  ): Promise<SiteReport | null> {
    const [visits, messages, checks] = await Promise.all([
      site.umamiWebsiteId
        ? this.umami.visits(period.days, period.end.getTime(), site.umamiWebsiteId)
        : undefined,
      this.repository.formMessagesBetween(site.projectId, period.first, period.last),
      this.repository.checksBetween(site.projectId, period.start, period.end),
    ]);
    if (visits?.enabled && !visits.available && !anyway) return null;
    return {
      projectId: site.projectId,
      site: site.domain ?? site.project.name,
      month: period.month,
      visits: visits?.available
        ? {
            visitors: visits.totals.visitors,
            pageviews: visits.totals.pageviews,
            previousVisitors: visits.previousVisitors,
            sources: visits.referrers.filter((item) => item.source).slice(0, 3),
          }
        : null,
      messages,
      uptime: uptimeRatio(checks),
    };
  }

  /** To every active person of the client account who wants it, each in their language. */
  private async send(site: SiteRow, report: SiteReport): Promise<number> {
    let sent = 0;
    for (const person of await this.repository.reportRecipients(site.project.client.id)) {
      const locale = toApiLocale(person.locale);
      const base = `${this.config.siteUrl}/${locale}/portal`;
      try {
        await this.mail.send(
          siteReportEmail({ name: person.name, email: person.email, locale }, report, {
            project: `${base}/projects/${site.projectId}`,
            account: `${base}/account`,
            site: this.config.siteUrl,
          }),
        );
        sent += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.error(`Monthly report to ${person.email} failed: ${reason}`);
      }
    }
    if (sent > 0) this.logger.log(`Monthly report of ${site.slug} sent to ${sent} people`);
    return sent;
  }
}
