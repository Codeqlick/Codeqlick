import { Injectable } from '@nestjs/common';
import type {
  ClientProject,
  Prisma,
  ProjectPhase,
  ProjectUpdate,
  User,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

type ClientRef = Pick<User, 'id' | 'name' | 'email'>;
type UpdateWithAuthor = ProjectUpdate & { author: Pick<User, 'name'> | null };

export type ProjectWithClient = ClientProject & { client: ClientRef };
export type ProjectWithUpdates = ProjectWithClient & { updates: UpdateWithAuthor[] };

const clientSelect = { select: { id: true, name: true, email: true } } as const;
const updatesInclude = {
  orderBy: { createdAt: 'desc' },
  include: { author: { select: { name: true } } },
} as const;

export interface ProjectFilter {
  clientId?: string;
  phase?: ProjectPhase;
}

@Injectable()
export class ProjectsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async list(
    filter: ProjectFilter,
    skip: number,
    take: number,
  ): Promise<{ items: ProjectWithClient[]; total: number }> {
    const where: Prisma.ClientProjectWhereInput = {};
    if (filter.clientId) where.clientId = filter.clientId;
    if (filter.phase) where.phase = filter.phase;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.clientProject.findMany({
        where,
        include: { client: clientSelect },
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.clientProject.count({ where }),
    ]);
    return { items, total };
  }

  listByClient(clientId: string): Promise<ProjectWithClient[]> {
    return this.prisma.clientProject.findMany({
      where: { clientId },
      include: { client: clientSelect },
      orderBy: { updatedAt: 'desc' },
    });
  }

  findById(id: string): Promise<ProjectWithUpdates | null> {
    return this.prisma.clientProject.findUnique({
      where: { id },
      include: { client: clientSelect, updates: updatesInclude },
    });
  }

  create(data: Prisma.ClientProjectUncheckedCreateInput): Promise<ProjectWithUpdates> {
    return this.prisma.clientProject.create({
      data,
      include: { client: clientSelect, updates: updatesInclude },
    });
  }

  update(id: string, data: Prisma.ClientProjectUncheckedUpdateInput): Promise<ProjectWithUpdates> {
    return this.prisma.clientProject.update({
      where: { id },
      data,
      include: { client: clientSelect, updates: updatesInclude },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.clientProject.delete({ where: { id } });
  }

  /** Adds a progress update and bumps the project's updatedAt. */
  async addUpdate(
    projectId: string,
    authorId: string,
    title: string,
    body: string,
  ): Promise<UpdateWithAuthor> {
    return this.prisma.$transaction(async (tx) => {
      const update = await tx.projectUpdate.create({
        data: { projectId, authorId, title, body },
        include: { author: { select: { name: true } } },
      });
      await tx.clientProject.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
      return update;
    });
  }
}
