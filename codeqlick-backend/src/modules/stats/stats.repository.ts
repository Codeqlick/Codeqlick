import { Injectable } from '@nestjs/common';
import { LeadStatus, ProjectPhase, PublishStatus, Role } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface StatsCounts {
  leadsNew: number;
  leadsTotal: number;
  postsPublished: number;
  postsDrafts: number;
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
    const [
      leadsNew,
      leadsTotal,
      postsPublished,
      postsDrafts,
      portfolioPublished,
      projectsActive,
      clients,
    ] = await this.prisma.$transaction([
      this.prisma.lead.count({ where: { status: LeadStatus.NEW } }),
      this.prisma.lead.count(),
      this.prisma.post.count({ where: { status: PublishStatus.PUBLISHED } }),
      this.prisma.post.count({ where: { status: PublishStatus.DRAFT } }),
      this.prisma.portfolioItem.count({ where: { status: PublishStatus.PUBLISHED } }),
      this.prisma.clientProject.count({ where: { phase: { in: ACTIVE_PHASES } } }),
      this.prisma.user.count({ where: { role: Role.CLIENT, isActive: true } }),
    ]);
    return {
      leadsNew,
      leadsTotal,
      postsPublished,
      postsDrafts,
      portfolioPublished,
      projectsActive,
      clients,
    };
  }
}
