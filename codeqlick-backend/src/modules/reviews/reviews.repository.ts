import { Injectable } from '@nestjs/common';
import type { ClientReview, Locale, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class ReviewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProject(id: string) {
    return this.prisma.clientProject.findUnique({
      where: { id },
      select: { id: true, name: true, clientId: true },
    });
  }

  find(projectId: string): Promise<ClientReview | null> {
    return this.prisma.clientReview.findUnique({ where: { projectId } });
  }

  /** Creates it unless there is one already; null then. */
  async createIfMissing(projectId: string): Promise<ClientReview | null> {
    if (await this.find(projectId)) return null;
    try {
      return await this.prisma.clientReview.create({ data: { projectId } });
    } catch {
      return null;
    }
  }

  update(projectId: string, data: Prisma.ClientReviewUpdateInput): Promise<ClientReview> {
    return this.prisma.clientReview.update({ where: { projectId }, data });
  }

  published(locale: Locale, take: number): Promise<ClientReview[]> {
    return this.prisma.clientReview.findMany({
      where: { status: 'PUBLISHED', consent: true, locale },
      orderBy: { publishedAt: 'desc' },
      take,
    });
  }
}
