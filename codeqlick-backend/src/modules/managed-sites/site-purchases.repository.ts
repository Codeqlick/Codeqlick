import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const withSite = {
  lead: { select: { company: true, siteRequest: true } },
  project: { select: { site: { select: { slug: true, domain: true } } } },
} as const;

/** Previews bought online (architecture 8.2, decision 20). */
@Injectable()
export class SitePurchasesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** What buying a preview needs to know about its lead. */
  leadBySlug(slug: string) {
    return this.prisma.lead.findFirst({
      where: { previewSlug: slug },
      select: {
        id: true,
        name: true,
        email: true,
        locale: true,
        clientId: true,
        siteRequest: true,
        previewStatus: true,
        purchases: { where: { status: 'PAID' }, select: { id: true } },
      },
    });
  }

  create(data: Prisma.SitePurchaseUncheckedCreateInput) {
    return this.prisma.sitePurchase.create({ data });
  }

  findBySession(stripeSessionId: string) {
    return this.prisma.sitePurchase.findUnique({ where: { stripeSessionId }, include: withSite });
  }

  /**
   * Marks a purchase paid, once: false when it already was (Stripe may send an event again), so
   * its site is only made by the first.
   */
  async markPaid(stripeSessionId: string, email: string | null, now: Date): Promise<boolean> {
    const { count } = await this.prisma.sitePurchase.updateMany({
      where: { stripeSessionId, status: { not: 'PAID' } },
      data: { status: 'PAID', paidAt: now, ...(email ? { email } : {}) },
    });
    return count === 1;
  }

  markExpired(stripeSessionId: string) {
    return this.prisma.sitePurchase.updateMany({
      where: { stripeSessionId, status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });
  }

  update(id: string, data: Prisma.SitePurchaseUncheckedUpdateInput) {
    return this.prisma.sitePurchase.update({ where: { id }, data });
  }

  /** A lead's purchases, newest first (the lead page). */
  forLead(leadId: string) {
    return this.prisma.sitePurchase.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      include: withSite,
    });
  }

  /** Whether a managed site or a preview already has the name (both are folders of the builder). */
  async slugTaken(slug: string): Promise<boolean> {
    const [site, preview] = await Promise.all([
      this.prisma.managedSite.findUnique({ where: { slug }, select: { id: true } }),
      this.prisma.lead.findUnique({ where: { previewSlug: slug }, select: { id: true } }),
    ]);
    return site !== null || preview !== null;
  }

  /** Who makes a bought website: the team's oldest active admin. */
  teamAdmin() {
    return this.prisma.user.findFirst({
      where: { role: 'ADMIN', isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true, name: true },
    });
  }
}
