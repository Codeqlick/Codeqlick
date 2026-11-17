import { Injectable, Logger } from '@nestjs/common';
import { readDiskSpace, type DiskReading } from '../../common/disk-space.js';
import { STATS_CACHE_MS, statsWeekStarts, TimedCache } from '../../common/stats-weeks.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { AdminOverviewRepository } from './admin-overview.repository.js';
import { buildOverview, type AdminOverview } from './admin-overview.rules.js';

/**
 * The admin overview (architecture 4.17, decision 122): the whole platform's people, revenue,
 * activity and health over the last 12 Madrid weeks, computed in SQL on request and kept 10
 * minutes in memory.
 */
@Injectable()
export class AdminOverviewService {
  private readonly logger = new Logger(AdminOverviewService.name);
  private readonly cache = new TimedCache<AdminOverview>(STATS_CACHE_MS);

  constructor(
    private readonly repository: AdminOverviewRepository,
    private readonly config: AppConfigService,
  ) {}

  /** Forgets the cached figures (the next request computes them again). */
  clearCache(): void {
    this.cache.clear();
  }

  async overview(now = new Date()): Promise<AdminOverview> {
    const cached = this.cache.get(now);
    if (cached) return cached;
    const starts = statsWeekStarts(now);
    const [data, disk] = await Promise.all([this.repository.overview(starts[0]!), this.disk()]);
    const overview = buildOverview({ starts, ...data, disk, now });
    this.cache.set(overview, now);
    return overview;
  }

  /**
   * The disk guard's reading (decision 49) of the disk holding Cloud's folder, or the uploads'
   * when Cloud's hosting isn't set up (the same disk on the single server); null if unreadable.
   */
  private async disk(): Promise<DiskReading | null> {
    const path = this.config.cloudHosting?.root ?? this.config.uploadsDir;
    try {
      return await readDiskSpace(path, this.config.cloudDisk);
    } catch (error) {
      this.logger.warn(`The disk couldn't be read: ${String(error)}`);
      return null;
    }
  }
}
