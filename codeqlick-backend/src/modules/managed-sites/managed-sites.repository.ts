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

  list(): Promise<SiteRow[]> {
    return this.prisma.managedSite.findMany({ include, orderBy: { createdAt: 'desc' } });
  }

  create(data: Prisma.ManagedSiteUncheckedCreateInput): Promise<SiteRow> {
    return this.prisma.managedSite.create({ data, include });
  }

  update(id: string, data: Prisma.ManagedSiteUncheckedUpdateInput): Promise<SiteRow> {
    return this.prisma.managedSite.update({ where: { id }, data, include });
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
