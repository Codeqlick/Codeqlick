import { Injectable } from '@nestjs/common';
import { CruisingStatsRepository } from './cruising-stats.repository.js';
import {
  roundHours,
  STATS_CACHE_MS,
  STATS_CHECK_IN_DAYS,
  STATS_TOP,
  statsWeekStarts,
  TimedCache,
} from './cruising-stats.rules.js';

/** One week of Cruising (Monday to Sunday, Europe/Madrid). */
export interface CruisingStatsWeek {
  /** The Monday, `yyyy-mm-dd`. */
  start: string;
  /** Members who entered (profiles created). */
  members: number;
  /** Distinct members who did anything: check-ins, reviews, messages, spots, media, meetups. */
  active: number;
  /** Spots proposed or added that week, by their status now (in review, live, rejected). */
  spots: { pending: number; live: number; rejected: number };
  checkIns: number;
  meetups: number;
  messages: number;
  /** City chat messages (decision 100), kept 7 days: older weeks count only those left. */
  roomMessages: number;
  media: number;
  reportsOpened: number;
  reportsDecided: number;
  /** Of the reports decided that week, the median hours from opening to decision. */
  medianDecisionHours: number | null;
  /** Removal requests received. */
  takedowns: number;
}

export interface CruisingCountryStat {
  countryCode: string;
  count: number;
}

export interface CruisingCityStat extends CruisingCountryStat {
  citySlug: string;
  city: string;
}

/** The admin statistics (decision 101): aggregates only, no person listed. */
export interface CruisingStats {
  generatedAt: string;
  weeks: CruisingStatsWeek[];
  /** Top 10 by LIVE spots and by check-ins in the last 30 days. */
  topCountries: { spots: CruisingCountryStat[]; checkIns: CruisingCountryStat[] };
  topCities: { spots: CruisingCityStat[]; checkIns: CruisingCityStat[] };
}

type WeekCounter = Exclude<
  keyof CruisingStatsWeek,
  'start' | 'spots' | 'active' | 'reportsDecided' | 'medianDecisionHours'
>;

const COUNTERS: Record<string, WeekCounter> = {
  members: 'members',
  checkIns: 'checkIns',
  meetups: 'meetups',
  messages: 'messages',
  roomMessages: 'roomMessages',
  media: 'media',
  reportsOpened: 'reportsOpened',
  takedowns: 'takedowns',
};

const SPOT_COUNTERS: Record<string, keyof CruisingStatsWeek['spots']> = {
  spotsPending: 'pending',
  spotsLive: 'live',
  spotsRejected: 'rejected',
};

function emptyWeek(start: string): CruisingStatsWeek {
  return {
    start,
    members: 0,
    active: 0,
    spots: { pending: 0, live: 0, rejected: 0 },
    checkIns: 0,
    meetups: 0,
    messages: 0,
    roomMessages: 0,
    media: 0,
    reportsOpened: 0,
    reportsDecided: 0,
    medianDecisionHours: null,
    takedowns: 0,
  };
}

/**
 * Cruising's admin statistics (architecture 4.15, decision 101): the last 12 weeks and the top
 * places, computed in SQL on request and kept 10 minutes in memory.
 */
@Injectable()
export class CruisingStatsService {
  private readonly cache = new TimedCache<CruisingStats>(STATS_CACHE_MS);

  constructor(private readonly repository: CruisingStatsRepository) {}

  /** Forgets the cached figures (the next request computes them again). */
  clearCache(): void {
    this.cache.clear();
  }

  async stats(now = new Date()): Promise<CruisingStats> {
    const cached = this.cache.get(now);
    if (cached) return cached;
    const starts = statsWeekStarts(now);
    const since = new Date(now.getTime() - STATS_CHECK_IN_DAYS * 24 * 60 * 60 * 1000);
    const data = await this.repository.weekly(starts[0]!, since, STATS_TOP);

    const weeks = new Map(starts.map((start) => [start, emptyWeek(start)]));
    for (const row of data.counts) {
      const week = weeks.get(row.week);
      if (!week) continue;
      const counter = COUNTERS[row.metric];
      const spot = SPOT_COUNTERS[row.metric];
      if (counter) week[counter] += row.total;
      else if (spot) week.spots[spot] += row.total;
    }
    for (const row of data.active) {
      const week = weeks.get(row.week);
      if (week) week.active = row.total;
    }
    for (const row of data.decisions) {
      const week = weeks.get(row.week);
      if (!week) continue;
      week.reportsDecided = row.decided;
      week.medianDecisionHours = roundHours(row.median);
    }

    const stats: CruisingStats = {
      generatedAt: now.toISOString(),
      weeks: [...weeks.values()],
      topCountries: { spots: data.countrySpots, checkIns: data.countryCheckIns },
      topCities: { spots: data.citySpots, checkIns: data.cityCheckIns },
    };
    this.cache.set(stats, now);
    return stats;
  }
}
