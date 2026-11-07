import { Injectable } from '@nestjs/common';
import type { MaintenancePlan, Prisma, TimeEntry, User } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export type EntryRow = TimeEntry & {
  user: Pick<User, 'name'> | null;
  project: { id: string; name: string; client: { id: string; name: string } };
};

const include = {
  user: { select: { name: true } },
  project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
} as const;

@Injectable()
export class TimeRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProject(id: string) {
    return this.prisma.clientProject.findUnique({
      where: { id },
      select: { id: true, name: true, clientId: true, showHours: true },
    });
  }

  /** A project's entries, newest day first. */
  listForProject(projectId: string): Promise<EntryRow[]> {
    return this.prisma.timeEntry.findMany({
      where: { projectId },
      include,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /** Every entry with a date in [from, to), newest day first. */
  listBetween(from: Date, to: Date): Promise<EntryRow[]> {
    return this.prisma.timeEntry.findMany({
      where: { date: { gte: from, lt: to } },
      include,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
  }

  create(data: {
    projectId: string;
    userId: string;
    date: Date;
    minutes: number;
    description: string;
  }): Promise<EntryRow> {
    return this.prisma.timeEntry.create({ data, include });
  }

  findEntry(projectId: string, id: string): Promise<TimeEntry | null> {
    return this.prisma.timeEntry.findFirst({ where: { id, projectId } });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.timeEntry.delete({ where: { id } });
  }

  findPlan(projectId: string): Promise<MaintenancePlan | null> {
    return this.prisma.maintenancePlan.findUnique({ where: { projectId } });
  }

  savePlan(
    projectId: string,
    data: { active: boolean; name: string; monthlyMinutes: number; alertPercent: number },
  ): Promise<MaintenancePlan> {
    return this.prisma.maintenancePlan.upsert({
      where: { projectId },
      create: { projectId, ...data },
      update: data,
    });
  }

  updatePlan(id: string, data: Prisma.MaintenancePlanUpdateInput): Promise<MaintenancePlan> {
    return this.prisma.maintenancePlan.update({ where: { id }, data });
  }

  activePlans() {
    return this.prisma.maintenancePlan.findMany({
      where: { active: true },
      include: {
        project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Minutes per project between two dates (Madrid days stored as dates). */
  async minutesBetween(projectIds: string[], from: Date, to: Date) {
    const rows = await this.prisma.timeEntry.findMany({
      where: { projectId: { in: projectIds }, date: { gte: from, lt: to } },
      select: { projectId: true, minutes: true },
    });
    const totals = new Map<string, number>();
    for (const row of rows)
      totals.set(row.projectId, (totals.get(row.projectId) ?? 0) + row.minutes);
    return totals;
  }

  /** A project's entries since `from`, for its monthly totals. */
  entriesSince(projectId: string, from: Date) {
    return this.prisma.timeEntry.findMany({
      where: { projectId, date: { gte: from } },
      select: { date: true, minutes: true },
    });
  }
}
