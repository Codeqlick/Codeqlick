import { Injectable } from '@nestjs/common';
import type { Prisma, ProjectBrief } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export type ProjectRef = { id: string; name: string; clientId: string };

@Injectable()
export class BriefsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProject(id: string): Promise<ProjectRef | null> {
    return this.prisma.clientProject.findUnique({
      where: { id },
      select: { id: true, name: true, clientId: true },
    });
  }

  findProjectByKeyHash(hash: string): Promise<ProjectRef | null> {
    return this.prisma.clientProject.findUnique({
      where: { releaseTokenHash: hash },
      select: { id: true, name: true, clientId: true },
    });
  }

  find(projectId: string): Promise<ProjectBrief | null> {
    return this.prisma.projectBrief.findUnique({ where: { projectId } });
  }

  /** Creates it when missing; an existing one (answers included) is left as it is. */
  async ensure(projectId: string): Promise<{ brief: ProjectBrief; created: boolean }> {
    const existing = await this.find(projectId);
    if (existing) return { brief: existing, created: false };
    try {
      return {
        brief: await this.prisma.projectBrief.create({ data: { projectId } }),
        created: true,
      };
    } catch {
      // Created meanwhile by another request.
      return { brief: (await this.find(projectId))!, created: false };
    }
  }

  save(
    projectId: string,
    answers: Prisma.InputJsonValue,
    submitted: boolean,
  ): Promise<ProjectBrief> {
    return this.prisma.projectBrief.upsert({
      where: { projectId },
      create: {
        projectId,
        answers,
        ...(submitted ? { status: 'SUBMITTED', submittedAt: new Date() } : {}),
      },
      update: {
        answers,
        ...(submitted ? { status: 'SUBMITTED', submittedAt: new Date() } : {}),
      },
    });
  }
}
