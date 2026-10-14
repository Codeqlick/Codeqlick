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
}

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
    };
  }
}
