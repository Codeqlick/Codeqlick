import { Injectable } from '@nestjs/common';
import type {
  Locale,
  Menu,
  MenuReport,
  MenuReportStatus,
  MenuSlugRedirect,
  Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export type MenuWithOwner = Menu & {
  owner: { id: string; name: string; email: string; locale: Locale };
};
export type AdminMenuRow = Menu & {
  owner: { id: string; name: string; email: string };
  _count: { reports: number };
};
export type ReportRow = MenuReport & {
  menu: { id: string; slug: string; suspendedAt: Date | null } | null;
};
export type RedirectRow = MenuSlugRedirect & { menu: { id: string; ownerId: string } };

/** What a slug change does to the redirect rows. */
export interface SlugMove {
  /** The new slug: its redirect rows (expired, or the owner's own) are deleted first. */
  claim?: string;
  /** The old slug: becomes a redirect until `expiresAt`. */
  leave?: { slug: string; expiresAt: Date };
}

@Injectable()
export class MenusRepository {
  constructor(private readonly prisma: PrismaService) {}

  listByOwner(ownerId: string): Promise<Menu[]> {
    return this.prisma.menu.findMany({ where: { ownerId }, orderBy: { createdAt: 'asc' } });
  }

  findById(id: string): Promise<Menu | null> {
    return this.prisma.menu.findUnique({ where: { id } });
  }

  findBySlug(slug: string): Promise<Menu | null> {
    return this.prisma.menu.findUnique({ where: { slug } });
  }

  findRedirect(slug: string): Promise<RedirectRow | null> {
    return this.prisma.menuSlugRedirect.findUnique({
      where: { slug },
      include: { menu: { select: { id: true, ownerId: true } } },
    });
  }

  /** The redirects still working, newest first. */
  activeRedirects(menuId: string, now: Date): Promise<MenuSlugRedirect[]> {
    return this.prisma.menuSlugRedirect.findMany({
      where: { menuId, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Creates the menu unless the owner already has `max`, under a lock per owner so two requests
   * can't both pass the check. Null when the limit is reached.
   */
  async createWithinLimit(
    ownerId: string,
    max: number,
    data: Prisma.MenuUncheckedCreateInput,
    now: Date,
  ): Promise<Menu | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`menus:${ownerId}`}))`;
      if ((await tx.menu.count({ where: { ownerId } })) >= max) return null;
      await tx.menuSlugRedirect.deleteMany({
        where: { slug: data.slug, OR: [{ expiresAt: { lte: now } }, { menu: { ownerId } }] },
      });
      return tx.menu.create({ data });
    });
  }

  /**
   * Updates the menu if it is still at `revision` (then +1); null when someone saved first. A slug
   * change takes over the new slug's redirect rows and leaves the old one as a redirect.
   */
  async update(
    id: string,
    revision: number,
    data: Prisma.MenuUncheckedUpdateManyInput,
    move: SlugMove,
    now: Date,
  ): Promise<Menu | null> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.menu.findUnique({ where: { id }, select: { ownerId: true } });
      if (!current) return null;
      const { count } = await tx.menu.updateMany({
        where: { id, revision },
        data: { ...data, revision: { increment: 1 } },
      });
      // Stale revision: nothing else is touched (the transaction would commit it).
      if (count === 0) return null;
      if (move.claim !== undefined) {
        await tx.menuSlugRedirect.deleteMany({
          where: {
            slug: move.claim,
            OR: [{ expiresAt: { lte: now } }, { menu: { ownerId: current.ownerId } }],
          },
        });
      }
      if (move.leave) {
        // A redirect that exists for that slug is replaced: it always gets the full period.
        await tx.menuSlugRedirect.deleteMany({ where: { slug: move.leave.slug } });
        await tx.menuSlugRedirect.create({
          data: { menuId: id, slug: move.leave.slug, expiresAt: move.leave.expiresAt },
        });
      }
      return tx.menu.findUnique({ where: { id } });
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.menu.delete({ where: { id } });
  }

  // ---- Public ---------------------------------------------------------------------------------

  /** Enabled, not suspended, indexable menus for the sitemap. */
  sitemap(limit: number): Promise<Array<Pick<Menu, 'slug' | 'language' | 'updatedAt'>>> {
    return this.prisma.menu.findMany({
      where: { enabled: true, suspendedAt: null, indexable: true },
      select: { slug: true, language: true, updatedAt: true },
      orderBy: { slug: 'asc' },
      take: limit,
    });
  }

  createReport(data: Prisma.MenuReportUncheckedCreateInput): Promise<MenuReport> {
    return this.prisma.menuReport.create({ data });
  }

  // ---- Admin ----------------------------------------------------------------------------------

  async adminMenus(
    q: string | undefined,
    suspended: boolean | undefined,
    skip: number,
    take: number,
  ): Promise<[AdminMenuRow[], number]> {
    const where: Prisma.MenuWhereInput = {
      ...(q
        ? {
            OR: [
              { slug: { contains: q, mode: 'insensitive' } },
              { businessName: { contains: q, mode: 'insensitive' } },
              { owner: { email: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(suspended === undefined ? {} : { suspendedAt: suspended ? { not: null } : null }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.menu.findMany({
        where,
        include: {
          owner: { select: { id: true, name: true, email: true } },
          _count: { select: { reports: { where: { status: 'OPEN' } } } },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.menu.count({ where }),
    ]);
    return [rows, total];
  }

  findWithOwner(id: string): Promise<MenuWithOwner | null> {
    return this.prisma.menu.findUnique({
      where: { id },
      include: { owner: { select: { id: true, name: true, email: true, locale: true } } },
    });
  }

  async setSuspension(id: string, suspendedAt: Date | null, reason: string | null): Promise<void> {
    await this.prisma.menu.update({
      where: { id },
      data: { suspendedAt, suspendedReason: reason },
    });
  }

  async reports(
    status: MenuReportStatus,
    skip: number,
    take: number,
  ): Promise<[ReportRow[], number]> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.menuReport.findMany({
        where: { status },
        include: { menu: { select: { id: true, slug: true, suspendedAt: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.menuReport.count({ where: { status } }),
    ]);
    return [rows, total];
  }

  /** Closes an open report; false when there is none (or it was closed already). */
  async closeReport(id: string, note: string | null, now: Date): Promise<boolean> {
    const { count } = await this.prisma.menuReport.updateMany({
      where: { id, status: 'OPEN' },
      data: { status: 'CLOSED', note, closedAt: now },
    });
    return count === 1;
  }

  // ---- Maintenance ----------------------------------------------------------------------------

  async purgeReportsBefore(before: Date): Promise<number> {
    return (await this.prisma.menuReport.deleteMany({ where: { createdAt: { lt: before } } }))
      .count;
  }

  async purgeExpiredRedirects(now: Date): Promise<number> {
    return (await this.prisma.menuSlugRedirect.deleteMany({ where: { expiresAt: { lte: now } } }))
      .count;
  }
}
