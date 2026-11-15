import { Injectable } from '@nestjs/common';
import type { CloudAudit, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Website checks run through Cloud's API (architecture 4.13, Website check API). */
@Injectable()
export class CloudAuditsRepository {
  constructor(private readonly prisma: PrismaService) {}

  countSince(teamId: string, since: Date): Promise<number> {
    return this.prisma.cloudAudit.count({ where: { teamId, createdAt: { gte: since } } });
  }

  create(data: Prisma.CloudAuditUncheckedCreateInput): Promise<CloudAudit> {
    return this.prisma.cloudAudit.create({ data });
  }

  find(id: string): Promise<CloudAudit | null> {
    return this.prisma.cloudAudit.findUnique({ where: { id } });
  }

  list(teamId: string, skip: number, take: number) {
    return this.prisma.$transaction([
      this.prisma.cloudAudit.findMany({
        where: { teamId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true, url: true, score: true, kind: true, createdAt: true },
        skip,
        take,
      }),
      this.prisma.cloudAudit.count({ where: { teamId } }),
    ]);
  }

  /** Deletes the audits older than their kind's retention: `scheduled` for SCHEDULED, `other`. */
  async deleteExpired(scheduled: Date, other: Date): Promise<void> {
    await this.prisma.cloudAudit.deleteMany({
      where: {
        OR: [
          { kind: 'SCHEDULED', createdAt: { lt: scheduled } },
          { kind: { not: 'SCHEDULED' }, createdAt: { lt: other } },
        ],
      },
    });
  }

  /** The newest scheduled audit of the project before `audit` (decision 80); null when none. */
  previousScheduled(audit: CloudAudit): Promise<CloudAudit | null> {
    return this.prisma.cloudAudit.findFirst({
      where: {
        teamId: audit.teamId,
        projectId: audit.projectId,
        kind: 'SCHEDULED',
        id: { not: audit.id },
        createdAt: { lte: audit.createdAt },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  /** A project's newest scheduled audits of its team, newest first. */
  scheduled(teamId: string, projectId: string, take: number): Promise<CloudAudit[]> {
    return this.prisma.cloudAudit.findMany({
      where: { teamId, projectId, kind: 'SCHEDULED' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    });
  }

  /** Projects whose weekly check is due, oldest first (decision 80). */
  dueProductionChecks(now: Date, take: number) {
    return this.prisma.cloudProject.findMany({
      where: {
        productionChecks: true,
        deletedAt: null,
        productionCheckNextAt: { lte: now },
      },
      include: { team: true },
      orderBy: { productionCheckNextAt: 'asc' },
      take,
    });
  }

  /**
   * Claims a due weekly check by moving the project's next run on, only if nobody moved it since it
   * was read and the setting is still on.
   */
  async claimProductionCheck(projectId: string, due: Date, next: Date): Promise<boolean> {
    const { count } = await this.prisma.cloudProject.updateMany({
      where: { id: projectId, productionCheckNextAt: due, productionChecks: true },
      data: { productionCheckNextAt: next },
    });
    return count === 1;
  }
}
