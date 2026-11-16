import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const projectSelect = {
  id: true,
  name: true,
  maintenanceStatus: true,
  maintenanceSubscriptionStatus: true,
  maintenanceSubscriptionId: true,
  maintenanceCustomerId: true,
  maintenancePeriodEnd: true,
  maintenanceCancelAtPeriodEnd: true,
  maintenanceSince: true,
  maintenanceIncludedReason: true,
  maintenanceIncludedAt: true,
  updatedAt: true,
  client: { select: { id: true, name: true } },
  site: { select: { slug: true, domain: true } },
} as const;

export type MaintenanceProject = Prisma.ClientProjectGetPayload<{ select: typeof projectSelect }>;

/** Projects' maintenance plans (architecture 8.2, decision 110). */
@Injectable()
export class SiteMaintenanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  project(id: string): Promise<MaintenanceProject | null> {
    return this.prisma.clientProject.findUnique({ where: { id }, select: projectSelect });
  }

  projectByCustomer(customer: string): Promise<MaintenanceProject | null> {
    return this.prisma.clientProject.findUnique({
      where: { maintenanceCustomerId: customer },
      select: projectSelect,
    });
  }

  update(id: string, data: Prisma.ClientProjectUpdateInput): Promise<MaintenanceProject> {
    return this.prisma.clientProject.update({ where: { id }, data, select: projectSelect });
  }

  /** The included change requests opened on the project since `from`. */
  usedSince(projectId: string, from: Date): Promise<number> {
    return this.prisma.supportTicket.count({
      where: { projectId, maintenanceIncluded: true, createdAt: { gte: from } },
    });
  }

  /** Every project whose plan is or was on (Admin's list), newest change first. */
  plans(): Promise<MaintenanceProject[]> {
    return this.prisma.clientProject.findMany({
      where: {
        OR: [{ maintenanceSince: { not: null } }, { maintenanceIncludedReason: { not: null } }],
      },
      orderBy: { updatedAt: 'desc' },
      select: projectSelect,
    });
  }
}
