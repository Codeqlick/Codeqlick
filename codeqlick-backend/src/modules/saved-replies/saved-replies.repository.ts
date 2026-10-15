import { Injectable } from '@nestjs/common';
import type { SavedReply } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class SavedRepliesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<SavedReply[]> {
    return this.prisma.savedReply.findMany({ orderBy: { title: 'asc' } });
  }

  findById(id: string): Promise<SavedReply | null> {
    return this.prisma.savedReply.findUnique({ where: { id } });
  }

  create(data: { title: string; body: string }): Promise<SavedReply> {
    return this.prisma.savedReply.create({ data });
  }

  update(id: string, data: { title?: string; body?: string }): Promise<SavedReply> {
    return this.prisma.savedReply.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.savedReply.delete({ where: { id } });
  }
}
