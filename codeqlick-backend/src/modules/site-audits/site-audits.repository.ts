import { Injectable } from '@nestjs/common';
import type { Prisma, SiteAudit } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class SiteAuditsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.SiteAuditUncheckedCreateInput): Promise<SiteAudit> {
    return this.prisma.siteAudit.create({ data });
  }

  find(id: string): Promise<SiteAudit | null> {
    return this.prisma.siteAudit.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.SiteAuditUncheckedUpdateInput): Promise<SiteAudit> {
    return this.prisma.siteAudit.update({ where: { id }, data });
  }

  /** The email's latest check of `host` since `since`. */
  findRecent(email: string, host: string, since: Date): Promise<SiteAudit | null> {
    return this.prisma.siteAudit.findFirst({
      where: { email, host, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    });
  }

  countSince(email: string, since: Date): Promise<number> {
    return this.prisma.siteAudit.count({ where: { email, createdAt: { gte: since } } });
  }

  pendingSince(since: Date): Promise<Array<{ id: string }>> {
    return this.prisma.siteAudit.findMany({
      where: { status: 'PENDING', createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
  }

  /** PENDING checks from before `before` (the run was lost in a restart) become FAILED. */
  async failStale(before: Date): Promise<number> {
    const { count } = await this.prisma.siteAudit.updateMany({
      where: { status: 'PENDING', createdAt: { lt: before } },
      data: { status: 'FAILED', error: 'Interrupted', finishedAt: new Date() },
    });
    return count;
  }

  async deleteOlderThan(before: Date): Promise<number> {
    const { count } = await this.prisma.siteAudit.deleteMany({
      where: { createdAt: { lt: before } },
    });
    return count;
  }
}
