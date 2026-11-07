import { Injectable } from '@nestjs/common';
import type { Prisma, SiteMonitor } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const projectSelect = {
  select: {
    id: true,
    name: true,
    productionUrl: true,
    clientId: true,
    client: { select: { name: true } },
  },
} as const;

export type MonitorRow = SiteMonitor & {
  project: {
    id: string;
    name: string;
    productionUrl: string | null;
    clientId: string;
    client: { name: string };
  };
};

@Injectable()
export class MonitoringRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProject(id: string) {
    return this.prisma.clientProject.findUnique({
      where: { id },
      select: { id: true, name: true, productionUrl: true, clientId: true },
    });
  }

  findByProject(projectId: string): Promise<MonitorRow | null> {
    return this.prisma.siteMonitor.findUnique({
      where: { projectId },
      include: { project: projectSelect },
    });
  }

  /** Enabled monitors whose project has a production address. */
  listDue(): Promise<MonitorRow[]> {
    return this.prisma.siteMonitor.findMany({
      where: { enabled: true, project: { productionUrl: { not: null } } },
      include: { project: projectSelect },
    });
  }

  listAll(): Promise<MonitorRow[]> {
    return this.prisma.siteMonitor.findMany({
      include: { project: projectSelect },
      orderBy: { createdAt: 'asc' },
    });
  }

  upsert(projectId: string, enabled: boolean): Promise<MonitorRow> {
    return this.prisma.siteMonitor.upsert({
      where: { projectId },
      create: { projectId, enabled },
      update: { enabled },
      include: { project: projectSelect },
    });
  }

  update(id: string, data: Prisma.SiteMonitorUpdateInput): Promise<MonitorRow> {
    return this.prisma.siteMonitor.update({
      where: { id },
      data,
      include: { project: projectSelect },
    });
  }

  addCheck(data: Prisma.SiteCheckUncheckedCreateInput): Promise<unknown> {
    return this.prisma.siteCheck.create({ data });
  }

  checksSince(monitorIds: string[], since: Date) {
    return this.prisma.siteCheck.findMany({
      where: { monitorId: { in: monitorIds }, checkedAt: { gte: since } },
      select: { monitorId: true, checkedAt: true, ok: true },
      orderBy: { checkedAt: 'asc' },
    });
  }

  async prune(before: Date): Promise<void> {
    await this.prisma.siteCheck.deleteMany({ where: { checkedAt: { lt: before } } });
  }
}
