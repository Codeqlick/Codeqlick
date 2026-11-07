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
    await this.prisma.videochatBlock.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId },
      update: {},
    });
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

  findReport(id: string) {
    return this.prisma.videochatReport.findUnique({ where: { id } });
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
}
