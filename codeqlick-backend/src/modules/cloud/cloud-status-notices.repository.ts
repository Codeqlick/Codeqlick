import { Injectable } from '@nestjs/common';
import type {
  CloudStatusNotice,
  CloudStatusNoticeState,
  CloudStatusNoticeUpdate,
  Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const noticeInclude = {
  team: { select: { slug: true } },
  createdBy: { select: { name: true } },
  updates: {
    orderBy: { createdAt: 'desc' },
    include: { createdBy: { select: { name: true } } },
  },
} as const;

export type NoticeRow = CloudStatusNotice & {
  team: { slug: string };
  createdBy: { name: string } | null;
  updates: Array<CloudStatusNoticeUpdate & { createdBy: { name: string } | null }>;
};

/** A notice with its timeline, newest first, for the public page. */
export type PublicNoticeRow = CloudStatusNotice & { updates: CloudStatusNoticeUpdate[] };

/** Open at `now`: an incident not resolved, or a maintenance not ended (early or by its time). */
const openWhere = (now: Date): Prisma.CloudStatusNoticeWhereInput => ({
  resolvedAt: null,
  OR: [{ endsAt: null }, { endsAt: { gt: now } }],
});

const closedWhere = (now: Date): Prisma.CloudStatusNoticeWhereInput => ({
  OR: [{ resolvedAt: { not: null } }, { endsAt: { lte: now } }],
});

/** Notices on Cloud status pages: incidents and scheduled maintenance (architecture 4.13). */
@Injectable()
export class CloudStatusNoticesRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(id: string): Promise<NoticeRow | null> {
    return this.prisma.cloudStatusNotice.findUnique({ where: { id }, include: noticeInclude });
  }

  async list(
    teamId: string,
    open: boolean | undefined,
    now: Date,
    skip: number,
    take: number,
  ): Promise<{ items: NoticeRow[]; total: number }> {
    const where: Prisma.CloudStatusNoticeWhereInput = {
      teamId,
      ...(open === undefined ? {} : open ? openWhere(now) : closedWhere(now)),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.cloudStatusNotice.findMany({
        where,
        include: noticeInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.cloudStatusNotice.count({ where }),
    ]);
    return { items, total };
  }

  async monitorsInTeam(teamId: string, ids: string[]): Promise<number> {
    return this.prisma.cloudMonitor.count({ where: { teamId, id: { in: ids } } });
  }

  /** Serialises the team's notice changes until the transaction ends, so limits hold. */
  private async lockTeam(tx: Prisma.TransactionClient, teamId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cloud-notices:${teamId}`}))`;
  }

  /**
   * A notice and its first update, under the team's lock; 'open' (nothing created) when it is
   * open and the team already has `maxOpen` open notices.
   */
  create(
    data: Omit<Prisma.CloudStatusNoticeUncheckedCreateInput, 'updates'> & { teamId: string },
    update: { state: CloudStatusNoticeState | null; body: string },
    limit: { maxOpen: number; open: boolean; now: Date },
  ): Promise<NoticeRow | 'open'> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockTeam(tx, data.teamId);
      if (
        limit.open &&
        (await tx.cloudStatusNotice.count({
          where: { teamId: data.teamId, ...openWhere(limit.now) },
        })) >= limit.maxOpen
      ) {
        return 'open';
      }
      return tx.cloudStatusNotice.create({
        data: {
          ...data,
          updates: {
            create: { state: update.state, body: update.body, createdById: data.createdById },
          },
        },
        include: noticeInclude,
      });
    });
  }

  update(id: string, data: Prisma.CloudStatusNoticeUncheckedUpdateInput): Promise<NoticeRow> {
    return this.prisma.cloudStatusNotice.update({ where: { id }, data, include: noticeInclude });
  }

  /**
   * Adds an update to the timeline and applies what it changes on the notice, together and under
   * the team's lock: 'updates' when the notice already has `maxUpdates`, 'open' when it reopens
   * the notice and the team already has `maxOpen` open ones (nothing changed then).
   */
  addUpdate(
    notice: { id: string; teamId: string },
    update: { state: CloudStatusNoticeState | null; body: string; createdById: string },
    data: Prisma.CloudStatusNoticeUncheckedUpdateInput,
    limit: { maxUpdates: number; maxOpen: number; reopens: boolean; now: Date },
  ): Promise<NoticeRow | 'updates' | 'open'> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockTeam(tx, notice.teamId);
      if (
        (await tx.cloudStatusNoticeUpdate.count({ where: { noticeId: notice.id } })) >=
        limit.maxUpdates
      ) {
        return 'updates';
      }
      if (
        limit.reopens &&
        (await tx.cloudStatusNotice.count({
          where: { teamId: notice.teamId, ...openWhere(limit.now) },
        })) >= limit.maxOpen
      ) {
        return 'open';
      }
      await tx.cloudStatusNoticeUpdate.create({ data: { noticeId: notice.id, ...update } });
      return tx.cloudStatusNotice.update({
        where: { id: notice.id },
        data,
        include: noticeInclude,
      });
    });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.cloudStatusNotice.delete({ where: { id } });
  }

  // ── Status page and monitors ───────────────────────────────────────────────────────────────

  /** What the public page lists: the open notices and those closed since `closedSince`. */
  async publicNotices(teamId: string, now: Date, closedSince: Date): Promise<PublicNoticeRow[]> {
    const include = { updates: { orderBy: { createdAt: 'desc' } } } as const;
    const [open, closed] = await Promise.all([
      this.prisma.cloudStatusNotice.findMany({
        where: { teamId, ...openWhere(now) },
        include,
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.cloudStatusNotice.findMany({
        where: {
          teamId,
          OR: [
            { resolvedAt: { gte: closedSince } },
            { resolvedAt: null, endsAt: { gte: closedSince, lte: now } },
          ],
        },
        include,
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    return [...open, ...closed];
  }

  /** Maintenance of the team that began before `now` and covered time after `since`. */
  maintenanceSince(teamId: string, since: Date, now: Date): Promise<CloudStatusNotice[]> {
    return this.prisma.cloudStatusNotice.findMany({
      where: { teamId, kind: 'MAINTENANCE', startsAt: { lte: now }, endsAt: { gt: since } },
    });
  }

  /** Whether a monitor is under a maintenance in progress at `now`. */
  async inMaintenance(teamId: string, monitorId: string, now: Date): Promise<boolean> {
    return (
      (await this.prisma.cloudStatusNotice.count({
        where: {
          teamId,
          kind: 'MAINTENANCE',
          resolvedAt: null,
          startsAt: { lte: now },
          endsAt: { gt: now },
          monitorIds: { has: monitorId },
        },
      })) > 0
    );
  }

  /** Takes a monitor that is being deleted out of its team's notices. */
  async forgetMonitor(teamId: string, monitorId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE cloud_status_notices
      SET monitor_ids = array_remove(monitor_ids, ${monitorId}::uuid)
      WHERE team_id = ${teamId}::uuid AND ${monitorId}::uuid = ANY(monitor_ids)`;
  }

  /** Deletes the notices closed before `before` (resolved, or a maintenance whose end passed). */
  async deleteClosedBefore(before: Date): Promise<void> {
    await this.prisma.cloudStatusNotice.deleteMany({
      where: {
        OR: [{ resolvedAt: { lt: before } }, { resolvedAt: null, endsAt: { lt: before } }],
      },
    });
  }
}
