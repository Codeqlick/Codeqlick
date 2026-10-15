import { Injectable } from '@nestjs/common';
import { LeadStatus, ProjectPhase, PublishStatus, Role } from '../../generated/prisma/client.js';
import { liveWhere } from '../../common/publishing.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface StatsCounts {
  leadsNew: number;
  leadsTotal: number;
  postsPublished: number;
  postsDrafts: number;
  postsScheduled: number;
  portfolioPublished: number;
  projectsActive: number;
  clients: number;
  ticketsActive: number;
  proposalsSent: number;
  draftsPending: number;
}

export interface MonthlyCounts {
  /** `yyyy-mm` in the studio's time zone. */
  month: string;
  leads: number;
  leadsWon: number;
  posts: number;
  caseStudies: number;
}

/** The studio's time zone: months are counted in it. */
export const SITE_TIME_ZONE = 'Europe/Madrid';

/** Phases that count as "active" work for the dashboard. */
const ACTIVE_PHASES: ProjectPhase[] = [
  ProjectPhase.DISCOVERY,
  ProjectPhase.DESIGN,
  ProjectPhase.DEVELOPMENT,
  ProjectPhase.QA,
];

@Injectable()
export class StatsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async counts(): Promise<StatsCounts> {
    const now = new Date();
    const [
      leadsNew,
      leadsTotal,
      postsPublished,
      postsDrafts,
      postsScheduled,
      portfolioPublished,
      projectsActive,
      clients,
      ticketsActive,
      proposalsSent,
      draftsPending,
    ] = await this.prisma.$transaction([
      this.prisma.lead.count({ where: { status: LeadStatus.NEW } }),
      this.prisma.lead.count(),
      // Published means live; published with a future date is scheduled.
      this.prisma.post.count({ where: liveWhere(now) }),
      this.prisma.post.count({ where: { status: PublishStatus.DRAFT } }),
      this.prisma.post.count({
        where: { status: PublishStatus.PUBLISHED, publishedAt: { gt: now } },
      }),
      this.prisma.portfolioItem.count({ where: liveWhere(now) }),
      this.prisma.clientProject.count({ where: { phase: { in: ACTIVE_PHASES } } }),
      this.prisma.user.count({ where: { role: Role.CLIENT, isActive: true } }),
      this.prisma.supportTicket.count({
        where: { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_CLIENT'] } },
      }),
      this.prisma.proposal.count({ where: { status: 'SENT' } }),
      this.prisma.updateDraft.count(),
    ]);
    return {
      leadsNew,
      leadsTotal,
      postsPublished,
      postsDrafts,
      postsScheduled,
      portfolioPublished,
      projectsActive,
      clients,
      ticketsActive,
      proposalsSent,
      draftsPending,
    };
  }

  /** Lost leads by reason (no reason: `null`), most frequent first. */
  async lostReasons(): Promise<{ reason: string | null; count: number }[]> {
    const rows = await this.prisma.lead.findMany({
      where: { status: LeadStatus.LOST },
      select: { lostReason: true },
    });
    const counts = new Map<string | null, number>();
    for (const row of rows) counts.set(row.lostReason, (counts.get(row.lostReason) ?? 0) + 1);
    return [...counts]
      .map(([reason, count]) => ({ reason, count }))
      .toSorted((a, b) => b.count - a.count);
  }

  /**
   * Leads (and won leads) by the month they came in, and posts and case studies by the month
   * they went live, from `since` on. Months are `yyyy-mm` in the studio's time zone.
   */
  async monthly(since: Date): Promise<MonthlyCounts[]> {
    const now = new Date();
    const [leads, posts, portfolio] = await this.prisma.$transaction([
      this.prisma.$queryRaw<{ month: string; total: number; won: number }[]>`
        SELECT to_char(created_at AT TIME ZONE ${SITE_TIME_ZONE}, 'YYYY-MM') AS month,
               count(*)::int AS total,
               (count(*) FILTER (WHERE status = 'WON'))::int AS won
        FROM leads WHERE created_at >= ${since} GROUP BY 1`,
      this.prisma.$queryRaw<{ month: string; total: number }[]>`
        SELECT to_char(published_at AT TIME ZONE ${SITE_TIME_ZONE}, 'YYYY-MM') AS month,
               count(*)::int AS total
        FROM posts
        WHERE status = 'PUBLISHED' AND published_at >= ${since} AND published_at <= ${now}
        GROUP BY 1`,
      this.prisma.$queryRaw<{ month: string; total: number }[]>`
        SELECT to_char(published_at AT TIME ZONE ${SITE_TIME_ZONE}, 'YYYY-MM') AS month,
               count(*)::int AS total
        FROM portfolio_items
        WHERE status = 'PUBLISHED' AND published_at >= ${since} AND published_at <= ${now}
        GROUP BY 1`,
    ]);

    const byMonth = new Map<string, MonthlyCounts>();
    const row = (month: string) => {
      let counts = byMonth.get(month);
      if (!counts) {
        counts = { month, leads: 0, leadsWon: 0, posts: 0, caseStudies: 0 };
        byMonth.set(month, counts);
      }
      return counts;
    };
    for (const item of leads)
      Object.assign(row(item.month), { leads: item.total, leadsWon: item.won });
    for (const item of posts) row(item.month).posts = item.total;
    for (const item of portfolio) row(item.month).caseStudies = item.total;
    return [...byMonth.values()];
  }
}
