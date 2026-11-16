import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Bbox } from './cruising.rules.js';
import { STATS_TIME_ZONE } from './cruising-stats.rules.js';

/** A weekly count: `metric` (see the query), the week's Monday and the number. */
export interface WeekCountRow {
  metric: string;
  week: string;
  total: number;
}

export interface WeekDecisionRow {
  week: string;
  decided: number;
  median: number | null;
}

export interface CountryCountRow {
  countryCode: string;
  count: number;
}

export interface CityCountRow {
  countryCode: string;
  citySlug: string;
  city: string;
  count: number;
}

const suggestionSelect = {
  id: true,
  slug: true,
  name: true,
  type: true,
  lat: true,
  lng: true,
  ratingAvg: true,
  ratingCount: true,
} as const;

/**
 * Cruising phase 6 (architecture 4.15): the admin statistics' aggregates (decision 101), counted
 * in SQL by Madrid week (Monday), and the onboarding's suggested spots (decision 102). Nothing here
 * returns a person.
 */
@Injectable()
export class CruisingStatsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The weekly figures from the Monday `from` (`yyyy-mm-dd`, Madrid) on: one row per metric and week
   * with something to count; the active members per week; the reports decided with the median
   * hours from opening to decision; and the top places.
   */
  async weekly(from: string, checkInsSince: Date, top: number) {
    const tz = STATS_TIME_ZONE;
    const [counts, active, decisions, countrySpots, citySpots, countryCheckIns, cityCheckIns] =
      await this.prisma.$transaction([
        this.prisma.$queryRaw<WeekCountRow[]>`
          WITH bounds AS (SELECT (${from}::date)::timestamp AT TIME ZONE ${tz} AS since),
          events AS (
            SELECT 'members' AS metric, created_at FROM cruising_profiles
            UNION ALL SELECT 'checkIns', created_at FROM cruising_check_ins
            UNION ALL SELECT 'meetups', created_at FROM cruising_meetups
            UNION ALL SELECT 'messages', created_at FROM cruising_messages
            UNION ALL SELECT 'roomMessages', created_at FROM cruising_room_messages
            UNION ALL SELECT 'media', created_at FROM cruising_media
            UNION ALL SELECT 'reportsOpened', created_at FROM cruising_reports
            UNION ALL SELECT 'takedowns', created_at FROM cruising_takedowns
            UNION ALL
            SELECT CASE
                     WHEN status = 'LIVE' THEN 'spotsLive'
                     WHEN status IN ('REJECTED', 'REMOVED') THEN 'spotsRejected'
                     ELSE 'spotsPending'
                   END,
                   created_at
            FROM cruising_spots
          )
          SELECT metric,
                 to_char(date_trunc('week', created_at AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS week,
                 count(*)::int AS total
          FROM events, bounds
          WHERE created_at >= bounds.since
          GROUP BY 1, 2`,
        this.prisma.$queryRaw<{ week: string; total: number }[]>`
          WITH bounds AS (SELECT (${from}::date)::timestamp AT TIME ZONE ${tz} AS since),
          actions AS (
            SELECT user_id, created_at FROM cruising_check_ins
            UNION ALL SELECT user_id, created_at FROM cruising_reviews
            UNION ALL SELECT sender_id, created_at FROM cruising_messages
            UNION ALL SELECT created_by_id, created_at FROM cruising_spots
              WHERE created_by_id IS NOT NULL
            UNION ALL SELECT owner_id, created_at FROM cruising_media
            UNION ALL SELECT host_id, created_at FROM cruising_meetups
            UNION ALL SELECT user_id, created_at FROM cruising_meetup_attendees
            UNION ALL SELECT user_id, created_at FROM cruising_room_messages
          )
          SELECT to_char(date_trunc('week', created_at AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS week,
                 count(DISTINCT user_id)::int AS total
          FROM actions, bounds
          WHERE created_at >= bounds.since
          GROUP BY 1`,
        this.prisma.$queryRaw<WeekDecisionRow[]>`
          SELECT to_char(date_trunc('week', reviewed_at AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS week,
                 count(*)::int AS decided,
                 (percentile_cont(0.5) WITHIN GROUP (
                   ORDER BY extract(epoch FROM reviewed_at - created_at) / 3600
                 ))::float8 AS median
          FROM cruising_reports
          WHERE status <> 'OPEN'
            AND reviewed_at >= (${from}::date)::timestamp AT TIME ZONE ${tz}
          GROUP BY 1`,
        this.prisma.$queryRaw<CountryCountRow[]>`
          SELECT country_code AS "countryCode", count(*)::int AS count
          FROM cruising_spots
          WHERE status = 'LIVE'
          GROUP BY country_code
          ORDER BY count(*) DESC, country_code ASC
          LIMIT ${top}`,
        this.prisma.$queryRaw<CityCountRow[]>`
          SELECT country_code AS "countryCode", city_slug AS "citySlug",
                 mode() WITHIN GROUP (ORDER BY city) AS city, count(*)::int AS count
          FROM cruising_spots
          WHERE status = 'LIVE'
          GROUP BY country_code, city_slug
          ORDER BY count(*) DESC, country_code ASC, city_slug ASC
          LIMIT ${top}`,
        this.prisma.$queryRaw<CountryCountRow[]>`
          SELECT s.country_code AS "countryCode", count(*)::int AS count
          FROM cruising_check_ins c
          JOIN cruising_spots s ON s.id = c.spot_id
          WHERE c.created_at >= ${checkInsSince}
          GROUP BY s.country_code
          ORDER BY count(*) DESC, s.country_code ASC
          LIMIT ${top}`,
        this.prisma.$queryRaw<CityCountRow[]>`
          SELECT s.country_code AS "countryCode", s.city_slug AS "citySlug",
                 mode() WITHIN GROUP (ORDER BY s.city) AS city, count(*)::int AS count
          FROM cruising_check_ins c
          JOIN cruising_spots s ON s.id = c.spot_id
          WHERE c.created_at >= ${checkInsSince}
          GROUP BY s.country_code, s.city_slug
          ORDER BY count(*) DESC, s.country_code ASC, s.city_slug ASC
          LIMIT ${top}`,
      ]);
    return { counts, active, decisions, countrySpots, citySpots, countryCheckIns, cityCheckIns };
  }

  /**
   * Up to `take` LIVE spots for the onboarding (decision 102), in the box or the country (neither:
   * anywhere): the best rated first, then the most checked into (the busiest hours' counter).
   */
  suggestions(where: { box?: Bbox; country?: string }, take: number) {
    const { box, country } = where;
    return this.prisma.cruisingSpot.findMany({
      where: {
        status: 'LIVE',
        ...(box
          ? {
              lng: { gte: box.minLng, lte: box.maxLng },
              lat: { gte: box.minLat, lte: box.maxLat },
            }
          : country
            ? { countryCode: country }
            : {}),
      },
      orderBy: [
        { ratingAvg: 'desc' },
        { hourCheckIns: 'desc' },
        { ratingCount: 'desc' },
        { id: 'asc' },
      ],
      take,
      select: suggestionSelect,
    });
  }
}
