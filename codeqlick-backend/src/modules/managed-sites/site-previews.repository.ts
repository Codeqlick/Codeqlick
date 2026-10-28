import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Request previews live on their leads (`previewSlug`, `previewStatus`, `previewBuiltAt`). */
@Injectable()
export class SitePreviewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Previews started or rebuilt since `since` (the daily cap). */
  countSince(since: Date): Promise<number> {
    return this.prisma.lead.count({
      where: {
        previewSlug: { not: null },
        OR: [{ createdAt: { gte: since } }, { previewBuiltAt: { gte: since } }],
      },
    });
  }

  /** Every lead with a preview, newest first (Admin → Vistas previas). */
  list(limit: number) {
    return this.prisma.lead.findMany({
      where: { previewSlug: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        siteRequest: true,
        previewSlug: true,
        previewStatus: true,
        previewBuiltAt: true,
        createdById: true,
        createdAt: true,
        purchases: { where: { status: 'PAID' }, select: { id: true } },
      },
    });
  }

  /** What rebuilding a lead's preview needs. */
  findForBuild(leadId: string) {
    return this.prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        name: true,
        email: true,
        locale: true,
        siteRequest: true,
        previewSlug: true,
        previewStatus: true,
      },
    });
  }

  slugTaken(slug: string): Promise<boolean> {
    return this.prisma.lead.count({ where: { previewSlug: slug } }).then((count) => count > 0);
  }

  /** The public status of a preview, by its slug. */
  findBySlug(slug: string) {
    return this.prisma.lead.findFirst({
      where: { previewSlug: slug },
      select: { previewStatus: true, company: true },
    });
  }

  /** Whether the lead has an online purchase (its record is kept: the lead can't be deleted). */
  async hasPurchases(leadId: string): Promise<boolean> {
    return (await this.prisma.sitePurchase.count({ where: { leadId } })) > 0;
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
        // A prospect the team added is never emailed automatically.
        createdById: null,
        email: { not: null },
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
        OR: [
          // 30 days from its last build (a rebuild starts them again), or from the request.
          { previewBuiltAt: { lt: before } },
          { previewBuiltAt: null, createdAt: { lt: before } },
          { clientId: { not: null } },
          { status: 'SPAM' },
        ],
      },
      select: { id: true },
    });
  }
}
