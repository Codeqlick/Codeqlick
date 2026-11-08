import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Days and hours are counted in the studio's time zone (as the other statistics). */
export const STATS_TIME_ZONE = 'Europe/Madrid';

export interface CallLogInput {
  startedAt: Date;
  endedAt: Date;
  durationSec: number;
  waitSec: number | null;
}

export interface DayCallRow {
  date: string;
  calls: number;
  longCalls: number;
  avgDurationSec: number | null;
  avgWaitSec: number | null;
}

export interface CallTotals {
  calls: number;
  longCalls: number;
  avgDurationSec: number | null;
  avgWaitSec: number | null;
}

/** A call this long or longer counts as a real conversation. */
export const LONG_CALL_SEC = 60;
/** A call shorter than this was a skip (suspicious accounts, architecture 4.7). */
export const SHORT_CALL_SEC = 10;

/** One person's side of a call, added to their day's counters. */
export interface CallCounters {
  userId: string;
  short: boolean;
  /** The other person ended it under SHORT_CALL_SEC. */
  skippedFast: boolean;
}

/** One account's figures for the suspicious accounts list (architecture 4.7). */
export interface SuspicionRow {
  userId: string;
  nickname: string | null;
  email: string;
  joinedAt: Date;
  calls: number;
  shortCalls: number;
  skippedFast: number;
  maxCallsInDay: number;
  reporters: number;
}

/** Anonymous usage data of the video chat: calls and the days each account came (architecture 4.7). */
@Injectable()
export class VideochatStatsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** `day` is `yyyy-mm-dd`; a second visit the same day changes nothing. */
  async markActive(userId: string, day: string): Promise<void> {
    await this.prisma.videochatActiveDay.createMany({
      data: [{ userId, day: new Date(`${day}T00:00:00Z`) }],
      skipDuplicates: true,
    });
  }

  async logCall(input: CallLogInput): Promise<void> {
    await this.prisma.videochatCallLog.create({ data: input });
  }

  /** Adds a call to each person's counters of that day (`yyyy-mm-dd`). */
  async countCall(day: string, people: CallCounters[]): Promise<void> {
    await this.prisma.$transaction(
      people.map(
        (person) => this.prisma.$executeRaw`
          INSERT INTO videochat_active_days (day, user_id, calls, short_calls, skipped_fast)
          VALUES (${day}::date, ${person.userId}::uuid, 1, ${person.short ? 1 : 0},
                  ${person.skippedFast ? 1 : 0})
          ON CONFLICT (day, user_id) DO UPDATE SET
            calls = videochat_active_days.calls + 1,
            short_calls = videochat_active_days.short_calls + EXCLUDED.short_calls,
            skipped_fast = videochat_active_days.skipped_fast + EXCLUDED.skipped_fast`,
      ),
    );
  }

  /**
   * Accounts with calls since `callsFrom` (`yyyy-mm-dd`) or reports since `reportsFrom`, not
   * suspended now and not marked "not suspicious" since `clearedAfter` (unless reported after it).
   */
  async suspicionCandidates(input: {
    callsFrom: string;
    reportsFrom: Date;
    clearedAfter: Date;
    now: Date;
    limit: number;
  }): Promise<SuspicionRow[]> {
    const { callsFrom, reportsFrom, clearedAfter, now, limit } = input;
    return this.prisma.$queryRaw<SuspicionRow[]>`
      WITH activity AS (
        SELECT user_id, sum(calls)::int AS calls, sum(short_calls)::int AS short_calls,
               sum(skipped_fast)::int AS skipped_fast, max(calls)::int AS max_calls
        FROM videochat_active_days WHERE day >= ${callsFrom}::date GROUP BY user_id
      ), reported AS (
        SELECT reported_id AS user_id, count(DISTINCT reporter_id)::int AS reporters
        FROM videochat_reports WHERE created_at >= ${reportsFrom} GROUP BY reported_id
      )
      SELECT p.user_id AS "userId", p.nickname, u.email, p.created_at AS "joinedAt",
             coalesce(a.calls, 0) AS calls, coalesce(a.short_calls, 0) AS "shortCalls",
             coalesce(a.skipped_fast, 0) AS "skippedFast", coalesce(a.max_calls, 0) AS "maxCallsInDay",
             coalesce(r.reporters, 0) AS reporters
      FROM videochat_profiles p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN activity a ON a.user_id = p.user_id
      LEFT JOIN reported r ON r.user_id = p.user_id
      WHERE (a.user_id IS NOT NULL OR r.user_id IS NOT NULL)
        AND NOT (p.suspended_at IS NOT NULL AND (p.suspended_until IS NULL OR p.suspended_until > ${now}))
        AND (p.suspicion_cleared_at IS NULL OR p.suspicion_cleared_at < ${clearedAfter}
             OR EXISTS (SELECT 1 FROM videochat_reports x
                        WHERE x.reported_id = p.user_id AND x.created_at > p.suspicion_cleared_at))
      ORDER BY coalesce(r.reporters, 0) DESC, coalesce(a.skipped_fast, 0) DESC,
               coalesce(a.max_calls, 0) DESC
      LIMIT ${limit}`;
  }

  /** `false` when the account never joined the video chat. */
  async clearSuspicion(userId: string, at: Date): Promise<boolean> {
    const { count } = await this.prisma.videochatProfile.updateMany({
      where: { userId },
      data: { suspicionClearedAt: at },
    });
    return count > 0;
  }

  /** Deletes calls and active days older than `before` (a date, `yyyy-mm-dd`, for the days). */
  async deleteOlderThan(before: Date, beforeDay: string): Promise<number> {
    const [calls, days] = await this.prisma.$transaction([
      this.prisma.videochatCallLog.deleteMany({ where: { startedAt: { lt: before } } }),
      this.prisma.videochatActiveDay.deleteMany({
        where: { day: { lt: new Date(`${beforeDay}T00:00:00Z`) } },
      }),
    ]);
    return calls.count + days.count;
  }

  /** Daily and hourly figures from the day `from` (`yyyy-mm-dd`, inclusive) on. */
  async history(from: string) {
    const tz = STATS_TIME_ZONE;
    const now = new Date();
    const [active, activeTotal, calls, callTotals, hours, members, reports, current] =
      await this.prisma.$transaction([
        this.prisma.$queryRaw<{ date: string; total: number }[]>`
          SELECT to_char(day, 'YYYY-MM-DD') AS date, count(*)::int AS total
          FROM videochat_active_days WHERE day >= ${from}::date GROUP BY day`,
        this.prisma.$queryRaw<{ total: number }[]>`
          SELECT count(DISTINCT user_id)::int AS total
          FROM videochat_active_days WHERE day >= ${from}::date`,
        this.prisma.$queryRaw<DayCallRow[]>`
          SELECT to_char(started_at AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS date,
                 count(*)::int AS calls,
                 (count(*) FILTER (WHERE duration_sec >= ${LONG_CALL_SEC}))::int AS "longCalls",
                 round(avg(duration_sec))::int AS "avgDurationSec",
                 round(avg(wait_sec))::int AS "avgWaitSec"
          FROM videochat_call_logs
          WHERE started_at >= (${from}::date)::timestamp AT TIME ZONE ${tz}
          GROUP BY 1`,
        this.prisma.$queryRaw<CallTotals[]>`
          SELECT count(*)::int AS calls,
                 (count(*) FILTER (WHERE duration_sec >= ${LONG_CALL_SEC}))::int AS "longCalls",
                 round(avg(duration_sec))::int AS "avgDurationSec",
                 round(avg(wait_sec))::int AS "avgWaitSec"
          FROM videochat_call_logs
          WHERE started_at >= (${from}::date)::timestamp AT TIME ZONE ${tz}`,
        this.prisma.$queryRaw<{ hour: number; total: number }[]>`
          SELECT extract(hour FROM started_at AT TIME ZONE ${tz})::int AS hour,
                 count(*)::int AS total
          FROM videochat_call_logs
          WHERE started_at >= (${from}::date)::timestamp AT TIME ZONE ${tz}
          GROUP BY 1`,
        this.prisma.$queryRaw<{ date: string; total: number }[]>`
          SELECT to_char(created_at AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS date,
                 count(*)::int AS total
          FROM videochat_profiles
          WHERE created_at >= (${from}::date)::timestamp AT TIME ZONE ${tz}
          GROUP BY 1`,
        this.prisma.$queryRaw<{ date: string; total: number }[]>`
          SELECT to_char(created_at AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS date,
                 count(*)::int AS total
          FROM videochat_reports
          WHERE created_at >= (${from}::date)::timestamp AT TIME ZONE ${tz}
          GROUP BY 1`,
        this.prisma.$queryRaw<{ members: number; openReports: number; suspended: number }[]>`
          SELECT (SELECT count(*) FROM videochat_profiles)::int AS members,
                 (SELECT count(*) FROM videochat_reports WHERE status = 'OPEN')::int
                   AS "openReports",
                 (SELECT count(*) FROM videochat_profiles
                  WHERE suspended_at IS NOT NULL
                    AND (suspended_until IS NULL OR suspended_until > ${now}))::int AS suspended`,
      ]);
    return {
      active,
      activeTotal: activeTotal[0]?.total ?? 0,
      calls,
      callTotals: callTotals[0] ?? {
        calls: 0,
        longCalls: 0,
        avgDurationSec: null,
        avgWaitSec: null,
      },
      hours,
      members,
      reports,
      current: current[0] ?? { members: 0, openReports: 0, suspended: 0 },
    };
  }

  /** Calls started in each hour of the day (Europe/Madrid) since `since`. */
  callsByHour(since: Date): Promise<{ hour: number; total: number }[]> {
    return this.prisma.$queryRaw<{ hour: number; total: number }[]>`
      SELECT extract(hour FROM started_at AT TIME ZONE ${STATS_TIME_ZONE})::int AS hour,
             count(*)::int AS total
      FROM videochat_call_logs
      WHERE started_at >= ${since}
      GROUP BY 1`;
  }
}
