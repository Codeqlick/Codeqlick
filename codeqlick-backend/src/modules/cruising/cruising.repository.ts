import { Injectable } from '@nestjs/common';
import type {
  CruisingProfile,
  CruisingReportStatus,
  CruisingReviewStatus,
  CruisingSpotStatus,
  CruisingSpotType,
  CruisingTakedownStatus,
  Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { roundRating, type Bbox } from './cruising.rules.js';
import { ADMIN_LIST_LIMIT } from './cruising.schemas.js';

const personSelect = { id: true, name: true, email: true } as const;

/** A person to tell about something: their account's language and their Cruising switches. */
const recipientSelect = {
  id: true,
  email: true,
  locale: true,
  cruisingProfile: { select: { emailAlerts: true, suspendedAt: true, suspendedUntil: true } },
} as const;

const spotSummarySelect = {
  id: true,
  slug: true,
  name: true,
  type: true,
  lat: true,
  lng: true,
  ratingAvg: true,
  ratingCount: true,
} as const;

/**
 * Recomputes a spot's rating from its LIVE reviews. Called inside the transaction of every review
 * change (and of an account's deletion), so the average and the count never drift.
 */
export async function recomputeSpotRating(
  tx: Pick<Prisma.TransactionClient, 'cruisingReview' | 'cruisingSpot'>,
  spotId: string,
): Promise<void> {
  const live = await tx.cruisingReview.aggregate({
    where: { spotId, status: 'LIVE' },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await tx.cruisingSpot.update({
    where: { id: spotId },
    data: { ratingAvg: roundRating(live._avg.rating), ratingCount: live._count._all },
  });
}

/**
 * Deletes an account. Its Cruising reviews go with it (cascade), so the ratings of the spots it
 * reviewed are worked out again in the same transaction.
 */
export async function deleteUserRecomputingRatings(
  prisma: Pick<PrismaService, '$transaction'>,
  id: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const reviewed = await tx.cruisingReview.findMany({
      where: { userId: id },
      select: { spotId: true },
    });
    await tx.user.delete({ where: { id } });
    for (const spotId of new Set(reviewed.map((review) => review.spotId))) {
      await recomputeSpotRating(tx, spotId);
    }
  });
}

@Injectable()
export class CruisingRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Profiles ----------------------------------------------------------------------------------

  findProfile(userId: string): Promise<CruisingProfile | null> {
    return this.prisma.cruisingProfile.findUnique({ where: { userId } });
  }

  saveOnboarding(
    userId: string,
    termsVersion: string,
    birthYear: number,
    now: Date,
  ): Promise<CruisingProfile> {
    return this.prisma.cruisingProfile.upsert({
      where: { userId },
      create: { userId, birthYear, termsVersion, acceptedAt: now },
      update: { birthYear, termsVersion, acceptedAt: now },
    });
  }

  updateProfile(userId: string, data: Prisma.CruisingProfileUpdateInput): Promise<CruisingProfile> {
    return this.prisma.cruisingProfile.update({ where: { userId }, data });
  }

  /** Who to tell about something, with their language and Cruising switches. */
  recipient(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId }, select: recipientSelect });
  }

  findUser(id: string) {
    return this.prisma.user.findUnique({ where: { id }, select: personSelect });
  }

  // ---- Spots -------------------------------------------------------------------------------------

  findSpot(id: string) {
    return this.prisma.cruisingSpot.findUnique({ where: { id } });
  }

  findSpotBySlug(slug: string) {
    return this.prisma.cruisingSpot.findUnique({ where: { slug } });
  }

  async slugTaken(slug: string): Promise<boolean> {
    return (await this.prisma.cruisingSpot.count({ where: { slug } })) > 0;
  }

  createSpot(data: Prisma.CruisingSpotUncheckedCreateInput) {
    return this.prisma.cruisingSpot.create({ data });
  }

  updateSpot(id: string, data: Prisma.CruisingSpotUncheckedUpdateInput) {
    return this.prisma.cruisingSpot.update({ where: { id }, data });
  }

  /**
   * The proposer's own edit: applied only while the spot is still PENDING or REJECTED, so a team
   * decision made a moment earlier is never overwritten. Returns the spot, or null when it no
   * longer can be changed.
   */
  async updateOwnSpot(id: string, userId: string, data: Prisma.CruisingSpotUncheckedUpdateInput) {
    const { count } = await this.prisma.cruisingSpot.updateMany({
      where: { id, createdById: userId, status: { in: ['PENDING', 'REJECTED'] } },
      data,
    });
    return count === 0 ? null : this.prisma.cruisingSpot.findUnique({ where: { id } });
  }

  /** Deletes the proposer's PENDING or REJECTED spot; false when it can no longer be deleted. */
  async deleteOwnSpot(id: string, userId: string): Promise<boolean> {
    const { count } = await this.prisma.cruisingSpot.deleteMany({
      where: { id, createdById: userId, status: { in: ['PENDING', 'REJECTED'] } },
    });
    return count > 0;
  }

  countSpotsSince(userId: string, since: Date): Promise<number> {
    return this.prisma.cruisingSpot.count({
      where: { createdById: userId, createdAt: { gte: since } },
    });
  }

  mySpots(userId: string) {
    return this.prisma.cruisingSpot.findMany({
      where: { createdById: userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** LIVE spots in the box, best rated first. The caller asks for one more than it shows. */
  spotsInBox(box: Bbox, type: CruisingSpotType | undefined, take: number) {
    return this.prisma.cruisingSpot.findMany({
      where: {
        status: 'LIVE',
        lng: { gte: box.minLng, lte: box.maxLng },
        lat: { gte: box.minLat, lte: box.maxLat },
        ...(type ? { type } : {}),
      },
      orderBy: [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }, { id: 'asc' }],
      take,
      select: spotSummarySelect,
    });
  }

  /** LIVE spots by country and city, for the place lists. */
  async liveCityCounts() {
    const rows = await this.prisma.cruisingSpot.groupBy({
      by: ['countryCode', 'citySlug', 'city'],
      where: { status: 'LIVE' },
      _count: { _all: true },
    });
    return rows.map((row) => ({
      countryCode: row.countryCode,
      citySlug: row.citySlug,
      city: row.city,
      count: row._count._all,
    }));
  }

  citySpots(countryCode: string, citySlug: string, take: number) {
    return this.prisma.cruisingSpot.findMany({
      where: { status: 'LIVE', countryCode, citySlug },
      orderBy: [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }, { id: 'asc' }],
      take,
      select: { ...spotSummarySelect, city: true },
    });
  }

  sitemapSpots() {
    return this.prisma.cruisingSpot.findMany({
      where: { status: 'LIVE' },
      orderBy: { createdAt: 'asc' },
      take: 50_000,
      select: { slug: true, countryCode: true, citySlug: true, updatedAt: true },
    });
  }

  // ---- Reviews -----------------------------------------------------------------------------------

  findReviewById(id: string) {
    return this.prisma.cruisingReview.findUnique({
      where: { id },
      include: { spot: { select: { id: true, slug: true, name: true, status: true } } },
    });
  }

  findReview(spotId: string, userId: string) {
    return this.prisma.cruisingReview.findUnique({
      where: { spotId_userId: { spotId, userId } },
    });
  }

  async reviewsOfSpot(spotId: string, skip: number, take: number) {
    const where = { spotId, status: 'LIVE' } as const;
    const [items, total] = await Promise.all([
      this.prisma.cruisingReview.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip,
        take,
      }),
      this.prisma.cruisingReview.count({ where }),
    ]);
    return { items, total };
  }

  /** Reviews the member created or edited since `since` (editing counts toward the daily limit). */
  countReviewsTouchedSince(userId: string, since: Date): Promise<number> {
    return this.prisma.cruisingReview.count({ where: { userId, updatedAt: { gte: since } } });
  }

  /** Creates or replaces a member's review and recomputes the spot's rating, in one transaction. */
  saveReview(spotId: string, userId: string, rating: number, text: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const review = await tx.cruisingReview.upsert({
        where: { spotId_userId: { spotId, userId } },
        create: { spotId, userId, rating, text },
        update: { rating, text },
      });
      await recomputeSpotRating(tx, spotId);
      return review;
    });
  }

  async deleteReview(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const review = await tx.cruisingReview.delete({ where: { id } });
      await recomputeSpotRating(tx, review.spotId);
    });
  }

  async setReviewStatus(id: string, status: CruisingReviewStatus): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const review = await tx.cruisingReview.update({ where: { id }, data: { status } });
      await recomputeSpotRating(tx, review.spotId);
    });
  }

  // ---- Reports, removal requests -----------------------------------------------------------------

  countReportsSince(reporterId: string, since: Date): Promise<number> {
    return this.prisma.cruisingReport.count({
      where: { reporterId, createdAt: { gte: since } },
    });
  }

  createReport(data: Prisma.CruisingReportUncheckedCreateInput) {
    return this.prisma.cruisingReport.create({ data });
  }

  findReport(id: string) {
    return this.prisma.cruisingReport.findUnique({
      where: { id },
      include: {
        spot: true,
        review: {
          include: { spot: { select: { id: true, slug: true, name: true, status: true } } },
        },
      },
    });
  }

  reports(status: CruisingReportStatus) {
    return this.prisma.cruisingReport.findMany({
      where: { status },
      orderBy: { createdAt: status === 'OPEN' ? 'asc' : 'desc' },
      take: ADMIN_LIST_LIMIT,
      include: {
        reporter: { select: personSelect },
        reported: { select: { ...personSelect, cruisingProfile: true } },
        reviewedBy: { select: { id: true, name: true } },
        spot: { select: { id: true, slug: true, name: true, type: true, status: true } },
        review: {
          select: {
            id: true,
            rating: true,
            text: true,
            status: true,
            spot: { select: { id: true, slug: true, name: true, status: true } },
          },
        },
      },
    });
  }

  /** Reports against each person, in any status. */
  async reportCounts(reportedIds: string[]): Promise<Map<string, number>> {
    if (reportedIds.length === 0) return new Map();
    const rows = await this.prisma.cruisingReport.groupBy({
      by: ['reportedId'],
      where: { reportedId: { in: reportedIds } },
      _count: { _all: true },
    });
    return new Map(
      rows.flatMap((row) => (row.reportedId ? [[row.reportedId, row._count._all] as const] : [])),
    );
  }

  closeReport(id: string, status: CruisingReportStatus, reviewedById: string, now: Date) {
    return this.prisma.cruisingReport.update({
      where: { id },
      data: { status, reviewedById, reviewedAt: now },
    });
  }

  countOpenReportsOnSpot(spotId: string, exceptId?: string): Promise<number> {
    return this.prisma.cruisingReport.count({
      where: { spotId, status: 'OPEN', ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
  }

  countOpenReportsOnReview(reviewId: string, exceptId?: string): Promise<number> {
    return this.prisma.cruisingReport.count({
      where: { reviewId, status: 'OPEN', ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
  }

  countOpenTakedownsOnSpot(spotId: string, exceptId?: string): Promise<number> {
    return this.prisma.cruisingTakedown.count({
      where: { spotId, status: 'OPEN', ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
  }

  createTakedown(data: Prisma.CruisingTakedownUncheckedCreateInput) {
    return this.prisma.cruisingTakedown.create({ data });
  }

  findTakedown(id: string) {
    return this.prisma.cruisingTakedown.findUnique({ where: { id }, include: { spot: true } });
  }

  takedowns(status: CruisingTakedownStatus) {
    return this.prisma.cruisingTakedown.findMany({
      where: { status },
      orderBy: { createdAt: status === 'OPEN' ? 'asc' : 'desc' },
      take: ADMIN_LIST_LIMIT,
      include: {
        spot: { select: { id: true, slug: true, name: true, status: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    });
  }

  closeTakedown(
    id: string,
    status: CruisingTakedownStatus,
    response: string | null,
    reviewedById: string,
    now: Date,
  ) {
    return this.prisma.cruisingTakedown.update({
      where: { id },
      data: { status, response, reviewedById, reviewedAt: now },
    });
  }

  // ---- Admin -------------------------------------------------------------------------------------

  adminSpots(status: CruisingSpotStatus, q: string | undefined) {
    return this.prisma.cruisingSpot.findMany({
      where: {
        status,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { city: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' },
      take: ADMIN_LIST_LIMIT,
      include: {
        createdBy: { select: personSelect },
        _count: { select: { reports: { where: { status: 'OPEN' } } } },
      },
    });
  }

  suspendedProfiles(now: Date) {
    return this.prisma.cruisingProfile.findMany({
      where: {
        suspendedAt: { not: null },
        OR: [{ suspendedUntil: null }, { suspendedUntil: { gt: now } }],
      },
      orderBy: { suspendedAt: 'desc' },
      take: ADMIN_LIST_LIMIT,
      include: { user: { select: personSelect } },
    });
  }

  /** When the newest thing waiting for the team arrived (null: nothing waiting). */
  async newestPendingAt(): Promise<Date | null> {
    const [spot, report, takedown] = await Promise.all([
      this.prisma.cruisingSpot.findFirst({
        where: { status: 'PENDING' },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
      this.prisma.cruisingReport.findFirst({
        where: { status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.cruisingTakedown.findFirst({
        where: { status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);
    const times = [spot?.updatedAt, report?.createdAt, takedown?.createdAt].filter(
      (time): time is Date => !!time,
    );
    return times.length ? new Date(Math.max(...times.map((time) => time.getTime()))) : null;
  }

  async overview(now: Date) {
    const [members, pendingSpots, liveSpots, openReports, openTakedowns, reviews, suspended] =
      await Promise.all([
        this.prisma.cruisingProfile.count(),
        this.prisma.cruisingSpot.count({ where: { status: 'PENDING' } }),
        this.prisma.cruisingSpot.count({ where: { status: 'LIVE' } }),
        this.prisma.cruisingReport.count({ where: { status: 'OPEN' } }),
        this.prisma.cruisingTakedown.count({ where: { status: 'OPEN' } }),
        this.prisma.cruisingReview.count(),
        this.prisma.cruisingProfile.count({
          where: {
            suspendedAt: { not: null },
            OR: [{ suspendedUntil: null }, { suspendedUntil: { gt: now } }],
          },
        }),
      ]);
    return { members, pendingSpots, liveSpots, openReports, openTakedowns, reviews, suspended };
  }
}
