import { Injectable } from '@nestjs/common';
import type {
  CloudDomain,
  CloudProject,
  CloudTeam,
  Prisma,
  SurfaceScan,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export type SurfaceDomainRow = CloudDomain & { project: CloudProject & { team: CloudTeam } };
export type SurfaceScanRow = SurfaceScan & {
  domain: { id: string; name: string };
  project: { slug: string; name: string };
};

/** Why switching the monitor on did not happen. */
export type EnableOutcome =
  | { ok: true; domain: CloudDomain; changed: boolean }
  | { ok: false; reason: 'missing' | 'pending' | 'limit' };

/** The Surface monitor's data (architecture 4.13, decision 144). Only this layer reaches Prisma. */
@Injectable()
export class CloudSurfaceRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Domains whose scan is due, oldest first. */
  due(now: Date, take: number): Promise<SurfaceDomainRow[]> {
    return this.prisma.cloudDomain.findMany({
      where: {
        surfaceMonitor: true,
        state: { not: 'PENDING' },
        surfaceNextAt: { lte: now },
        project: { deletedAt: null },
      },
      include: { project: { include: { team: true } } },
      orderBy: { surfaceNextAt: 'asc' },
      take,
    });
  }

  /**
   * Claims a due scan by moving the domain's next run on, only if nobody moved it since it was read
   * and the monitor is still on for a domain that is not PENDING.
   */
  async claim(domainId: string, due: Date, next: Date): Promise<boolean> {
    const { count } = await this.prisma.cloudDomain.updateMany({
      where: {
        id: domainId,
        surfaceNextAt: due,
        surfaceMonitor: true,
        state: { not: 'PENDING' },
      },
      data: { surfaceNextAt: next },
    });
    return count === 1;
  }

  createScan(data: Prisma.SurfaceScanUncheckedCreateInput): Promise<SurfaceScan> {
    return this.prisma.surfaceScan.create({ data });
  }

  /** The newest scans of a domain for a team, newest first. */
  scans(domainId: string, teamId: string, take: number): Promise<SurfaceScan[]> {
    return this.prisma.surfaceScan.findMany({
      where: { domainId, teamId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    });
  }

  /** The newest DONE scan of the domain and team before `scan` (the baseline). */
  previousDone(scan: Pick<SurfaceScan, 'domainId' | 'teamId' | 'createdAt' | 'id'>) {
    return this.prisma.surfaceScan.findFirst({
      where: {
        domainId: scan.domainId,
        teamId: scan.teamId,
        status: 'DONE',
        OR: [
          { createdAt: { lt: scan.createdAt } },
          { createdAt: scan.createdAt, id: { lt: scan.id } },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  findScan(id: string): Promise<SurfaceScanRow | null> {
    return this.prisma.surfaceScan.findFirst({
      where: { id, project: { deletedAt: null } },
      include: {
        domain: { select: { id: true, name: true } },
        project: { select: { slug: true, name: true } },
      },
    });
  }

  async deleteOlderThan(before: Date): Promise<number> {
    const { count } = await this.prisma.surfaceScan.deleteMany({
      where: { createdAt: { lt: before } },
    });
    return count;
  }

  /**
   * Switches the monitor on in one transaction that locks the team's row (as the transfer does), so
   * two switches can't both take the last place of the limit. Already on: nothing changes.
   */
  enable(
    teamId: string,
    projectId: string,
    domainId: string,
    limit: number,
    nextAt: Date,
  ): Promise<EnableOutcome> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM cloud_teams WHERE id = ${teamId}::uuid FOR UPDATE`;
      const domain = await tx.cloudDomain.findFirst({
        where: { id: domainId, projectId, project: { teamId, deletedAt: null } },
      });
      if (!domain) return { ok: false, reason: 'missing' } as const;
      if (domain.state === 'PENDING') return { ok: false, reason: 'pending' } as const;
      if (domain.surfaceMonitor) return { ok: true, domain, changed: false } as const;
      const monitored = await tx.cloudDomain.count({
        where: { surfaceMonitor: true, project: { teamId, deletedAt: null } },
      });
      if (monitored >= limit) return { ok: false, reason: 'limit' } as const;
      const updated = await tx.cloudDomain.update({
        where: { id: domainId },
        data: { surfaceMonitor: true, surfaceNextAt: nextAt },
      });
      return { ok: true, domain: updated, changed: true } as const;
    });
  }

  /** Switches the monitor off and clears its next run; true when it was on. */
  async disable(domainId: string): Promise<boolean> {
    const { count } = await this.prisma.cloudDomain.updateMany({
      where: { id: domainId, surfaceMonitor: true },
      data: { surfaceMonitor: false, surfaceNextAt: null },
    });
    return count > 0;
  }
}
