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
}
