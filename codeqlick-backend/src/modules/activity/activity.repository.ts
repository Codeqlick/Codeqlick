import { Injectable } from '@nestjs/common';
import type { ActivityLog, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class ActivityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.ActivityLogUncheckedCreateInput): Promise<void> {
    await this.prisma.activityLog.create({ data });
  }

  async list(
    targetType: string | undefined,
    skip: number,
    take: number,
  ): Promise<{ items: ActivityLog[]; total: number }> {
    const where: Prisma.ActivityLogWhereInput = targetType ? { targetType } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.activityLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.activityLog.count({ where }),
    ]);
    return { items, total };
  }
}
