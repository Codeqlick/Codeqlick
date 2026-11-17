import { Injectable } from '@nestjs/common';
import type {
  AdultApp,
  CruisingConversation,
  CruisingProfile,
  CruisingReportStatus,
  CruisingReviewStatus,
  CruisingSpotStatus,
  CruisingSpotType,
  CruisingTakedownStatus,
  Locale,
  Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  AdultAppStore,
  AppEntry,
  AppPersonOverview,
  Db,
  ProfileSuspension,
} from '../adult/adult-app-store.js';
import { conversationPair, roundRating, type Bbox } from './cruising.rules.js';
import type { SpotTag } from './cruising-insights.rules.js';
import { ADMIN_LIST_LIMIT, MAX_LIST_ROWS, MESSAGES_PAGE } from './cruising.schemas.js';

const personSelect = { id: true, name: true, email: true } as const;

/** A person to tell about something: their account's language and their Cruising switches. */
const recipientSelect = {
  id: true,
  email: true,
  locale: true,
  cruisingProfile: { select: { emailAlerts: true, suspendedAt: true, suspendedUntil: true } },
} as const;

/** Where a check-in points: enough to name the spot and link to it. */
const spotRefSelect = { id: true, slug: true, name: true } as const;

/** The most check-ins the presence of one spot lists (a spot is rarely this busy). */
const MAX_PRESENCE_ROWS = 500;

/**
 * The check-ins that count as someone being there now, for a viewer: unexpired, not by people
 * hidden from them (a block either way), not by suspended members. Shared by a spot's presence and
 * the map's "active now", so both count the same people.
 */
function activeCheckInWhere(now: Date, hiddenIds: string[]): Prisma.CruisingCheckInWhereInput {
  return {
    expiresAt: { gt: now },
    ...(hiddenIds.length ? { userId: { notIn: hiddenIds } } : {}),
    user: {
      cruisingProfile: {
        is: { OR: [{ suspendedAt: null }, { suspendedUntil: { lte: now } }] },
      },
    },
  };
}

/** A city a search found: its spots' count and corners (raw SQL, so snake case). */
type CitySearchRow = {
  country_code: string;
  city_slug: string;
  city: string;
  count: number;
  min_lng: unknown;
  min_lat: unknown;
  max_lng: unknown;
  max_lat: unknown;
};

/** A spot a search found, as the map's summary needs it. */
type SpotSearchRow = {
  id: string;
  slug: string;
  name: string;
  type: CruisingSpotType;
  lat: unknown;
  lng: unknown;
  rating_avg: unknown;
  rating_count: number;
};

/** A review's author: the nickname and the counters their badges come from (decision 93). */
const reviewAuthorSelect = {
  nickname: true,
  spotsLive: true,
  helpfulReceived: true,
  reviewsWritten: true,
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
 * Recomputes the review counters of members' profiles (decision 93): their LIVE reviews and the
 * helpful votes those received. Called inside the transaction of every change to them.
 */
export async function recomputeReviewCounters(
  tx: Pick<Prisma.TransactionClient, 'cruisingReview' | 'cruisingReviewVote' | 'cruisingProfile'>,
  userIds: Iterable<string>,
): Promise<void> {
  for (const userId of new Set(userIds)) {
    const [reviewsWritten, helpfulReceived] = await Promise.all([
      tx.cruisingReview.count({ where: { userId, status: 'LIVE' } }),
      tx.cruisingReviewVote.count({ where: { review: { userId, status: 'LIVE' } } }),
    ]);
    // updateMany: a member without a profile (none yet, or being deleted) is fine.
    await tx.cruisingProfile.updateMany({
      where: { userId },
      data: { reviewsWritten, helpfulReceived },
    });
  }
}

/** Recomputes how many of a member's proposed spots are LIVE (decision 93's Explorer and Guide). */
export async function recomputeSpotsLive(
  tx: Pick<Prisma.TransactionClient, 'cruisingSpot' | 'cruisingProfile'>,
  userId: string,
): Promise<void> {
  const spotsLive = await tx.cruisingSpot.count({ where: { createdById: userId, status: 'LIVE' } });
  await tx.cruisingProfile.updateMany({ where: { userId }, data: { spotsLive } });
}

/**
 * Deletes an account. Its Cruising reviews go with it (cascade), so the ratings of the spots it
 * reviewed are worked out again in the same transaction; so are the counters of the members whose
 * reviews it found helpful (its votes go too).
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
    const voted = await tx.cruisingReviewVote.findMany({
      where: { userId: id },
      select: { review: { select: { userId: true } } },
    });
    await tx.user.delete({ where: { id } });
    for (const spotId of new Set(reviewed.map((review) => review.spotId))) {
      await recomputeSpotRating(tx, spotId);
    }
    const authors = voted.map((vote) => vote.review.userId).filter((author) => author !== id);
    if (authors.length > 0) await recomputeReviewCounters(tx, authors);
  });
}

@Injectable()
export class CruisingRepository implements AdultAppStore {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Profiles ----------------------------------------------------------------------------------

  findProfile(userId: string): Promise<CruisingProfile | null> {
    return this.prisma.cruisingProfile.findUnique({ where: { userId } });
  }

  /** The account's language (English when the account is gone). */
  async accountLocale(userId: string): Promise<Locale> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { locale: true },
    });
    return user?.locale ?? 'EN';
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

  /**
   * Saves the profile with a new nickname and records the old one, together (decision 83): the old
   * one stays reserved for this member for 14 days.
   */
  async updateProfileChangingNickname(
    userId: string,
    data: Prisma.CruisingProfileUpdateInput,
    oldNickname: string,
    now: Date,
  ): Promise<CruisingProfile> {
    const [profile] = await this.prisma.$transaction([
      this.prisma.cruisingProfile.update({ where: { userId }, data }),
      this.prisma.cruisingNicknameChange.create({ data: { userId, oldNickname, changedAt: now } }),
    ]);
    return profile;
  }

  /** Who left `nickname` since `since` (it is still theirs), or null. */
  async nicknameReservedFor(nickname: string, since: Date): Promise<string | null> {
    const row = await this.prisma.cruisingNicknameChange.findFirst({
      where: { oldNickname: nickname, changedAt: { gte: since } },
      orderBy: { changedAt: 'desc' },
      select: { userId: true },
    });
    return row?.userId ?? null;
  }

  /** Nickname changes older than `before` no longer reserve the name they left. */
  async deleteNicknameChangesBefore(before: Date): Promise<number> {
    const { count } = await this.prisma.cruisingNicknameChange.deleteMany({
      where: { changedAt: { lt: before } },
    });
    return count;
  }

  findProfileByNickname(nickname: string): Promise<CruisingProfile | null> {
    return this.prisma.cruisingProfile.findUnique({ where: { nickname } });
  }

  /** Who to tell about something, with their language and Cruising switches. */
  recipient(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId }, select: recipientSelect });
  }

  /** The account's username and role: the Cruising name by default (owner's feedback 2026-11-17). */
  accountName(id: string) {
    return this.prisma.user.findUnique({ where: { id }, select: { username: true, role: true } });
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

  /** Many spots in one transaction (an import): all or none. */
  createSpots(rows: Prisma.CruisingSpotUncheckedCreateInput[]) {
    return this.prisma.$transaction(
      rows.map((data) =>
        this.prisma.cruisingSpot.create({ data, select: { id: true, slug: true } }),
      ),
    );
  }

  /**
   * Spots of `type` in the box that a new one could duplicate: every status but REJECTED and
   * REMOVED (decision 84). The caller measures the real distance.
   */
  async possibleDuplicates(box: Bbox, type: CruisingSpotType) {
    const rows = await this.prisma.cruisingSpot.findMany({
      where: {
        type,
        status: { notIn: ['REJECTED', 'REMOVED'] },
        lat: { gte: box.minLat, lte: box.maxLat },
        lng: { gte: box.minLng, lte: box.maxLng },
      },
      select: { id: true, slug: true, name: true, type: true, lat: true, lng: true },
    });
    return rows.map((row) => ({ ...row, lat: Number(row.lat), lng: Number(row.lng) }));
  }

  /**
   * The team's change to a spot. A change of status recomputes its proposer's count of LIVE spots
   * in the same transaction (decision 93).
   */
  updateSpot(id: string, data: Prisma.CruisingSpotUncheckedUpdateInput) {
    if (data.status === undefined) return this.prisma.cruisingSpot.update({ where: { id }, data });
    return this.prisma.$transaction(async (tx) => {
      const spot = await tx.cruisingSpot.update({ where: { id }, data });
      if (spot.createdById) await recomputeSpotsLive(tx, spot.createdById);
      return spot;
    });
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

  /**
   * Deletes the proposer's PENDING or REJECTED spot; false when it can no longer be deleted. A spot
   * that was LIVE once may have reviews: their authors' counters are worked out again.
   */
  async deleteOwnSpot(id: string, userId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const reviewers = await tx.cruisingReview.findMany({
        where: { spotId: id },
        select: { userId: true },
      });
      const { count } = await tx.cruisingSpot.deleteMany({
        where: { id, createdById: userId, status: { in: ['PENDING', 'REJECTED'] } },
      });
      if (count > 0 && reviewers.length > 0) {
        await recomputeReviewCounters(
          tx,
          reviewers.map((review) => review.userId),
        );
      }
      return count > 0;
    });
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

  /** A member's proposed spots that are LIVE, newest first (their profile's "Spots"). */
  liveSpotsBy(userId: string, take: number) {
    return this.prisma.cruisingSpot.findMany({
      where: { createdById: userId, status: 'LIVE' },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take,
      select: { ...spotSummarySelect, city: true, countryCode: true },
    });
  }

  /**
   * A member's LIVE reviews of LIVE spots, newest first (their profile's "Reviews"), each with its
   * spot and its helpful votes.
   */
  liveReviewsBy(userId: string, take: number) {
    return this.prisma.cruisingReview.findMany({
      where: { userId, status: 'LIVE', spot: { status: 'LIVE' } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take,
      select: {
        id: true,
        rating: true,
        text: true,
        createdAt: true,
        spot: { select: { slug: true, name: true, city: true, countryCode: true } },
        _count: { select: { votes: true } },
      },
    });
  }

  /**
   * LIVE spots in the box, best rated first, of a type and rated at least `minRating` when given
   * (a spot with no rating is then left out). The caller asks for one more than it shows.
   */
  spotsInBox(
    box: Bbox,
    filters: { type?: CruisingSpotType; minRating?: number; tags?: SpotTag[] },
    take: number,
  ) {
    return this.prisma.cruisingSpot.findMany({
      where: {
        status: 'LIVE',
        lng: { gte: box.minLng, lte: box.maxLng },
        lat: { gte: box.minLat, lte: box.maxLat },
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.minRating
          ? { ratingCount: { gt: 0 }, ratingAvg: { gte: filters.minRating } }
          : {}),
        ...(filters.tags?.length ? { tags: { hasEvery: filters.tags } } : {}),
      },
      orderBy: [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }, { id: 'asc' }],
      take,
      select: spotSummarySelect,
    });
  }

  /**
   * Cities with LIVE spots whose name matches `contains` (accents and case ignored, Postgres
   * `unaccent`), those starting with it first, then the busiest. Each with the box around its spots
   * and the spelling most of them use.
   */
  searchCities(contains: string, prefix: string, take: number): Promise<CitySearchRow[]> {
    return this.prisma.$queryRaw<CitySearchRow[]>`
      SELECT country_code, city_slug,
        mode() WITHIN GROUP (ORDER BY city) AS city,
        count(*)::int AS count,
        min(lng) AS min_lng, min(lat) AS min_lat, max(lng) AS max_lng, max(lat) AS max_lat
      FROM cruising_spots
      WHERE status = 'LIVE' AND unaccent(city) ILIKE unaccent(${contains})
      GROUP BY country_code, city_slug
      ORDER BY bool_or(unaccent(city) ILIKE unaccent(${prefix})) DESC, count(*) DESC,
        city_slug ASC, country_code ASC
      LIMIT ${take}`;
  }

  /** LIVE spots whose name matches, like `searchCities`: those starting with it, then best rated. */
  searchSpots(contains: string, prefix: string, take: number): Promise<SpotSearchRow[]> {
    return this.prisma.$queryRaw<SpotSearchRow[]>`
      SELECT id, slug, name, type::text AS type, lat, lng, rating_avg, rating_count
      FROM cruising_spots
      WHERE status = 'LIVE' AND unaccent(name) ILIKE unaccent(${contains})
      ORDER BY (unaccent(name) ILIKE unaccent(${prefix})) DESC, rating_avg DESC,
        rating_count DESC, id ASC
      LIMIT ${take}`;
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

  /**
   * The LIVE reviews of a spot, most helpful first and then newest (decision 93), without those of
   * people hidden from the viewer (a block either way); each with its author's nickname and badge
   * counters, its helpful votes and whether the viewer gave one.
   */
  async reviewsOfSpot(
    spotId: string,
    skip: number,
    take: number,
    hiddenIds: string[] = [],
    viewerId = '',
  ) {
    const where: Prisma.CruisingReviewWhereInput = {
      spotId,
      status: 'LIVE',
      ...(hiddenIds.length ? { userId: { notIn: hiddenIds } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.cruisingReview.findMany({
        where,
        orderBy: [{ votes: { _count: 'desc' } }, { createdAt: 'desc' }, { id: 'asc' }],
        skip,
        take,
        include: {
          user: { select: { cruisingProfile: { select: reviewAuthorSelect } } },
          _count: { select: { votes: true } },
          votes: { where: { userId: viewerId }, select: { userId: true }, take: 1 },
        },
      }),
      this.prisma.cruisingReview.count({ where }),
    ]);
    const items = rows.map(({ user, _count, votes, ...review }) => ({
      ...review,
      nickname: user.cruisingProfile?.nickname ?? null,
      counters: user.cruisingProfile ?? null,
      helpful: _count.votes,
      helpfulMine: votes.length > 0,
    }));
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
      await recomputeReviewCounters(tx, [userId]);
      return review;
    });
  }

  async deleteReview(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const review = await tx.cruisingReview.delete({ where: { id } });
      await recomputeSpotRating(tx, review.spotId);
      await recomputeReviewCounters(tx, [review.userId]);
    });
  }

  async setReviewStatus(id: string, status: CruisingReviewStatus): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const review = await tx.cruisingReview.update({ where: { id }, data: { status } });
      await recomputeSpotRating(tx, review.spotId);
      await recomputeReviewCounters(tx, [review.userId]);
    });
  }

  // ---- Helpful votes (phase 5, decision 93) ------------------------------------------------------

  countHelpfulVotes(reviewId: string): Promise<number> {
    return this.prisma.cruisingReviewVote.count({ where: { reviewId } });
  }

  /** Marks a review helpful for a member (again is fine) and updates its author's counters. */
  async addHelpfulVote(reviewId: string, userId: string, authorId: string, now: Date) {
    await this.prisma.$transaction(async (tx) => {
      await tx.cruisingReviewVote.createMany({
        data: [{ reviewId, userId, createdAt: now }],
        skipDuplicates: true,
      });
      await recomputeReviewCounters(tx, [authorId]);
    });
  }

  /** Takes a member's helpful vote back (none is fine) and updates the author's counters. */
  async removeHelpfulVote(reviewId: string, userId: string, authorId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.cruisingReviewVote.deleteMany({ where: { reviewId, userId } });
      await recomputeReviewCounters(tx, [authorId]);
    });
  }

  // ---- Busiest hours (phase 5, decision 89) ------------------------------------------------------

  /** A spot's hour counters and how many check-ins were ever counted. */
  async spotHours(spotId: string) {
    const [rows, spot] = await Promise.all([
      this.prisma.cruisingSpotHour.findMany({
        where: { spotId },
        select: { day: true, hour: true, weight: true },
      }),
      this.prisma.cruisingSpot.findUnique({
        where: { id: spotId },
        select: { hourCheckIns: true },
      }),
    ]);
    return { rows, checkIns: spot?.hourCheckIns ?? 0 };
  }

  /**
   * The nightly decay: the hours of every spot whose last decay is older than `before` are
   * multiplied by `factor`, and the spot's decay time moves a day on (a spot behind, the API having
   * been down, catches up a day per run). One statement, so a spot is never decayed twice for one
   * day, whichever API instance runs it.
   */
  async decaySpotHours(before: Date, factor: number): Promise<number> {
    return this.prisma.$executeRaw`
      WITH due AS (
        UPDATE cruising_spots SET hours_decayed_at = hours_decayed_at + interval '1 day'
        WHERE hours_decayed_at IS NOT NULL AND hours_decayed_at <= ${before}
        RETURNING id
      )
      UPDATE cruising_spot_hours SET weight = weight * ${factor}
      WHERE spot_id IN (SELECT id FROM due)`;
  }

  /** Spots without a time zone yet (created before phase 5), a batch at a time. */
  spotsWithoutTimeZone(take: number) {
    return this.prisma.cruisingSpot.findMany({
      where: { timeZone: null },
      select: { id: true, lat: true, lng: true },
      orderBy: { id: 'asc' },
      take,
    });
  }

  async setSpotTimeZone(id: string, timeZone: string): Promise<void> {
    await this.prisma.cruisingSpot.update({ where: { id }, data: { timeZone } });
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
        meetup: { select: { id: true, status: true } },
        safetyAlert: { select: { id: true, hidden: true } },
        roomMessage: { select: { id: true, hidden: true } },
      },
    });
  }

  reports(status: CruisingReportStatus) {
    return this.prisma.cruisingReport.findMany({
      where: { status },
      orderBy: { createdAt: status === 'OPEN' ? 'asc' : 'desc' },
      take: ADMIN_LIST_LIMIT,
      include: {
        reporter: { select: { ...personSelect, cruisingProfile: { select: { nickname: true } } } },
        reported: { select: { ...personSelect, cruisingProfile: true } },
        reviewedBy: { select: { id: true, name: true } },
        spot: { select: { id: true, slug: true, name: true, type: true, status: true } },
        media: { select: { id: true, ref: true, kind: true, status: true } },
        meetup: {
          select: {
            id: true,
            title: true,
            description: true,
            startsAt: true,
            status: true,
            spot: { select: { id: true, slug: true, name: true } },
          },
        },
        safetyAlert: {
          select: {
            id: true,
            kind: true,
            note: true,
            hidden: true,
            expiresAt: true,
            spot: { select: { id: true, slug: true, name: true } },
          },
        },
        review: {
          select: {
            id: true,
            rating: true,
            text: true,
            status: true,
            spot: { select: { id: true, slug: true, name: true, status: true } },
          },
        },
        roomMessage: { select: { id: true, countryCode: true, citySlug: true, hidden: true } },
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

  countOpenReportsOnMeetup(meetupId: string): Promise<number> {
    return this.prisma.cruisingReport.count({ where: { meetupId, status: 'OPEN' } });
  }

  countOpenReportsOnSafetyAlert(safetyAlertId: string): Promise<number> {
    return this.prisma.cruisingReport.count({ where: { safetyAlertId, status: 'OPEN' } });
  }

  // ---- Reported meetups and safety alerts (phase 5) ----------------------------------------------

  findMeetupForReport(id: string) {
    return this.prisma.cruisingMeetup.findUnique({
      where: { id },
      select: { id: true, hostId: true, status: true, spot: { select: { status: true } } },
    });
  }

  async setMeetupStatus(id: string, status: 'LIVE' | 'HIDDEN'): Promise<void> {
    await this.prisma.cruisingMeetup.updateMany({
      where: { id, status: { not: 'CANCELLED' } },
      data: { status },
    });
  }

  async deleteMeetup(id: string): Promise<void> {
    await this.prisma.cruisingMeetup.deleteMany({ where: { id } });
  }

  findSafetyAlertForReport(id: string) {
    return this.prisma.cruisingSafetyAlert.findUnique({
      where: { id },
      select: {
        id: true,
        posterId: true,
        hidden: true,
        expiresAt: true,
        spot: { select: { status: true } },
      },
    });
  }

  async setSafetyAlertHidden(id: string, hidden: boolean): Promise<void> {
    await this.prisma.cruisingSafetyAlert.updateMany({ where: { id }, data: { hidden } });
  }

  async deleteSafetyAlert(id: string): Promise<void> {
    await this.prisma.cruisingSafetyAlert.deleteMany({ where: { id } });
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
        media: { select: { id: true, ref: true, kind: true, status: true } },
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
    const [spot, report, takedown, media] = await Promise.all([
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
      this.prisma.cruisingMedia.findFirst({
        where: { reviewedAt: null, status: { in: ['LIVE', 'HIDDEN', 'PROCESSING'] } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);
    const times = [
      spot?.updatedAt,
      report?.createdAt,
      takedown?.createdAt,
      media?.createdAt,
    ].filter((time): time is Date => !!time);
    return times.length ? new Date(Math.max(...times.map((time) => time.getTime()))) : null;
  }

  async overview(now: Date) {
    const [
      members,
      pendingSpots,
      liveSpots,
      openReports,
      openTakedowns,
      reviews,
      suspended,
      activeCheckIns,
      conversations,
      newMedia,
      liveMedia,
      pendingVerifications,
    ] = await Promise.all([
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
      this.prisma.cruisingCheckIn.count({ where: { expiresAt: { gt: now } } }),
      this.prisma.cruisingConversation.count(),
      this.prisma.cruisingMedia.count({
        where: { reviewedAt: null, status: { in: ['LIVE', 'HIDDEN', 'PROCESSING'] } },
      }),
      this.prisma.cruisingMedia.count({ where: { status: 'LIVE' } }),
      // The one verification queue of the 18+ apps (architecture 4.16).
      this.prisma.adultVerification.count({ where: { status: 'PENDING' } }),
    ]);
    return {
      members,
      pendingSpots,
      liveSpots,
      openReports,
      openTakedowns,
      reviews,
      suspended,
      activeCheckIns,
      conversations,
      newMedia,
      liveMedia,
      pendingVerifications,
    };
  }

  // ---- Blocks (phase 2; shared in the three 18+ apps, architecture 4.16) -------------------------

  /** The people hidden from `userId`: those they blocked and those who blocked them. */
  async hiddenIds(userId: string): Promise<string[]> {
    const blocks = await this.prisma.cruisingBlock.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    return [
      ...new Set(blocks.map((row) => (row.blockerId === userId ? row.blockedId : row.blockerId))),
    ];
  }

  // ---- The shared safety's view of Cruising (AdultAppStore, architecture 4.16) --------------------

  readonly app = 'CRUISING' as const;

  /**
   * Blocks `blockedId` for `blockerId` and deletes the conversation between them and the private
   * albums they shared with each other (decision 99), inside the shared block's transaction.
   */
  async applyBlock(db: Db, blockerId: string, blockedId: string, sourceApp: AdultApp) {
    await db.cruisingBlock.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId, sourceApp },
      update: {},
    });
    await this.clearBetween(db, blockerId, blockedId);
  }

  async clearBetween(db: Db, a: string, b: string): Promise<void> {
    const [userAId, userBId] = conversationPair(a, b);
    await db.cruisingConversation.deleteMany({ where: { userAId, userBId } });
    await db.cruisingAlbumGrant.deleteMany({
      where: { ownerId: { in: [userAId, userBId] }, granteeId: { in: [userAId, userBId] } },
    });
  }

  async removeBlock(db: Db, blockerId: string, blockedId: string): Promise<boolean> {
    const { count } = await db.cruisingBlock.deleteMany({ where: { blockerId, blockedId } });
    return count > 0;
  }

  suspensionState(db: Db, userId: string) {
    return db.cruisingProfile.findUnique({
      where: { userId },
      select: { suspendedAt: true, suspendedUntil: true },
    });
  }

  async setSuspension(db: Db, userId: string, suspension: ProfileSuspension): Promise<void> {
    await db.cruisingProfile.update({
      where: { userId },
      data: {
        suspendedAt: suspension.at,
        suspendedUntil: suspension.until,
        suspensionReason: suspension.reason,
        suspensionCategory: suspension.category,
      },
    });
    // A suspended member can't be "here": the check-in ends with the suspension.
    await db.cruisingCheckIn.updateMany({
      where: { userId, expiresAt: { gt: suspension.at } },
      data: { expiresAt: suspension.at },
    });
  }

  async clearSuspensionAt(db: Db, userId: string, at: Date): Promise<void> {
    await db.cruisingProfile.updateMany({
      where: { userId, suspendedAt: at },
      data: {
        suspendedAt: null,
        suspendedUntil: null,
        suspensionReason: null,
        suspensionCategory: null,
      },
    });
  }

  async entryOf(userId: string): Promise<AppEntry | null> {
    const profile = await this.prisma.cruisingProfile.findUnique({
      where: { userId },
      select: { termsVersion: true, suspendedAt: true, suspendedUntil: true, nickname: true },
    });
    return profile
      ? {
          termsVersion: profile.termsVersion,
          suspendedAt: profile.suspendedAt,
          suspendedUntil: profile.suspendedUntil,
          name: profile.nickname,
        }
      : null;
  }

  async namesOf(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.prisma.cruisingProfile.findMany({
      where: { userId: { in: userIds }, nickname: { not: null } },
      select: { userId: true, nickname: true },
    });
    return new Map(rows.map((row) => [row.userId, row.nickname as string]));
  }

  async overviewOf(userId: string): Promise<AppPersonOverview> {
    const [profile, received, reportsMade] = await Promise.all([
      this.prisma.cruisingProfile.findUnique({
        where: { userId },
        select: {
          createdAt: true,
          nickname: true,
          suspendedAt: true,
          suspendedUntil: true,
          suspensionReason: true,
          suspensionCategory: true,
        },
      }),
      this.prisma.cruisingReport.groupBy({
        by: ['status', 'reason'],
        where: { reportedId: userId },
        _count: { _all: true },
      }),
      this.prisma.cruisingReport.count({ where: { reporterId: userId } }),
    ]);
    return {
      enteredAt: profile?.createdAt ?? null,
      name: profile?.nickname ?? null,
      reportsReceived: received.map((row) => ({
        status: row.status,
        reason: row.reason,
        count: row._count._all,
      })),
      reportsMade,
      suspension: profile?.suspendedAt
        ? {
            since: profile.suspendedAt,
            until: profile.suspendedUntil,
            reason: profile.suspensionReason,
            category: profile.suspensionCategory,
          }
        : null,
    };
  }

  async reportCountsOf(userIds: string[]) {
    const counts = new Map<string, { open: number; total: number }>();
    if (userIds.length === 0) return counts;
    const rows = await this.prisma.cruisingReport.groupBy({
      by: ['reportedId', 'status'],
      where: { reportedId: { in: userIds } },
      _count: { _all: true },
    });
    for (const row of rows) {
      if (!row.reportedId) continue;
      const entry = counts.get(row.reportedId) ?? { open: 0, total: 0 };
      entry.total += row._count._all;
      if (row.status === 'OPEN') entry.open += row._count._all;
      counts.set(row.reportedId, entry);
    }
    return counts;
  }

  blocksMadeBy(userId: string) {
    return this.prisma.cruisingBlock.findMany({
      where: { blockerId: userId },
      orderBy: { createdAt: 'desc' },
      select: { blockedId: true, sourceApp: true, createdAt: true },
    });
  }

  async blockersOf(userId: string): Promise<string[]> {
    const rows = await this.prisma.cruisingBlock.findMany({
      where: { blockedId: userId },
      select: { blockerId: true },
    });
    return rows.map((row) => row.blockerId);
  }

  async digestCounts(): Promise<Array<[string, number]>> {
    const overview = await this.overview(new Date());
    return [
      ['Spots to review', overview.pendingSpots],
      ['Reports', overview.openReports],
      ['Removal requests', overview.openTakedowns],
      ['New photos and videos', overview.newMedia],
    ];
  }

  // ---- Check-ins (phase 2) -----------------------------------------------------------------------

  /** Ends the person's active check-in, if any (it expires now). */
  async endCheckIns(userId: string, now: Date): Promise<void> {
    await this.prisma.cruisingCheckIn.updateMany({
      where: { userId, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
  }

  /**
   * Ends the previous check-in and creates the new one, together; in the same transaction the
   * spot's busiest hours count it (decision 89): one more in each of `slots` (local hours), one
   * more check-in counted, and the spot's time zone stored.
   */
  async createCheckIn(
    userId: string,
    spotId: string,
    anonymous: boolean,
    expiresAt: Date,
    now: Date,
    hours?: { slots: { day: number; hour: number }[]; timeZone: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.cruisingCheckIn.updateMany({
        where: { userId, expiresAt: { gt: now } },
        data: { expiresAt: now },
      });
      const checkIn = await tx.cruisingCheckIn.create({
        data: { userId, spotId, anonymous, expiresAt, createdAt: now },
        include: { spot: { select: spotRefSelect } },
      });
      if (hours && hours.slots.length > 0) {
        for (const { day, hour } of hours.slots) {
          await tx.cruisingSpotHour.upsert({
            where: { spotId_day_hour: { spotId, day, hour } },
            create: { spotId, day, hour, weight: 1 },
            update: { weight: { increment: 1 } },
          });
        }
        await tx.cruisingSpot.update({
          where: { id: spotId },
          data: { hourCheckIns: { increment: 1 }, timeZone: hours.timeZone },
        });
        // The nightly decay starts from the first check-in counted.
        await tx.cruisingSpot.updateMany({
          where: { id: spotId, hoursDecayedAt: null },
          data: { hoursDecayedAt: now },
        });
      }
      return checkIn;
    });
  }

  activeCheckIn(userId: string, now: Date) {
    return this.prisma.cruisingCheckIn.findFirst({
      where: { userId, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      include: { spot: { select: spotRefSelect } },
    });
  }

  countCheckInsSince(userId: string, since: Date): Promise<number> {
    return this.prisma.cruisingCheckIn.count({ where: { userId, createdAt: { gte: since } } });
  }

  /**
   * The active check-ins at a spot, oldest first, without the people hidden from the viewer and
   * without suspended ones; each with the nickname.
   */
  presence(spotId: string, now: Date, hiddenIds: string[]) {
    return this.prisma.cruisingCheckIn.findMany({
      where: { spotId, ...activeCheckInWhere(now, hiddenIds) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: MAX_PRESENCE_ROWS,
      select: {
        id: true,
        anonymous: true,
        createdAt: true,
        user: { select: { id: true, cruisingProfile: { select: { nickname: true } } } },
      },
    });
  }

  /**
   * The LIVE spots in the box with someone there now, for a viewer, and how many: counted like a
   * spot's presence (anonymous check-ins too; never the hidden or the suspended).
   */
  async activeInBox(
    box: Bbox,
    now: Date,
    hiddenIds: string[],
    take: number,
  ): Promise<{ spotId: string; here: number }[]> {
    const rows = await this.prisma.cruisingCheckIn.groupBy({
      by: ['spotId'],
      where: {
        ...activeCheckInWhere(now, hiddenIds),
        spot: {
          status: 'LIVE',
          lng: { gte: box.minLng, lte: box.maxLng },
          lat: { gte: box.minLat, lte: box.maxLat },
        },
      },
      _count: { _all: true },
      orderBy: { spotId: 'asc' },
      take,
    });
    return rows.map((row) => ({ spotId: row.spotId, here: row._count._all }));
  }

  /** Deletes the check-ins that expired before `before`; how many. */
  async deleteCheckInsExpiredBefore(before: Date): Promise<number> {
    const { count } = await this.prisma.cruisingCheckIn.deleteMany({
      where: { expiresAt: { lt: before } },
    });
    return count;
  }

  // ---- Conversations and messages (phase 2) ------------------------------------------------------

  findConversation(id: string): Promise<CruisingConversation | null> {
    return this.prisma.cruisingConversation.findUnique({ where: { id } });
  }

  findConversationBetween(first: string, second: string): Promise<CruisingConversation | null> {
    const [userAId, userBId] = conversationPair(first, second);
    return this.prisma.cruisingConversation.findUnique({
      where: { userAId_userBId: { userAId, userBId } },
    });
  }

  /** Opens a conversation and records the start (which outlives the conversation), together. */
  async createConversation(starterId: string, partnerId: string): Promise<CruisingConversation> {
    const [userAId, userBId] = conversationPair(starterId, partnerId);
    const [conversation] = await this.prisma.$transaction([
      this.prisma.cruisingConversation.create({ data: { userAId, userBId, starterId } }),
      this.prisma.cruisingConversationStart.create({ data: { userId: starterId } }),
    ]);
    return conversation;
  }

  /** Conversations I opened since `since`, even those deleted since (leaving doesn't refund). */
  countConversationsStartedSince(userId: string, since: Date): Promise<number> {
    return this.prisma.cruisingConversationStart.count({
      where: { userId, createdAt: { gte: since } },
    });
  }

  /** Starts older than `before` no longer count toward any day's limit. */
  async deleteConversationStartsBefore(before: Date): Promise<number> {
    const { count } = await this.prisma.cruisingConversationStart.deleteMany({
      where: { createdAt: { lt: before } },
    });
    return count;
  }

  /** My conversations, latest first, each with the partner and the last message. */
  conversationsOf(userId: string) {
    return this.prisma.cruisingConversation.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: MAX_LIST_ROWS,
      include: {
        userA: { select: { cruisingProfile: { select: { nickname: true } } } },
        userB: { select: { cruisingProfile: { select: { nickname: true } } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { text: true, senderId: true, createdAt: true },
        },
      },
    });
  }

  /** Deletes a conversation for both; the private albums they shared go with it (decision 99). */
  async deleteConversation(id: string): Promise<CruisingConversation> {
    const found = await this.prisma.cruisingConversation.findUniqueOrThrow({ where: { id } });
    const pair = [found.userAId, found.userBId];
    const [conversation] = await this.prisma.$transaction([
      this.prisma.cruisingConversation.delete({ where: { id } }),
      this.prisma.cruisingAlbumGrant.deleteMany({
        where: { ownerId: { in: pair }, granteeId: { in: pair } },
      }),
    ]);
    return conversation;
  }

  /** Messages from `senderId` in a conversation after `since` (the unread ones). */
  countMessagesFrom(conversationId: string, senderId: string, since: Date | null): Promise<number> {
    return this.prisma.cruisingMessage.count({
      where: { conversationId, senderId, ...(since ? { createdAt: { gt: since } } : {}) },
    });
  }

  /** The last 100 messages, or those after `after`, oldest first. */
  async messages(conversationId: string, after: Date | undefined) {
    if (after) {
      return this.prisma.cruisingMessage.findMany({
        where: { conversationId, createdAt: { gt: after } },
        orderBy: { createdAt: 'asc' },
        take: MESSAGES_PAGE,
      });
    }
    const last = await this.prisma.cruisingMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: MESSAGES_PAGE,
    });
    return last.toReversed();
  }

  async lastMessages(conversationId: string, take: number) {
    const last = await this.prisma.cruisingMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return last.toReversed();
  }

  /** Adds a message; the sender has read the conversation up to it. */
  async addMessage(conversation: CruisingConversation, senderId: string, text: string, now: Date) {
    const readField = conversation.userAId === senderId ? { readAAt: now } : { readBAt: now };
    const [message] = await this.prisma.$transaction([
      this.prisma.cruisingMessage.create({
        data: { conversationId: conversation.id, senderId, text, createdAt: now },
      }),
      this.prisma.cruisingConversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: now, ...readField },
      }),
    ]);
    return message;
  }

  /** Messages each person has sent in a conversation. */
  async messageCounts(conversationId: string): Promise<Map<string, number>> {
    const rows = await this.prisma.cruisingMessage.groupBy({
      by: ['senderId'],
      where: { conversationId },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.senderId, row._count._all]));
  }

  markRead(conversation: CruisingConversation, userId: string, now: Date) {
    return this.prisma.cruisingConversation.update({
      where: { id: conversation.id },
      data: conversation.userAId === userId ? { readAAt: now } : { readBAt: now },
    });
  }

  /**
   * Conversations whose last message is between `from` and `to` old, with that message's sender: a
   * page of `take` in a stable order, after the conversation `cursor` (the last of the previous page).
   */
  recentlyActiveConversations(from: Date, to: Date, cursor?: string, take = 500) {
    return this.prisma.cruisingConversation.findMany({
      where: { lastMessageAt: { gte: from, lte: to } },
      orderBy: { id: 'asc' },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { senderId: true } },
      },
    });
  }

  markNotified(conversation: CruisingConversation, userId: string, now: Date) {
    return this.prisma.cruisingConversation.update({
      where: { id: conversation.id },
      data: conversation.userAId === userId ? { notifiedAAt: now } : { notifiedBAt: now },
    });
  }

  // ---- Favourites (phase 3, decision 85) ---------------------------------------------------------

  /** My favourites whose spot is LIVE, newest first, each with the spot's summary. */
  favorites(userId: string, take: number) {
    return this.prisma.cruisingFavorite.findMany({
      where: { userId, spot: { status: 'LIVE' } },
      orderBy: [{ createdAt: 'desc' }, { spotId: 'asc' }],
      take,
      select: { createdAt: true, spot: { select: spotSummarySelect } },
    });
  }

  /** How many are at each of `spotIds` now, for a viewer: counted like a spot's presence. */
  async hereAt(spotIds: string[], now: Date, hiddenIds: string[]): Promise<Map<string, number>> {
    if (spotIds.length === 0) return new Map();
    const rows = await this.prisma.cruisingCheckIn.groupBy({
      by: ['spotId'],
      where: { spotId: { in: spotIds }, ...activeCheckInWhere(now, hiddenIds) },
      _count: { _all: true },
      orderBy: { spotId: 'asc' },
    });
    return new Map(rows.map((row) => [row.spotId, row._count._all]));
  }

  async isFavorite(userId: string, spotId: string): Promise<boolean> {
    const row = await this.prisma.cruisingFavorite.findUnique({
      where: { userId_spotId: { userId, spotId } },
      select: { spotId: true },
    });
    return row !== null;
  }

  countFavorites(userId: string): Promise<number> {
    return this.prisma.cruisingFavorite.count({ where: { userId } });
  }

  /** Saves a favourite; saving it again changes nothing. */
  async addFavorite(userId: string, spotId: string, now: Date): Promise<void> {
    await this.prisma.cruisingFavorite.upsert({
      where: { userId_spotId: { userId, spotId } },
      create: { userId, spotId, createdAt: now },
      update: {},
    });
  }

  async removeFavorite(userId: string, spotId: string): Promise<void> {
    await this.prisma.cruisingFavorite.deleteMany({ where: { userId, spotId } });
  }

  // ---- Alerts (phase 3, decision 85) -------------------------------------------------------------

  /**
   * The members who saved `spotId` and may be alerted about it: entered with the current rules,
   * not suspended, not in `excludeIds` (the person checking in and anyone blocked either way).
   */
  favoriteAlertCandidates(spotId: string, excludeIds: string[], termsVersion: string, now: Date) {
    return this.prisma.cruisingFavorite.findMany({
      where: {
        spotId,
        userId: { notIn: excludeIds },
        user: {
          cruisingProfile: {
            is: {
              termsVersion,
              OR: [{ suspendedAt: null }, { suspendedUntil: { lte: now } }],
            },
          },
        },
      },
      select: {
        userId: true,
        user: {
          select: {
            email: true,
            locale: true,
            cruisingProfile: {
              select: { favoriteAlerts: true, favoriteEmails: true, emailAlerts: true },
            },
            _count: { select: { cruisingPushSubscriptions: true } },
          },
        },
      },
    });
  }

  /** The alerts of `userIds` since `since` (a member has at most 10 a day). */
  recentAlerts(userIds: string[], since: Date) {
    if (userIds.length === 0) return Promise.resolve([]);
    return this.prisma.cruisingAlert.findMany({
      where: { userId: { in: userIds }, createdAt: { gt: since } },
      select: { userId: true, spotId: true, channel: true, createdAt: true },
    });
  }

  async createAlerts(
    rows: { userId: string; spotId: string; channel: 'PUSH' | 'EMAIL'; createdAt: Date }[],
  ): Promise<void> {
    if (rows.length === 0) return;
    await this.prisma.cruisingAlert.createMany({ data: rows });
  }

  /** Deletes the alerts older than `before`; how many. */
  async deleteAlertsBefore(before: Date): Promise<number> {
    const { count } = await this.prisma.cruisingAlert.deleteMany({
      where: { createdAt: { lt: before } },
    });
    return count;
  }

  // ---- Push subscriptions (phase 3, decision 85) -------------------------------------------------

  /**
   * Saves a device's subscription for the member (a device another account used moves over) and
   * keeps only their `keep` newest.
   */
  async savePushSubscription(
    userId: string,
    data: { endpoint: string; p256dh: string; auth: string },
    keep: number,
    now: Date,
  ): Promise<void> {
    await this.prisma.cruisingPushSubscription.upsert({
      where: { endpoint: data.endpoint },
      create: { userId, ...data, createdAt: now },
      update: { userId, p256dh: data.p256dh, auth: data.auth, createdAt: now },
    });
    const extra = await this.prisma.cruisingPushSubscription.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: keep,
      select: { id: true },
    });
    if (extra.length > 0) {
      await this.prisma.cruisingPushSubscription.deleteMany({
        where: { id: { in: extra.map((row) => row.id) } },
      });
    }
  }

  async deletePushSubscription(endpoint: string, userId?: string): Promise<void> {
    await this.prisma.cruisingPushSubscription.deleteMany({
      where: userId ? { endpoint, userId } : { endpoint },
    });
  }

  /** The devices of `userIds` with notifications on. */
  pushSubscriptions(userIds: string[]) {
    if (userIds.length === 0) return Promise.resolve([]);
    return this.prisma.cruisingPushSubscription.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, endpoint: true, p256dh: true, auth: true },
    });
  }
}
