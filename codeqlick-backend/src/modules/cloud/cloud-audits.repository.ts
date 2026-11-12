import { Injectable } from '@nestjs/common';
import type { CloudAudit, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Website checks run through Cloud's API (architecture 4.13, Website check API). */
@Injectable()
export class CloudAuditsRepository {
  constructor(private readonly prisma: PrismaService) {}

  countSince(teamId: string, since: Date): Promise<number> {
    return this.prisma.cloudAudit.count({ where: { teamId, createdAt: { gte: since } } });
  }

  create(data: Prisma.CloudAuditUncheckedCreateInput): Promise<CloudAudit> {
    return this.prisma.cloudAudit.create({ data });
  }

  find(id: string): Promise<CloudAudit | null> {
    return this.prisma.cloudAudit.findUnique({ where: { id } });
  }

  list(teamId: string, skip: number, take: number) {
    return this.prisma.$transaction([
      this.prisma.cloudAudit.findMany({
        where: { teamId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true, url: true, score: true, createdAt: true },
        skip,
        take,
      }),
      this.prisma.cloudAudit.count({ where: { teamId } }),
    ]);
  }

  async deleteBefore(date: Date): Promise<void> {
    await this.prisma.cloudAudit.deleteMany({ where: { createdAt: { lt: date } } });
  }
}
