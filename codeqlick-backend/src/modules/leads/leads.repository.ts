import { Injectable } from '@nestjs/common';
import type { Lead, LeadReply, LeadStatus, Prisma } from '../../generated/prisma/client.js';
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
    const where = toWhere(filter);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.lead.count({ where }),
    ]);
    return { items, total };
  }

  /** Every matching lead, newest first, up to `limit` rows (for exports). */
  listAll(filter: LeadFilter, limit: number): Promise<Lead[]> {
    return this.prisma.lead.findMany({
      where: toWhere(filter),
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  findById(id: string): Promise<Lead | null> {
    return this.prisma.lead.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.LeadUpdateInput): Promise<Lead> {
    return this.prisma.lead.update({ where: { id }, data });
  }

  /** Replies to a lead, oldest first: the order of the conversation. */
  listReplies(leadId: string): Promise<LeadReply[]> {
    return this.prisma.leadReply.findMany({ where: { leadId }, orderBy: { createdAt: 'asc' } });
  }

  /**
   * Stores a sent reply and, for a lead nobody had answered yet, moves it to TALKING.
   * Returns the reply and the lead as it is afterwards.
   */
  async addReply(
    data: Prisma.LeadReplyUncheckedCreateInput,
  ): Promise<{ reply: LeadReply; lead: Lead }> {
    return this.prisma.$transaction(async (tx) => {
      const reply = await tx.leadReply.create({ data });
      await tx.lead.updateMany({
        where: { id: data.leadId, status: 'NEW' },
        data: { status: 'TALKING' },
      });
      const lead = await tx.lead.findUniqueOrThrow({ where: { id: data.leadId } });
      return { reply, lead };
    });
  }
}

function toWhere(filter: LeadFilter): Prisma.LeadWhereInput {
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
  return where;
}
