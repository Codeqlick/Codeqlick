import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const select = {
  id: true,
  name: true,
  clientId: true,
  domainName: true,
  domainSource: true,
  domainExpiresAt: true,
  domainCheckedAt: true,
  domainWarnedFor: true,
} as const;

export type DomainRow = Prisma.ClientProjectGetPayload<{ select: typeof select }>;

@Injectable()
export class DomainsRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(projectId: string): Promise<DomainRow | null> {
    return this.prisma.clientProject.findUnique({ where: { id: projectId }, select });
  }

  /** Every watched domain. */
  watched(): Promise<DomainRow[]> {
    return this.prisma.clientProject.findMany({ where: { domainName: { not: null } }, select });
  }

  update(projectId: string, data: Prisma.ClientProjectUpdateInput): Promise<DomainRow> {
    return this.prisma.clientProject.update({ where: { id: projectId }, data, select });
  }

  /** Watches the domain of a managed site when the project has none yet. */
  async adoptDomain(projectId: string, domainName: string): Promise<void> {
    await this.prisma.clientProject.updateMany({
      where: { id: projectId, domainName: null },
      data: { domainName, domainSource: 'RDAP' },
    });
  }
}
