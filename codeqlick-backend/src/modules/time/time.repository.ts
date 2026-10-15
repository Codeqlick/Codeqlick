import { Injectable } from '@nestjs/common';
import type { TimeEntry, User } from '../../generated/prisma/client.js';
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
}
