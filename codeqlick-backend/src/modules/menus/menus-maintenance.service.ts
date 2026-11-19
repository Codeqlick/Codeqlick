import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';
import { REPORT_RETENTION_MONTHS } from './menu-limits.js';
import { MenusRepository } from './menus.repository.js';

/** First run some minutes after start-up, then once a day. */
const FIRST_RUN_DELAY_MS = 5 * 60_000;
const INTERVAL_MS = 24 * 3_600_000;

/** The reports' cut-off: this many months before `now`. */
export function reportsCutoff(now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - REPORT_RETENTION_MONTHS);
  return cutoff;
}

/**
 * The daily job of Menu (architecture 4.20, Retention): reports older than 12 months and the
 * slug redirects that expired are deleted. Runs in the API process (a single instance); off in
 * tests, like the other jobs.
 */
@Injectable()
export class MenusMaintenanceService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MenusMaintenanceService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly repository: MenusRepository,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.nodeEnv === 'test') return;
    this.timer = setTimeout(() => {
      void this.run();
      this.timer = setInterval(() => void this.run(), INTERVAL_MS).unref();
    }, FIRST_RUN_DELAY_MS).unref();
  }

  onApplicationShutdown(): void {
    clearTimeout(this.timer);
  }

  /** Never throws: a failed run is logged and tried again the next day. */
  async run(now = new Date()): Promise<{ reports: number; redirects: number }> {
    try {
      const reports = await this.repository.purgeReportsBefore(reportsCutoff(now));
      const redirects = await this.repository.purgeExpiredRedirects(now);
      if (reports + redirects > 0) {
        this.logger.log(`Deleted ${reports} old menu reports and ${redirects} expired redirects`);
      }
      return { reports, redirects };
    } catch (error) {
      this.logger.error('Menu maintenance failed', error instanceof Error ? error.stack : error);
      return { reports: 0, redirects: 0 };
    }
  }
}
