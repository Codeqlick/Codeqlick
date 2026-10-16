import { Injectable } from '@nestjs/common';
import type { Prisma, ProposalTemplate } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export type TemplateData = {
  name: string;
  title: string;
  summary: string;
  terms: string | null;
  validDays: number | null;
  items: Prisma.InputJsonValue;
};

@Injectable()
export class ProposalTemplatesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<ProposalTemplate[]> {
    return this.prisma.proposalTemplate.findMany({ orderBy: { name: 'asc' } });
  }

  find(id: string): Promise<ProposalTemplate | null> {
    return this.prisma.proposalTemplate.findUnique({ where: { id } });
  }

  /** Creates it, or replaces the one with the same name. */
  save(data: TemplateData): Promise<ProposalTemplate> {
    return this.prisma.proposalTemplate.upsert({
      where: { name: data.name },
      create: data,
      update: data,
    });
  }

  update(id: string, data: TemplateData): Promise<ProposalTemplate> {
    return this.prisma.proposalTemplate.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.proposalTemplate.delete({ where: { id } });
  }
}
