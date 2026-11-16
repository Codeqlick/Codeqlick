import { Injectable } from '@nestjs/common';
import type {
  CloudStatusSubscriber,
  CloudStatusSubscriberStatus,
  Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { emailRoom } from './cloud-status-subscribers.js';

const teamSelect = { select: { id: true, name: true, slug: true, plan: true } } as const;

export type SubscriberWithTeam = CloudStatusSubscriber & {
  team: { id: string; name: string; slug: string; plan: 'FREE' | 'PRO' };
};

/** A team's status page as the sign-up needs it (enabled or not). */
export type SignupPage = {
  enabled: boolean;
  subscriptions: boolean;
  title: string;
  team: { id: string; name: string; slug: string; plan: 'FREE' | 'PRO' };
};

const dispatchInclude = {
  team: {
    select: {
      id: true,
      name: true,
      slug: true,
      plan: true,
      statusPage: {
        select: { enabled: true, subscriptions: true, title: true, items: true },
      },
    },
  },
  notice: { include: { updates: { orderBy: { createdAt: 'desc' }, take: 1 } } },
  update: true,
} as const;

export type DispatchRow = Prisma.CloudStatusDispatchGetPayload<{ include: typeof dispatchInclude }>;

export interface SubscriberCounts {
  active: number;
  pending: number;
  unsubscribed: number;
}

/** Status page subscribers and the outbox of their emails (architecture 4.13, decision 105). */
@Injectable()
export class CloudStatusSubscribersRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Sign-up, confirm, unsubscribe ──────────────────────────────────────────────────────────

  async signupPage(teamSlug: string): Promise<SignupPage | null> {
    return this.prisma.cloudStatusPage.findFirst({
      where: { team: { slug: teamSlug } },
      select: { enabled: true, subscriptions: true, title: true, team: teamSelect },
    });
  }

  /** Pending and active: what the plan's cap counts. */
  countCapped(teamId: string): Promise<number> {
    return this.prisma.cloudStatusSubscriber.count({
      where: { teamId, status: { in: ['PENDING', 'ACTIVE'] } },
    });
  }

  find(teamId: string, email: string): Promise<CloudStatusSubscriber | null> {
    return this.prisma.cloudStatusSubscriber.findUnique({
      where: { teamId_email: { teamId, email } },
    });
  }

  /** Rows of an address, over all teams, whose confirmation was emailed since `since`. */
  confirmationsSince(email: string, since: Date): Promise<number> {
    return this.prisma.cloudStatusSubscriber.count({
      where: { email, confirmSentAt: { gte: since } },
    });
  }

  create(data: Prisma.CloudStatusSubscriberUncheckedCreateInput): Promise<CloudStatusSubscriber> {
    return this.prisma.cloudStatusSubscriber.create({ data });
  }

  update(
    id: string,
    data: Prisma.CloudStatusSubscriberUncheckedUpdateInput,
  ): Promise<CloudStatusSubscriber> {
    return this.prisma.cloudStatusSubscriber.update({ where: { id }, data });
  }

  findByConfirmHash(hash: string): Promise<SubscriberWithTeam | null> {
    return this.prisma.cloudStatusSubscriber.findUnique({
      where: { confirmTokenHash: hash },
      include: { team: teamSelect },
    });
  }

  findByUnsubscribeToken(token: string): Promise<SubscriberWithTeam | null> {
    return this.prisma.cloudStatusSubscriber.findUnique({
      where: { unsubscribeToken: token },
      include: { team: teamSelect },
    });
  }

  // ── Console ────────────────────────────────────────────────────────────────────────────────

  async list(
    teamId: string,
    status: CloudStatusSubscriberStatus | undefined,
    skip: number,
    take: number,
  ): Promise<{ items: CloudStatusSubscriber[]; total: number }> {
    const where: Prisma.CloudStatusSubscriberWhereInput = { teamId, ...(status ? { status } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.cloudStatusSubscriber.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.cloudStatusSubscriber.count({ where }),
    ]);
    return { items, total };
  }

  async counts(teamId: string): Promise<SubscriberCounts> {
    const count = (status: CloudStatusSubscriberStatus) =>
      this.prisma.cloudStatusSubscriber.count({ where: { teamId, status } });
    const [active, pending, unsubscribed] = await Promise.all([
      count('ACTIVE'),
      count('PENDING'),
      count('UNSUBSCRIBED'),
    ]);
    return { active, pending, unsubscribed };
  }

  findInTeam(teamId: string, id: string): Promise<CloudStatusSubscriber | null> {
    return this.prisma.cloudStatusSubscriber.findFirst({ where: { id, teamId } });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.cloudStatusSubscriber.delete({ where: { id } });
  }

  async deleteAll(teamId: string): Promise<number> {
    return (await this.prisma.cloudStatusSubscriber.deleteMany({ where: { teamId } })).count;
  }

  // ── The sending job ────────────────────────────────────────────────────────────────────────

  /** Maintenance that has started, isn't completed and whose start nobody handled yet. */
  startedMaintenance(now: Date, take: number) {
    return this.prisma.cloudStatusNotice.findMany({
      where: {
        kind: 'MAINTENANCE',
        startNotifiedAt: null,
        resolvedAt: null,
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      select: { id: true, teamId: true },
      orderBy: { startsAt: 'asc' },
      take,
    });
  }

  /**
   * Claims a maintenance's start (one process wins) and writes its dispatch while the team's
   * page is enabled with subscriptions on. False when another process had claimed it.
   */
  claimMaintenanceStart(notice: { id: string; teamId: string }, now: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.cloudStatusNotice.updateMany({
        where: { id: notice.id, startNotifiedAt: null },
        data: { startNotifiedAt: now },
      });
      if (claimed.count === 0) return false;
      const page = await tx.cloudStatusPage.findUnique({
        where: { teamId: notice.teamId },
        select: { enabled: true, subscriptions: true },
      });
      if (page?.enabled && page.subscriptions) {
        await tx.cloudStatusDispatch.create({
          data: { teamId: notice.teamId, noticeId: notice.id, kind: 'MAINTENANCE_STARTED' },
        });
      }
      return true;
    });
  }

  openDispatches(take: number): Promise<DispatchRow[]> {
    return this.prisma.cloudStatusDispatch.findMany({
      where: { completedAt: null },
      include: dispatchInclude,
      orderBy: { createdAt: 'asc' },
      take,
    });
  }

  /**
   * Reserves up to `want` emails in the team's hourly window (locked, so two processes never
   * overspend it) and returns how many were granted.
   */
  reserveEmails(teamId: string, want: number, perHour: number, now: Date): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM cloud_status_pages WHERE team_id = ${teamId}::uuid FOR UPDATE`;
      const page = await tx.cloudStatusPage.findUnique({
        where: { teamId },
        select: { emailWindowStart: true, emailsInWindow: true },
      });
      if (!page) return 0;
      const { windowStart, used, room } = emailRoom(page, perHour, now);
      const granted = Math.min(want, room);
      if (granted > 0) {
        await tx.cloudStatusPage.update({
          where: { teamId },
          data: { emailWindowStart: windowStart, emailsInWindow: used + granted },
        });
      }
      return granted;
    });
  }

  /** Gives back reserved emails that weren't used (the batch was smaller, or lost the claim). */
  async releaseEmails(teamId: string, count: number): Promise<void> {
    if (count <= 0) return;
    await this.prisma.$executeRaw`
      UPDATE cloud_status_pages SET emails_in_window = GREATEST(0, emails_in_window - ${count})
      WHERE team_id = ${teamId}::uuid`;
  }

  /** The next eligible subscribers of a dispatch: active, confirmed before it, after its cursor. */
  nextBatch(
    dispatch: { teamId: string; cursor: string | null; createdAt: Date },
    take: number,
  ): Promise<CloudStatusSubscriber[]> {
    return this.prisma.cloudStatusSubscriber.findMany({
      where: {
        teamId: dispatch.teamId,
        status: 'ACTIVE',
        confirmedAt: { lte: dispatch.createdAt },
        ...(dispatch.cursor ? { id: { gt: dispatch.cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take,
    });
  }

  /** Moves the cursor past a batch, before it is sent; false when another process moved it. */
  async claimBatch(
    id: string,
    oldCursor: string | null,
    newCursor: string,
    count: number,
  ): Promise<boolean> {
    const result = await this.prisma.cloudStatusDispatch.updateMany({
      where: { id, cursor: oldCursor, completedAt: null },
      data: { cursor: newCursor, sent: { increment: count } },
    });
    return result.count === 1;
  }

  /** Finished (nobody left) or dropped (stale, page off): done, never looked at again. */
  async complete(id: string, now: Date): Promise<void> {
    await this.prisma.cloudStatusDispatch.updateMany({
      where: { id, completedAt: null },
      data: { completedAt: now },
    });
  }

  async deletePendingExpiredBefore(before: Date): Promise<number> {
    return (
      await this.prisma.cloudStatusSubscriber.deleteMany({
        where: { status: 'PENDING', confirmExpiresAt: { lt: before } },
      })
    ).count;
  }

  async deleteUnsubscribedBefore(before: Date): Promise<number> {
    return (
      await this.prisma.cloudStatusSubscriber.deleteMany({
        where: { status: 'UNSUBSCRIBED', unsubscribedAt: { lt: before } },
      })
    ).count;
  }

  async deleteCompletedDispatchesBefore(before: Date): Promise<number> {
    return (
      await this.prisma.cloudStatusDispatch.deleteMany({
        where: { completedAt: { lt: before } },
      })
    ).count;
  }
}
