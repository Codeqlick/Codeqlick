import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** A live project a hit may belong to, with what keeping it needs. */
export interface AnalyticsSite {
  id: string;
  teamId: string;
  analytics: boolean;
  plan: 'FREE' | 'PRO';
}

export interface TopRow {
  key: string;
  visitors: number;
  count: number;
}

/** Columns a report may group by (never from input: picked from this list). */
const COLUMNS = {
  pages: 'path',
  browsers: 'browser',
  os: 'os',
  devices: 'device',
} as const;

/** Web analytics (architecture 4.13 "Web analytics", decision 44). */
@Injectable()
export class CloudAnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private readonly siteSelect = {
    id: true,
    teamId: true,
    analytics: true,
    team: { select: { plan: true } },
  } as const;

  private toSite(
    row: { id: string; teamId: string; analytics: boolean; team: { plan: 'FREE' | 'PRO' } } | null,
  ): AnalyticsSite | null {
    return row
      ? { id: row.id, teamId: row.teamId, analytics: row.analytics, plan: row.team.plan }
      : null;
  }

  async siteBySlug(slug: string): Promise<AnalyticsSite | null> {
    return this.toSite(
      await this.prisma.cloudProject.findFirst({
        where: { slug, deletedAt: null, suspendedAt: null },
        select: this.siteSelect,
      }),
    );
  }

  async siteByDomain(domain: string): Promise<AnalyticsSite | null> {
    const row = await this.prisma.cloudDomain.findFirst({
      where: {
        name: domain,
        state: { not: 'PENDING' },
        project: { deletedAt: null, suspendedAt: null },
      },
      select: { project: { select: this.siteSelect } },
    });
    return this.toSite(row?.project ?? null);
  }

  setEnabled(projectId: string, enabled: boolean): Promise<unknown> {
    return this.prisma.cloudProject.update({
      where: { id: projectId },
      data: { analytics: enabled },
    });
  }

  /** The day's salt, created by whoever asks first. */
  async salt(day: string, fresh: string): Promise<string> {
    const row = await this.prisma.cloudAnalyticsSalt.upsert({
      where: { day },
      create: { day, salt: fresh },
      update: {},
    });
    return row.salt;
  }

  deleteSaltsBefore(day: string): Promise<unknown> {
    return this.prisma.cloudAnalyticsSalt.deleteMany({ where: { day: { lt: day } } });
  }

  deleteEventsBefore(before: Date): Promise<unknown> {
    return this.prisma.cloudAnalyticsEvent.deleteMany({ where: { createdAt: { lt: before } } });
  }

  teamEventsSince(teamId: string, since: Date): Promise<number> {
    return this.prisma.cloudAnalyticsEvent.count({
      where: { teamId, createdAt: { gte: since } },
    });
  }

  keep(data: Prisma.CloudAnalyticsEventUncheckedCreateInput): Promise<unknown> {
    return this.prisma.cloudAnalyticsEvent.create({ data, select: { id: true } });
  }

  team(id: string): Promise<{ name: string; slug: string } | null> {
    return this.prisma.cloudTeam.findUnique({ where: { id }, select: { name: true, slug: true } });
  }

  /** Marks the month's limit email as sent; true when this call did it. */
  async claimOverLimit(teamId: string, month: string): Promise<boolean> {
    const { count } = await this.prisma.cloudTeam.updateMany({
      where: {
        id: teamId,
        OR: [{ analyticsOverLimitMonth: null }, { analyticsOverLimitMonth: { not: month } }],
      },
      data: { analyticsOverLimitMonth: month },
    });
    return count > 0;
  }

  async totals(projectId: string, since: Date): Promise<{ visitors: number; pageviews: number }> {
    const [row] = await this.prisma.$queryRaw<Array<{ visitors: number; pageviews: number }>>`
      SELECT count(DISTINCT visitor)::int AS visitors,
             (count(*) FILTER (WHERE name = 'pageview'))::int AS pageviews
      FROM cloud_analytics_events
      WHERE project_id = ${projectId}::uuid AND created_at >= ${since}`;
    return row ?? { visitors: 0, pageviews: 0 };
  }

  /** Visitors and page views per hour (UTC, ISO) or per Madrid day (`YYYY-MM-DD`). */
  series(
    projectId: string,
    since: Date,
    unit: 'hour' | 'day',
  ): Promise<Array<{ t: string; visitors: number; pageviews: number }>> {
    const bucket =
      unit === 'hour'
        ? Prisma.sql`to_char(date_trunc('hour', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24":00:00.000Z"')`
        : Prisma.sql`to_char(created_at AT TIME ZONE 'Europe/Madrid', 'YYYY-MM-DD')`;
    return this.prisma.$queryRaw`
      SELECT ${bucket} AS t,
             count(DISTINCT visitor)::int AS visitors,
             (count(*) FILTER (WHERE name = 'pageview'))::int AS pageviews
      FROM cloud_analytics_events
      WHERE project_id = ${projectId}::uuid AND created_at >= ${since}
      GROUP BY 1 ORDER BY 1`;
  }

  /** The 10 most visited values of a column among page views. */
  top(projectId: string, since: Date, of: keyof typeof COLUMNS): Promise<TopRow[]> {
    const column = Prisma.raw(COLUMNS[of]);
    return this.prisma.$queryRaw`
      SELECT ${column} AS key, count(DISTINCT visitor)::int AS visitors, count(*)::int AS count
      FROM cloud_analytics_events
      WHERE project_id = ${projectId}::uuid AND created_at >= ${since} AND name = 'pageview'
      GROUP BY 1 ORDER BY 2 DESC, 3 DESC, 1 LIMIT 10`;
  }

  /** Where visitors came from: the campaign when there is one, else the referring site. */
  referrers(projectId: string, since: Date): Promise<TopRow[]> {
    return this.prisma.$queryRaw`
      SELECT coalesce(campaign, referrer) AS key,
             count(DISTINCT visitor)::int AS visitors, count(*)::int AS count
      FROM cloud_analytics_events
      WHERE project_id = ${projectId}::uuid AND created_at >= ${since} AND name = 'pageview'
        AND coalesce(campaign, referrer) IS NOT NULL
      GROUP BY 1 ORDER BY 2 DESC, 3 DESC, 1 LIMIT 10`;
  }

  /** Custom events. */
  events(projectId: string, since: Date): Promise<TopRow[]> {
    return this.prisma.$queryRaw`
      SELECT name AS key, count(DISTINCT visitor)::int AS visitors, count(*)::int AS count
      FROM cloud_analytics_events
      WHERE project_id = ${projectId}::uuid AND created_at >= ${since} AND name <> 'pageview'
      GROUP BY 1 ORDER BY 3 DESC, 2 DESC, 1 LIMIT 10`;
  }
}
