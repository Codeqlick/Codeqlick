import { Injectable } from '@nestjs/common';
import type { Prisma, ProjectTask, TaskStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export type TaskRow = ProjectTask & { ticket: { id: string; number: number } | null };

const include = { ticket: { select: { id: true, number: true } } } as const;

/** Open work first (in progress, then to do), newest first within each; done last. */
const order: Prisma.ProjectTaskOrderByWithRelationInput[] = [
  { doneAt: { sort: 'desc', nulls: 'first' } },
  { status: 'desc' },
  { createdAt: 'desc' },
];

@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProject(id: string) {
    return this.prisma.clientProject.findUnique({
      where: { id },
      select: { id: true, name: true, clientId: true },
    });
  }

  findProjectByKeyHash(hash: string) {
    return this.prisma.clientProject.findUnique({
      where: { releaseTokenHash: hash },
      select: { id: true, name: true, clientId: true },
    });
  }

  findTicket(id: string) {
    return this.prisma.supportTicket.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        clientId: true,
        projectId: true,
        messages: { orderBy: { createdAt: 'asc' }, take: 1, select: { body: true } },
      },
    });
  }

  list(projectId: string, status?: TaskStatus | 'open'): Promise<TaskRow[]> {
    const where: Prisma.ProjectTaskWhereInput = { projectId };
    if (status === 'open') where.status = { not: 'DONE' };
    else if (status) where.status = status;
    return this.prisma.projectTask.findMany({ where, include, orderBy: order });
  }

  findTask(projectId: string, id: string): Promise<TaskRow | null> {
    return this.prisma.projectTask.findFirst({ where: { id, projectId }, include });
  }

  create(data: Prisma.ProjectTaskUncheckedCreateInput): Promise<TaskRow> {
    return this.prisma.projectTask.create({ data, include });
  }

  update(id: string, data: Prisma.ProjectTaskUncheckedUpdateInput): Promise<TaskRow> {
    return this.prisma.projectTask.update({ where: { id }, data, include });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.projectTask.delete({ where: { id } });
  }

  /** Whether every task made from the request is done (it can be resolved then). */
  async allDoneForTicket(ticketId: string): Promise<boolean> {
    const open = await this.prisma.projectTask.count({
      where: { ticketId, status: { not: 'DONE' } },
    });
    return open === 0;
  }
}
