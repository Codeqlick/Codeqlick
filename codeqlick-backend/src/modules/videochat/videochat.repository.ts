import { Injectable } from '@nestjs/common';
import type {
  Prisma,
  VideochatProfile,
  VideochatReportReason,
  VideochatReportStatus,
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

  /** Suspends the user (keeps an earlier suspension's date and reason). */
  async suspend(userId: string, reason: string, now: Date): Promise<void> {
    await this.prisma.videochatProfile.updateMany({
      where: { userId, suspendedAt: null },
      data: { suspendedAt: now, suspensionReason: reason },
    });
  }

  async setAgeVerified(userId: string, at: Date | null): Promise<boolean> {
    const result = await this.prisma.videochatProfile.updateMany({
      where: { userId },
      data: { ageVerifiedAt: at },
    });
    return result.count > 0;
  }

  async unsuspend(userId: string): Promise<boolean> {
    const result = await this.prisma.videochatProfile.updateMany({
      where: { userId, suspendedAt: { not: null } },
      data: { suspendedAt: null, suspensionReason: null },
    });
    return result.count > 0;
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

  listSuspended() {
    return this.prisma.videochatProfile.findMany({
      where: { suspendedAt: { not: null } },
      orderBy: { suspendedAt: 'desc' },
      take: 200,
      include: { user: { select: personSelect } },
    });
  }
}
