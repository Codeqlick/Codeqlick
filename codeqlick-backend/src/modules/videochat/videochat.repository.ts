import { Injectable } from '@nestjs/common';
import type {
  Prisma,
  VideochatAppealStatus,
  VideochatProfile,
  VideochatReportReason,
  VideochatReportStatus,
  VideochatSanction,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const personSelect = { id: true, name: true, email: true } as const;

/** What the moderation page shows beside a report about the reported person. */
export interface ReportHistory {
  memberSince: Date;
  reports: Record<VideochatReportStatus, number>;
  reporters: number;
  suspensions: number;
  lastSuspension: { reason: string | null; createdAt: Date } | null;
}

@Injectable()
export class VideochatRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProfile(userId: string): Promise<VideochatProfile | null> {
    return this.prisma.videochatProfile.findUnique({ where: { userId } });
  }

  /** Records the 18+ confirmation and the accepted terms (again, for a new version). */
  saveOnboarding(userId: string, termsVersion: string, now: Date): Promise<VideochatProfile> {
    return this.prisma.videochatProfile.upsert({
      where: { userId },
      create: { userId, adultConfirmedAt: now, termsVersion, termsAcceptedAt: now },
      update: { adultConfirmedAt: now, termsVersion, termsAcceptedAt: now },
    });
  }

  findUser(id: string) {
    return this.prisma.user.findUnique({ where: { id }, select: personSelect });
  }

  /** Users this one blocked or was blocked by. */
  async blockedUserIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.videochatBlock.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    return rows.map((row) => (row.blockerId === userId ? row.blockedId : row.blockerId));
  }

  async block(blockerId: string, blockedId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.videochatBlock.upsert({
        where: { blockerId_blockedId: { blockerId, blockedId } },
        create: { blockerId, blockedId },
        update: {},
      }),
      // A block ends a contact.
      this.prisma.videochatLike.deleteMany({
        where: {
          OR: [
            { fromId: blockerId, toId: blockedId },
            { fromId: blockedId, toId: blockerId },
          ],
        },
      }),
    ]);
  }

  /** Likes `toId`; returns whether `toId` already liked `fromId` (they are contacts now). */
  async like(fromId: string, toId: string): Promise<boolean> {
    await this.prisma.videochatLike.upsert({
      where: { fromId_toId: { fromId, toId } },
      create: { fromId, toId },
      update: {},
    });
    const back = await this.prisma.videochatLike.findUnique({
      where: { fromId_toId: { fromId: toId, toId: fromId } },
      select: { fromId: true },
    });
    return back !== null;
  }

  async unlike(fromId: string, toId: string): Promise<void> {
    await this.prisma.videochatLike.deleteMany({ where: { fromId, toId } });
  }

  /** Removes the likes between two people, both ways (a block ends a contact). */
  async deleteLikesBetween(a: string, b: string): Promise<void> {
    await this.prisma.videochatLike.deleteMany({
      where: {
        OR: [
          { fromId: a, toId: b },
          { fromId: b, toId: a },
        ],
      },
    });
  }

  async isMutual(a: string, b: string): Promise<boolean> {
    const count = await this.prisma.videochatLike.count({
      where: {
        OR: [
          { fromId: a, toId: b },
          { fromId: b, toId: a },
        ],
      },
    });
    return count === 2;
  }

  /** The people `userId` liked who liked them back, with their public profile; newest first. */
  async contacts(userId: string) {
    const liked = await this.prisma.videochatLike.findMany({
      where: { fromId: userId, to: { videochatLikesGiven: { some: { toId: userId } } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        toId: true,
        createdAt: true,
        to: {
          select: {
            videochatProfile: {
              select: {
                nickname: true,
                gender: true,
                country: true,
                language: true,
                interests: true,
                verificationStatus: true,
              },
            },
          },
        },
      },
    });
    return liked;
  }

  createReport(data: {
    reporterId: string;
    reportedId: string;
    reason: VideochatReportReason;
    details: string | null;
    transcript: Prisma.InputJsonValue;
  }) {
    return this.prisma.videochatReport.create({ data });
  }

  /** Different people who reported `userId` since `since`, not counting dismissed reports. */
  async distinctReporters(userId: string, since: Date): Promise<number> {
    const rows = await this.prisma.videochatReport.findMany({
      where: { reportedId: userId, createdAt: { gte: since }, status: { not: 'DISMISSED' } },
      distinct: ['reporterId'],
      select: { reporterId: true },
    });
    return rows.length;
  }

  /** Suspends the user (replacing a current suspension) and records it in their history. */
  suspend(input: {
    userId: string;
    reason: string;
    until: Date | null;
    now: Date;
    byId: string | null;
    reportId: string | null;
  }): Promise<VideochatSanction> {
    return this.prisma.$transaction(async (tx) => {
      await tx.videochatProfile.update({
        where: { userId: input.userId },
        data: {
          suspendedAt: input.now,
          suspendedUntil: input.until,
          suspensionReason: input.reason,
        },
      });
      return tx.videochatSanction.create({
        data: {
          userId: input.userId,
          kind: 'SUSPENDED',
          reason: input.reason,
          until: input.until,
          byId: input.byId,
          reportId: input.reportId,
          createdAt: input.now,
        },
      });
    });
  }

  saveSettings(
    userId: string,
    data: {
      nickname: string | null;
      gender: VideochatProfile['gender'];
      seeking: VideochatProfile['seeking'];
      country: string | null;
      language: string | null;
      sameCountryOnly: boolean;
      sameLanguageOnly: boolean;
      interests: string[];
    },
  ): Promise<VideochatProfile> {
    return this.prisma.videochatProfile.update({ where: { userId }, data });
  }

  async setAgeVerified(userId: string, at: Date | null): Promise<boolean> {
    const result = await this.prisma.videochatProfile.updateMany({
      where: { userId },
      data: { ageVerifiedAt: at },
    });
    return result.count > 0;
  }

  /** Lifts a suspension (`now` past a timed one's end counts too) and records it. */
  async unsuspend(userId: string, byId: string | null, reason: string | null): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.videochatProfile.updateMany({
        where: { userId, suspendedAt: { not: null } },
        data: { suspendedAt: null, suspendedUntil: null, suspensionReason: null },
      });
      if (result.count === 0) return false;
      await tx.videochatSanction.create({ data: { userId, kind: 'LIFTED', byId, reason } });
      return true;
    });
  }

  /** The suspension a person is under now (their latest SUSPENDED entry). */
  latestSuspension(userId: string) {
    return this.prisma.videochatSanction.findFirst({
      where: { userId, kind: 'SUSPENDED' },
      orderBy: { createdAt: 'desc' },
      include: { appeal: true },
    });
  }

  createAppeal(userId: string, sanctionId: string, message: string) {
    return this.prisma.videochatAppeal.create({ data: { userId, sanctionId, message } });
  }

  findAppeal(id: string) {
    return this.prisma.videochatAppeal.findUnique({
      where: { id },
      include: { user: { select: { ...personSelect, locale: true } } },
    });
  }

  listAppeals(status: VideochatAppealStatus) {
    return this.prisma.videochatAppeal.findMany({
      where: { status },
      orderBy: { createdAt: status === 'OPEN' ? 'asc' : 'desc' },
      take: 200,
      include: {
        user: { select: personSelect },
        sanction: { select: { reason: true, until: true, createdAt: true } },
      },
    });
  }

  /** Resolves an open appeal; false when it was already resolved. */
  async resolveAppeal(
    id: string,
    status: 'ACCEPTED' | 'REJECTED',
    response: string | null,
    reviewerId: string,
    now: Date,
  ): Promise<boolean> {
    const result = await this.prisma.videochatAppeal.updateMany({
      where: { id, status: 'OPEN' },
      data: { status, response, reviewedById: reviewerId, reviewedAt: now },
    });
    return result.count > 0;
  }

  /** Everything the team sees about one person. */
  userDetail(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...personSelect,
        createdAt: true,
        videochatProfile: true,
        videochatReportsGot: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { reporter: { select: personSelect } },
        },
        videochatReportsMade: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { reported: { select: personSelect } },
        },
        videochatSanctions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { by: { select: personSelect } },
        },
        videochatAppeals: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
  }

  listReports(status: VideochatReportStatus) {
    return this.prisma.videochatReport.findMany({
      where: { status },
      orderBy: { createdAt: status === 'OPEN' ? 'asc' : 'desc' },
      take: 200,
      include: {
        reporter: { select: personSelect },
        reported: { select: { ...personSelect, videochatProfile: true } },
        reviewedBy: { select: personSelect },
      },
    });
  }

  /** Each person's moderation history: reports against them by status, distinct reporters,
   * suspensions and the last one. */
  async reportHistories(userIds: string[]): Promise<Map<string, ReportHistory>> {
    if (userIds.length === 0) return new Map();
    const [byStatus, reporters, sanctions, last, users] = await Promise.all([
      this.prisma.videochatReport.groupBy({
        by: ['reportedId', 'status'],
        where: { reportedId: { in: userIds } },
        _count: { _all: true },
      }),
      this.prisma.videochatReport.groupBy({
        by: ['reportedId', 'reporterId'],
        where: { reportedId: { in: userIds } },
      }),
      this.prisma.videochatSanction.groupBy({
        by: ['userId'],
        where: { userId: { in: userIds }, kind: 'SUSPENDED' },
        _count: { _all: true },
      }),
      this.prisma.videochatSanction.findMany({
        where: { userId: { in: userIds }, kind: 'SUSPENDED' },
        distinct: ['userId'],
        orderBy: [{ userId: 'asc' }, { createdAt: 'desc' }],
        select: { userId: true, reason: true, createdAt: true },
      }),
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, createdAt: true },
      }),
    ]);
    const histories = new Map<string, ReportHistory>(
      users.map((user) => [
        user.id,
        {
          memberSince: user.createdAt,
          reports: { OPEN: 0, ACTIONED: 0, DISMISSED: 0 },
          reporters: 0,
          suspensions: 0,
          lastSuspension: null,
        },
      ]),
    );
    for (const group of byStatus) {
      const history = histories.get(group.reportedId);
      if (history) history.reports[group.status] = group._count._all;
    }
    for (const pair of reporters) {
      const history = histories.get(pair.reportedId);
      if (history) history.reporters += 1;
    }
    for (const group of sanctions) {
      const history = histories.get(group.userId);
      if (history) history.suspensions = group._count._all;
    }
    for (const sanction of last) {
      const history = histories.get(sanction.userId);
      if (history)
        history.lastSuspension = { reason: sanction.reason, createdAt: sanction.createdAt };
    }
    return histories;
  }

  findReport(id: string) {
    return this.prisma.videochatReport.findUnique({ where: { id } });
  }

  findReports(ids: string[]) {
    return this.prisma.videochatReport.findMany({
      where: { id: { in: ids } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async reviewReport(
    id: string,
    status: VideochatReportStatus,
    reviewerId: string,
    now: Date,
  ): Promise<void> {
    await this.prisma.videochatReport.update({
      where: { id },
      data: { status, reviewedById: reviewerId, reviewedAt: now },
    });
  }

  /** Reports against each user in `userIds` since `since`. */
  async reportCounts(userIds: string[], since: Date): Promise<Map<string, number>> {
    const groups = await this.prisma.videochatReport.groupBy({
      by: ['reportedId'],
      where: { reportedId: { in: userIds }, createdAt: { gte: since } },
      _count: { _all: true },
    });
    return new Map(groups.map((group) => [group.reportedId, group._count._all]));
  }

  /** Suspended now: timed suspensions that ended are left out. */
  listSuspended(now: Date) {
    return this.prisma.videochatProfile.findMany({
      where: {
        suspendedAt: { not: null },
        OR: [{ suspendedUntil: null }, { suspendedUntil: { gt: now } }],
      },
      orderBy: { suspendedAt: 'desc' },
      take: 200,
      include: { user: { select: personSelect } },
    });
  }

  // --- Web Push ("someone is waiting" notifications) ---

  /** Stores a browser's subscription (moving it to this account if another had it); keeps the
   * account's 10 newest. */
  async savePushSubscription(
    userId: string,
    data: { endpoint: string; p256dh: string; auth: string; locale: string },
  ): Promise<void> {
    await this.prisma.videochatPushSubscription.upsert({
      where: { endpoint: data.endpoint },
      create: { userId, ...data },
      update: { userId, p256dh: data.p256dh, auth: data.auth, locale: data.locale },
    });
    const extra = await this.prisma.videochatPushSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      select: { id: true },
    });
    if (extra.length > 0) {
      await this.prisma.videochatPushSubscription.deleteMany({
        where: { id: { in: extra.map((row) => row.id) } },
      });
    }
  }

  async deletePushSubscription(endpoint: string, userId?: string): Promise<void> {
    await this.prisma.videochatPushSubscription.deleteMany({
      where: userId ? { endpoint, userId } : { endpoint },
    });
  }

  /**
   * Subscriptions of accounts that may be told someone is waiting: onboarded with the current
   * rules, not suspended, not notified since `notifiedBefore`, and not in `excludeUserIds`.
   */
  pushCandidates(input: {
    termsVersion: string;
    notifiedBefore: Date;
    now: Date;
    excludeUserIds: string[];
    take: number;
  }) {
    return this.prisma.videochatPushSubscription.findMany({
      where: {
        userId: { notIn: input.excludeUserIds },
        user: {
          videochatProfile: {
            termsVersion: input.termsVersion,
            OR: [{ suspendedAt: null }, { suspendedUntil: { lte: input.now } }],
            AND: [
              {
                OR: [{ pushNotifiedAt: null }, { pushNotifiedAt: { lt: input.notifiedBefore } }],
              },
            ],
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: input.take,
      include: {
        user: {
          select: {
            videochatProfile: {
              select: {
                gender: true,
                seeking: true,
                country: true,
                language: true,
                sameCountryOnly: true,
                sameLanguageOnly: true,
              },
            },
          },
        },
      },
    });
  }

  async markPushNotified(userIds: string[], at: Date): Promise<void> {
    if (userIds.length === 0) return;
    await this.prisma.videochatProfile.updateMany({
      where: { userId: { in: userIds } },
      data: { pushNotifiedAt: at },
    });
  }

  // --- Peak time alerts ---

  /** Turns the account's peak time alerts on or off; false when it has no profile yet. */
  async setPeakAlerts(userId: string, on: boolean): Promise<boolean> {
    const { count } = await this.prisma.videochatProfile.updateMany({
      where: { userId },
      data: { peakAlerts: on },
    });
    return count > 0;
  }

  /**
   * Subscriptions of accounts that asked for peak time alerts and may get one: onboarded with
   * the current rules, not suspended, not alerted since `notifiedBefore`, not in `excludeUserIds`.
   */
  peakCandidates(input: {
    termsVersion: string;
    notifiedBefore: Date;
    now: Date;
    excludeUserIds: string[];
    take: number;
  }) {
    return this.prisma.videochatPushSubscription.findMany({
      where: {
        userId: { notIn: input.excludeUserIds },
        user: {
          videochatProfile: {
            peakAlerts: true,
            termsVersion: input.termsVersion,
            OR: [{ suspendedAt: null }, { suspendedUntil: { lte: input.now } }],
            AND: [
              {
                OR: [{ peakNotifiedAt: null }, { peakNotifiedAt: { lt: input.notifiedBefore } }],
              },
            ],
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: input.take,
      select: { userId: true, endpoint: true, p256dh: true, auth: true, locale: true },
    });
  }

  async markPeakNotified(userIds: string[], at: Date): Promise<void> {
    if (userIds.length === 0) return;
    await this.prisma.videochatProfile.updateMany({
      where: { userId: { in: userIds } },
      data: { peakNotifiedAt: at },
    });
  }

  // ---- Photo verification and the person's own figures ----------------------------------------

  updateVerification(
    userId: string,
    data: Pick<
      Prisma.VideochatProfileUpdateInput,
      | 'verificationStatus'
      | 'verificationKey'
      | 'verificationNote'
      | 'verificationSentAt'
      | 'verifiedAt'
    >,
  ): Promise<VideochatProfile> {
    return this.prisma.videochatProfile.update({ where: { userId }, data });
  }

  /** Photos waiting for the team, oldest first. */
  pendingVerifications() {
    return this.prisma.videochatProfile.findMany({
      where: { verificationStatus: 'PENDING' },
      orderBy: { verificationSentAt: 'asc' },
      take: 100,
      select: {
        userId: true,
        nickname: true,
        verificationSentAt: true,
        user: { select: personSelect },
      },
    });
  }

  /** Every stored verification photo's key (for the orphan cleanup). */
  async verificationKeys(): Promise<string[]> {
    const rows = await this.prisma.videochatProfile.findMany({
      where: { verificationKey: { not: null } },
      select: { verificationKey: true },
    });
    return rows.map((row) => row.verificationKey!);
  }

  person(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, locale: true },
    });
  }

  /**
   * What happened to a person in [from, to): calls (from their active days, `yyyy-mm-dd` bounds),
   * likes received and new mutual contacts (both likes exist, the later one in the window).
   */
  async activityBetween(
    userId: string,
    from: Date,
    to: Date,
    days: { from: string; to: string },
  ): Promise<{ chats: number; likes: number; contacts: number }> {
    const [calls, likes, contacts] = await Promise.all([
      this.prisma.videochatActiveDay.aggregate({
        where: {
          userId,
          day: { gte: new Date(`${days.from}T00:00:00Z`), lt: new Date(`${days.to}T00:00:00Z`) },
        },
        _sum: { calls: true },
      }),
      this.prisma.videochatLike.count({
        where: { toId: userId, createdAt: { gte: from, lt: to } },
      }),
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*) AS count
        FROM videochat_likes mine
        JOIN videochat_likes theirs ON theirs.from_id = mine.to_id AND theirs.to_id = mine.from_id
        WHERE mine.from_id = ${userId}::uuid
          AND GREATEST(mine.created_at, theirs.created_at) >= ${from}
          AND GREATEST(mine.created_at, theirs.created_at) < ${to}`,
    ]);
    return {
      chats: calls._sum.calls ?? 0,
      likes,
      contacts: Number(contacts[0]?.count ?? 0),
    };
  }
}
