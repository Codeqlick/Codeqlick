import { Injectable } from '@nestjs/common';
import type { Lead, LeadStatus, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface LeadFilter {
  status?: LeadStatus;
  q?: string;
}

@Injectable()
export class LeadsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.LeadCreateInput): Promise<Lead> {
    return this.prisma.lead.create({ data });
  }

  async list(
    filter: LeadFilter,
    skip: number,
    take: number,
  ): Promise<{ items: Lead[]; total: number }> {
    const where: Prisma.LeadWhereInput = {};
    if (filter.status) where.status = filter.status;
    if (filter.q) {
      where.OR = [
        { name: { contains: filter.q, mode: 'insensitive' } },
        { email: { contains: filter.q, mode: 'insensitive' } },
        { company: { contains: filter.q, mode: 'insensitive' } },
        { message: { contains: filter.q, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.lead.count({ where }),
    ]);
    return { items, total };
  }

  findById(id: string): Promise<Lead | null> {
    return this.prisma.lead.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.LeadUpdateInput): Promise<Lead> {
    return this.prisma.lead.update({ where: { id }, data });
  }
}
