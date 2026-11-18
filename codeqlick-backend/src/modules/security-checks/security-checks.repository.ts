import { Injectable } from '@nestjs/common';
import type { Prisma, SecurityCheck } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { storedRetireSchema, type RetireRepository } from './retire.js';

/** The `settings` row that holds the last good copy of the Retire.js data. */
export const RETIRE_SETTINGS_KEY = 'securityRetireData';

@Injectable()
export class SecurityChecksRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.SecurityCheckUncheckedCreateInput): Promise<SecurityCheck> {
    return this.prisma.securityCheck.create({ data });
  }

  find(id: string): Promise<SecurityCheck | null> {
    return this.prisma.securityCheck.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.SecurityCheckUncheckedUpdateInput): Promise<SecurityCheck> {
    return this.prisma.securityCheck.update({ where: { id }, data });
  }

  /** The email's latest check of `domain` since `since` (a failed one is not reused). */
  findRecent(email: string, domain: string, since: Date): Promise<SecurityCheck | null> {
    return this.prisma.securityCheck.findFirst({
      where: { email, domain, status: { not: 'FAILED' }, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    });
  }

  countByEmailSince(email: string, since: Date): Promise<number> {
    return this.prisma.securityCheck.count({ where: { email, createdAt: { gte: since } } });
  }

  /** Checks of the registrable domain or any of its subdomains. */
  countByDomainSince(registrable: string, since: Date): Promise<number> {
    return this.prisma.securityCheck.count({
      where: {
        OR: [{ domain: registrable }, { domain: { endsWith: `.${registrable}` } }],
        createdAt: { gte: since },
      },
    });
  }

  countSince(since: Date): Promise<number> {
    return this.prisma.securityCheck.count({ where: { createdAt: { gte: since } } });
  }

  pendingSince(since: Date): Promise<Array<{ id: string }>> {
    return this.prisma.securityCheck.findMany({
      where: { status: 'PENDING', createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
  }

  /** PENDING checks from before `before` (the run was lost in a restart). */
  pendingBefore(before: Date): Promise<Array<{ id: string }>> {
    return this.prisma.securityCheck.findMany({
      where: { status: 'PENDING', createdAt: { lt: before } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
  }

  async deleteOlderThan(before: Date): Promise<number> {
    const { count } = await this.prisma.securityCheck.deleteMany({
      where: { createdAt: { lt: before } },
    });
    return count;
  }

  /** The team's list, newest first. */
  async list(
    where: Prisma.SecurityCheckWhereInput,
    skip: number,
    take: number,
  ): Promise<{ items: SecurityCheck[]; total: number }> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.securityCheck.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.securityCheck.count({ where }),
    ]);
    return { items, total };
  }

  /** The cached Retire.js data, or null when there is none (or it isn't readable). */
  async retireData(): Promise<{ fetchedAt: Date; data: RetireRepository } | null> {
    const row = await this.prisma.setting.findUnique({ where: { key: RETIRE_SETTINGS_KEY } });
    const parsed = storedRetireSchema.safeParse(row?.value);
    if (!parsed.success) return null;
    const fetchedAt = new Date(parsed.data.fetchedAt);
    return Number.isNaN(fetchedAt.getTime()) ? null : { fetchedAt, data: parsed.data.data };
  }

  async saveRetireData(data: RetireRepository, fetchedAt: Date): Promise<void> {
    const value = { fetchedAt: fetchedAt.toISOString(), data } as unknown as Prisma.InputJsonValue;
    await this.prisma.setting.upsert({
      where: { key: RETIRE_SETTINGS_KEY },
      create: { key: RETIRE_SETTINGS_KEY, value },
      update: { value },
    });
  }
}
