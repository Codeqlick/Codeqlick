import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';
import {
  SHORT_CALL_SEC,
  STATS_TIME_ZONE,
  VideochatStatsRepository,
} from './videochat-stats.repository.js';

const DAY_MS = 86_400_000;
/** Usage data is kept this long, then deleted. */
export const STATS_RETENTION_DAYS = 180;
/** First cleanup shortly after start-up, then twice a day. */
const FIRST_RUN_DELAY_MS = 60_000;
const INTERVAL_MS = 12 * 3_600_000;

export const HISTORY_PERIODS = [7, 30, 90] as const;
export type HistoryPeriod = (typeof HISTORY_PERIODS)[number];

export interface HistoryDay {
  /** `yyyy-mm-dd` in Europe/Madrid. */
  date: string;
  activeUsers: number;
  newMembers: number;
  calls: number;
  /** Calls of a minute or more. */
  longCalls: number;
  avgDurationSec: number | null;
  avgWaitSec: number | null;
  reports: number;
}

export interface VideochatHistory {
  days: HistoryDay[];
  /** Calls started in each hour of the day (0–23, Europe/Madrid) over the period. */
  hours: number[];
  totals: {
    /** Different accounts that used it in the period. */
    activeUsers: number;
    newMembers: number;
    calls: number;
    longCalls: number;
    avgDurationSec: number | null;
    avgWaitSec: number | null;
    reports: number;
    /** Right now. */
    members: number;
    openReports: number;
    suspended: number;
  };
}

/** `yyyy-mm-dd` of `date` in Europe/Madrid. */
export function madridDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: STATS_TIME_ZONE }).format(date);
}

/** `day` (`yyyy-mm-dd`) moved by `days`. */
export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The video chat's usage statistics for the admin (architecture 4.7): anonymous call logs and
 * the days each account came, kept 180 days. Recording never breaks the chat: failures are logged.
 */
@Injectable()
export class VideochatStatsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(VideochatStatsService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly repository: VideochatStatsRepository,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    // Tests start the app many times against a shared database: no background work there.
    if (this.config.nodeEnv === 'test') return;
    this.timer = setTimeout(() => {
      void this.cleanup();
      this.timer = setInterval(() => void this.cleanup(), INTERVAL_MS).unref();
    }, FIRST_RUN_DELAY_MS).unref();
  }

  onApplicationShutdown(): void {
    clearTimeout(this.timer);
  }

  /** The account used the video chat today (fire and forget). */
  markActive(userId: string, now = new Date()): void {
    this.repository.markActive(userId, madridDay(now)).catch((error: unknown) => {
      this.logger.error(`Videochat active day not saved: ${String(error)}`);
    });
  }

  /** A call ended (fire and forget). `waitedMs`: how long the two waited on average. */
  logCall(startedAt: number, endedAt: number, waitedMs: number | null): void {
    this.repository
      .logCall({
        startedAt: new Date(startedAt),
        endedAt: new Date(endedAt),
        durationSec: Math.max(0, Math.round((endedAt - startedAt) / 1000)),
        waitSec: waitedMs === null ? null : Math.max(0, Math.round(waitedMs / 1000)),
      })
      .catch((error: unknown) => {
        this.logger.error(`Videochat call log not saved: ${String(error)}`);
      });
  }

  /**
   * A call ended (fire and forget): counted on both people's day, for the suspicious accounts list
   * (architecture 4.7). `endedBy` hung up or skipped; a short call skipped them `other` fast.
   */
  countCall(startedAt: number, endedAt: number, endedBy: string, other: string): void {
    const short = endedAt - startedAt < SHORT_CALL_SEC * 1000;
    this.repository
      .countCall(madridDay(new Date(endedAt)), [
        { userId: endedBy, short, skippedFast: false },
        { userId: other, short, skippedFast: short },
      ])
      .catch((error: unknown) => {
        this.logger.error(`Videochat call counters not saved: ${String(error)}`);
      });
  }

  /** Never throws: a failed run is logged and retried at the next interval. */
  async cleanup(now = new Date()): Promise<void> {
    try {
      const before = new Date(now.getTime() - STATS_RETENTION_DAYS * DAY_MS);
      const deleted = await this.repository.deleteOlderThan(before, madridDay(before));
      if (deleted > 0) this.logger.log(`Deleted ${deleted} old videochat usage rows`);
    } catch (error) {
      this.logger.error(
        'Videochat statistics cleanup failed',
        error instanceof Error ? error.stack : error,
      );
    }
  }

  /** The last `days` days, today included, every day present (zeros when nothing happened). */
  async history(days: HistoryPeriod, now = new Date()): Promise<VideochatHistory> {
    const today = madridDay(now);
    const from = addDays(today, -(days - 1));
    const data = await this.repository.history(from);
    const byDate = new Map<string, HistoryDay>();
    for (let i = 0; i < days; i++) {
      const date = addDays(from, i);
      byDate.set(date, {
        date,
        activeUsers: 0,
        newMembers: 0,
        calls: 0,
        longCalls: 0,
        avgDurationSec: null,
        avgWaitSec: null,
        reports: 0,
      });
    }
    for (const row of data.active) {
      const day = byDate.get(row.date);
      if (day) day.activeUsers = row.total;
    }
    for (const row of data.calls) {
      const day = byDate.get(row.date);
      if (day) Object.assign(day, row, { date: day.date });
    }
    for (const row of data.members) {
      const day = byDate.get(row.date);
      if (day) day.newMembers = row.total;
    }
    for (const row of data.reports) {
      const day = byDate.get(row.date);
      if (day) day.reports = row.total;
    }
    const hours = Array.from({ length: 24 }, () => 0);
    for (const row of data.hours) if (row.hour >= 0 && row.hour < 24) hours[row.hour] = row.total;
    const list = [...byDate.values()];
    const sum = (key: 'newMembers' | 'reports') => list.reduce((total, day) => total + day[key], 0);
    return {
      days: list,
      hours,
      totals: {
        activeUsers: data.activeTotal,
        newMembers: sum('newMembers'),
        ...data.callTotals,
        reports: sum('reports'),
        ...data.current,
      },
    };
  }
}
