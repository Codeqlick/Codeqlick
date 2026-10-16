import { Injectable } from '@nestjs/common';
import type { Prisma, ProjectCredential } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export type CredentialRow = ProjectCredential & { createdBy: { name: string } | null };

const include = { createdBy: { select: { name: true } } } as const;

@Injectable()
export class CredentialsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProject(id: string) {
    return this.prisma.clientProject.findUnique({
      where: { id },
      select: { id: true, name: true, clientId: true },
    });
  }

  list(projectId: string): Promise<CredentialRow[]> {
    return this.prisma.projectCredential.findMany({
      where: { projectId },
      include,
      orderBy: { createdAt: 'asc' },
    });
  }

  find(projectId: string, id: string): Promise<CredentialRow | null> {
    return this.prisma.projectCredential.findFirst({ where: { id, projectId }, include });
  }

  create(data: Prisma.ProjectCredentialUncheckedCreateInput): Promise<CredentialRow> {
    return this.prisma.projectCredential.create({ data, include });
  }

  async markViewed(id: string): Promise<void> {
    await this.prisma.projectCredential.update({ where: { id }, data: { viewedAt: new Date() } });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.projectCredential.delete({ where: { id } });
  }

  async deleteAll(projectId: string): Promise<number> {
    return (await this.prisma.projectCredential.deleteMany({ where: { projectId } })).count;
  }
}
