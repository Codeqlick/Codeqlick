import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Request previews live on their leads (`previewSlug`, `previewStatus`, `previewBuiltAt`). */
@Injectable()
export class SitePreviewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Previews started since `since` (the daily cap). */
  countSince(since: Date): Promise<number> {
    return this.prisma.lead.count({
      where: { previewSlug: { not: null }, createdAt: { gte: since } },
    });
  }

  slugTaken(slug: string): Promise<boolean> {
    return this.prisma.lead.count({ where: { previewSlug: slug } }).then((count) => count > 0);
  }

  /** The public status of a preview, by its slug. */
  findBySlug(slug: string) {
    return this.prisma.lead.findFirst({
      where: { previewSlug: slug },
      select: { previewStatus: true },
    });
  }

  find(leadId: string) {
    return this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, previewSlug: true, previewStatus: true },
    });
  }

  update(leadId: string, data: Prisma.LeadUpdateInput): Promise<void> {
    return this.prisma.lead.update({ where: { id: leadId }, data }).then(() => undefined);
  }

  /**
   * Leads to ask about their preview: READY since before `builtBefore`, nobody has answered them
   * (still NEW), not converted and not asked yet.
   */
  followUpsDue(builtBefore: Date) {
    return this.prisma.lead.findMany({
      where: {
        previewStatus: 'READY',
        previewSlug: { not: null },
        previewBuiltAt: { lte: builtBefore },
        previewFollowUpAt: null,
        status: 'NEW',
        clientId: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        company: true,
        locale: true,
        previewSlug: true,
        followUpOn: true,
      },
    });
  }

  /** Previews to take down: older than `before`, or of a lead converted or marked as spam. */
  due(before: Date) {
    return this.prisma.lead.findMany({
      where: {
        previewSlug: { not: null },
        previewStatus: { in: ['BUILDING', 'READY', 'FAILED'] },
        OR: [{ createdAt: { lt: before } }, { clientId: { not: null } }, { status: 'SPAM' }],
      },
      select: { id: true },
    });
  }
}
