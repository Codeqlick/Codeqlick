import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const withCreator = { createdBy: { select: { id: true, name: true } } } as const;
export type HookRow = Prisma.CloudDeployHookGetPayload<{ include: typeof withCreator }>;

const withProject = {
  project: {
    select: {
      id: true,
      slug: true,
      name: true,
      teamId: true,
      gitBranch: true,
      gitInstallationId: true,
      gitRepoId: true,
      gitRepo: true,
      deletedAt: true,
      suspendedAt: true,
      team: { select: { slug: true, plan: true } },
    },
  },
} as const;
export type HookWithProject = Prisma.CloudDeployHookGetPayload<{ include: typeof withProject }>;

/** Deploy hooks (architecture 4.13 "Deploy hooks", decision 51). */
@Injectable()
export class CloudDeployHooksRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(projectId: string): Promise<HookRow[]> {
    return this.prisma.cloudDeployHook.findMany({
      where: { projectId },
      include: withCreator,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  find(projectId: string, id: string): Promise<HookRow | null> {
    return this.prisma.cloudDeployHook.findFirst({
      where: { id, projectId },
      include: withCreator,
    });
  }

  create(data: Prisma.CloudDeployHookUncheckedCreateInput): Promise<HookRow> {
    return this.prisma.cloudDeployHook.create({ data, include: withCreator });
  }

  async delete(projectId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.cloudDeployHook.deleteMany({ where: { id, projectId } });
    return count > 0;
  }

  /** The hook a token (by its SHA-256) belongs to, with its project. */
  findByTokenHash(tokenHash: string): Promise<HookWithProject | null> {
    return this.prisma.cloudDeployHook.findUnique({ where: { tokenHash }, include: withProject });
  }

  async touch(id: string, at: Date): Promise<void> {
    await this.prisma.cloudDeployHook.updateMany({ where: { id }, data: { lastCalledAt: at } });
  }
}
