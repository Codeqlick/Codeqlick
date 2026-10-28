import { Injectable } from '@nestjs/common';
import type { ManagedSite, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const KEEP_REVISIONS = 20;

export type SiteRow = ManagedSite & {
  project: { id: string; name: string; client: { id: string; name: string; email: string } };
};

const include = {
  project: {
    select: { id: true, name: true, client: { select: { id: true, name: true, email: true } } },
  },
} as const;

@Injectable()
export class ManagedSitesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProject(id: string) {
    return this.prisma.clientProject.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        clientId: true,
        client: { select: { name: true, email: true } },
      },
    });
  }

  findByDraftKey(draftKey: string): Promise<SiteRow | null> {
    return this.prisma.managedSite.findUnique({ where: { draftKey }, include });
  }

  findByProject(projectId: string): Promise<SiteRow | null> {
    return this.prisma.managedSite.findUnique({ where: { projectId }, include });
  }

  findBySlugOrDomain(slug: string, domain: string | null) {
    return this.prisma.managedSite.findFirst({
      where: { OR: [{ slug }, ...(domain ? [{ domain }] : [])] },
      select: { id: true, slug: true, domain: true, projectId: true },
    });
  }

  findByDomain(domain: string) {
    return this.prisma.managedSite.findUnique({ where: { domain }, select: { id: true } });
  }

  /** Sites with a domain of their own, for the domain checks. */
  withDomain(): Promise<SiteRow[]> {
    return this.prisma.managedSite.findMany({ where: { domain: { not: null } }, include });
  }

  /** Sites live on their domain whose report for `month` (`yyyy-mm`) hasn't gone out. */
  reportsDue(month: string): Promise<SiteRow[]> {
    return this.prisma.managedSite.findMany({
      where: {
        domainState: 'LIVE',
        OR: [{ reportedMonth: null }, { reportedMonth: { lt: month } }],
      },
      include,
    });
  }

  /** The active people of a client account who want the monthly report. */
  reportRecipients(accountId: string) {
    return this.prisma.user.findMany({
      where: {
        OR: [{ id: accountId }, { memberOfId: accountId }],
        isActive: true,
        monthlyReport: true,
        registeredAt: { not: null },
      },
      orderBy: { createdAt: 'asc' },
      select: { name: true, email: true, locale: true },
    });
  }

  /** The project's uptime checks in [from, to). */
  checksBetween(projectId: string, from: Date, to: Date) {
    return this.prisma.siteCheck.findMany({
      where: { monitor: { projectId }, checkedAt: { gte: from, lt: to } },
      select: { ok: true },
    });
  }

  /** Messages sent through the project's form between two `yyyy-mm-dd` days, both included. */
  async formMessagesBetween(projectId: string, first: string, last: string): Promise<number> {
    const days = await this.prisma.siteFormDay.findMany({
      where: {
        form: { projectId },
        day: { gte: new Date(`${first}T00:00:00Z`), lte: new Date(`${last}T00:00:00Z`) },
      },
      select: { count: true },
    });
    return days.reduce((sum, day) => sum + day.count, 0);
  }

  list(): Promise<SiteRow[]> {
    return this.prisma.managedSite.findMany({ include, orderBy: { createdAt: 'desc' } });
  }

  create(data: Prisma.ManagedSiteUncheckedCreateInput): Promise<SiteRow> {
    return this.prisma.managedSite.create({ data, include });
  }

  update(id: string, data: Prisma.ManagedSiteUncheckedUpdateInput): Promise<SiteRow> {
    return this.prisma.managedSite.update({ where: { id }, data, include });
  }

  /**
   * Deletes the site (its revisions go with it); the project loses its addresses and its monitor
   * is turned off.
   */
  async remove(siteId: string, projectId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.managedSite.delete({ where: { id: siteId } }),
      this.prisma.clientProject.update({
        where: { id: projectId },
        data: { stagingUrl: null, productionUrl: null },
      }),
      this.prisma.siteMonitor.updateMany({ where: { projectId }, data: { enabled: false } }),
    ]);
  }

  /** The project's preview (staging) and live (production) addresses follow the site's. */
  async setProjectUrls(projectId: string, stagingUrl: string, productionUrl: string) {
    await this.prisma.clientProject.update({
      where: { id: projectId },
      data: { stagingUrl, productionUrl },
    });
  }

  /** Keeps the content before a change; only the latest revisions are kept. */
  async addRevision(siteId: string, content: Prisma.InputJsonValue, authorId: string | null) {
    await this.prisma.managedSiteRevision.create({ data: { siteId, content, authorId } });
    const old = await this.prisma.managedSiteRevision.findMany({
      where: { siteId },
      orderBy: { createdAt: 'desc' },
      skip: KEEP_REVISIONS,
      select: { id: true },
    });
    if (old.length > 0) {
      await this.prisma.managedSiteRevision.deleteMany({
        where: { id: { in: old.map((row) => row.id) } },
      });
    }
  }

  revisions(siteId: string) {
    return this.prisma.managedSiteRevision.findMany({
      where: { siteId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, author: { select: { name: true } } },
    });
  }

  findRevision(siteId: string, id: string) {
    return this.prisma.managedSiteRevision.findFirst({ where: { id, siteId } });
  }
}
