import { Injectable } from '@nestjs/common';
import type {
  Prisma,
  SwipeGender,
  SwipeMatch,
  SwipePhoto,
  SwipePhotoStatus,
  SwipeProfile,
  SwipeReportReason,
  SwipeReportStatus,
  SwipeTakedownStatus,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const personSelect = { id: true, name: true, email: true } as const;

/** Not suspended at `now`: never suspended, or a timed suspension that ended. */
export function notSuspended(now: Date): Prisma.SwipeProfileWhereInput {
  return { OR: [{ suspendedAt: null }, { suspendedUntil: { lt: now } }] };
}

export type MatchWithPeople = SwipeMatch & {
  userA: { id: string; swipeProfile: PartnerProfile | null };
  userB: { id: string; swipeProfile: PartnerProfile | null };
  messages: { text: string; senderId: string; createdAt: Date }[];
};

export interface PartnerProfile {
  nickname: string | null;
  gender: SwipeGender | null;
  interests: string[];
  bio: string | null;
}

const cardProfileSelect = { nickname: true, gender: true, interests: true, bio: true } as const;

const partnerSelect = { id: true, swipeProfile: { select: cardProfileSelect } } as const;

/** What the deck filters on: whom they want to see, ages and country. */
export interface DeckFilter {
  seeking: SwipeGender[];
  /** Birth years allowed (inclusive); undefined: any age, also people who didn't give theirs. */
  birthYears?: { from: number; to: number };
  /** Only owners from this country. */
  country?: string;
}

/** A person to tell about something: their account's language and their Swipe switches. */
const recipientSelect = {
  id: true,
  email: true,
  locale: true,
  swipeProfile: { select: { emailAlerts: true, suspendedAt: true, suspendedUntil: true } },
} as const;

@Injectable()
export class SwipeRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Profiles ----------------------------------------------------------------------------------

  findProfile(userId: string): Promise<SwipeProfile | null> {
    return this.prisma.swipeProfile.findUnique({ where: { userId } });
  }

  saveOnboarding(
    userId: string,
    termsVersion: string,
    birthYear: number,
    now: Date,
  ): Promise<SwipeProfile> {
    return this.prisma.swipeProfile.upsert({
      where: { userId },
      create: { userId, adultConfirmedAt: now, termsVersion, termsAcceptedAt: now, birthYear },
      update: { adultConfirmedAt: now, termsVersion, termsAcceptedAt: now, birthYear },
    });
  }

  /** Who to tell about something, with their language and Swipe switches. */
  recipient(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId }, select: recipientSelect });
  }

  updateProfile(userId: string, data: Prisma.SwipeProfileUpdateInput): Promise<SwipeProfile> {
    return this.prisma.swipeProfile.update({ where: { userId }, data });
  }

  findUser(id: string) {
    return this.prisma.user.findUnique({ where: { id }, select: personSelect });
  }

  // ---- Photos ------------------------------------------------------------------------------------

  createPhoto(data: Prisma.SwipePhotoUncheckedCreateInput): Promise<SwipePhoto> {
    return this.prisma.swipePhoto.create({ data });
  }

  findPhoto(id: string) {
    return this.prisma.swipePhoto.findUnique({
      where: { id },
      include: { owner: { select: { id: true, swipeProfile: true } } },
    });
  }

  findPhotoByRef(ref: string): Promise<SwipePhoto | null> {
    return this.prisma.swipePhoto.findUnique({ where: { ref } });
  }

  photosOf(ownerId: string): Promise<SwipePhoto[]> {
    return this.prisma.swipePhoto.findMany({ where: { ownerId }, orderBy: { createdAt: 'desc' } });
  }

  /** Photos that count towards the limit: pending or live. */
  countActivePhotos(ownerId: string): Promise<number> {
    return this.prisma.swipePhoto.count({
      where: { ownerId, status: { in: ['PENDING', 'LIVE'] } },
    });
  }

  countPhotosSince(ownerId: string, since: Date): Promise<number> {
    return this.prisma.swipePhoto.count({ where: { ownerId, createdAt: { gte: since } } });
  }

  updatePhoto(id: string, data: Prisma.SwipePhotoUncheckedUpdateInput): Promise<SwipePhoto> {
    return this.prisma.swipePhoto.update({ where: { id }, data });
  }

  deletePhoto(id: string): Promise<SwipePhoto> {
    return this.prisma.swipePhoto.delete({ where: { id } });
  }

  photosByStatus(status: SwipePhotoStatus) {
    return this.prisma.swipePhoto.findMany({
      where: { status },
      // Oldest first while waiting, newest first otherwise.
      orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' },
      take: 200,
      include: {
        owner: {
          select: {
            ...personSelect,
            createdAt: true,
            swipeProfile: {
              select: { nickname: true, gender: true, verifiedAt: true, verificationKey: true },
            },
          },
        },
        reviewedBy: { select: { id: true, name: true } },
      },
    });
  }

  /** Every storage key still in use (photos and verification photos). */
  async storageKeys(): Promise<Set<string>> {
    const [photos, profiles] = await Promise.all([
      this.prisma.swipePhoto.findMany({ select: { storageKey: true } }),
      this.prisma.swipeProfile.findMany({
        where: { verificationKey: { not: null } },
        select: { verificationKey: true },
      }),
    ]);
    return new Set([
      ...photos.map((photo) => photo.storageKey),
      ...profiles.map((profile) => profile.verificationKey as string),
    ]);
  }

  /** The cards for `viewerId`: live photos they haven't voted on, of people they can see. */
  /**
   * Live photos for the deck: not mine, not voted, no block either way, owner not suspended and
   * within the filter. With `lovedBy`, only photos of people who loved one of mine.
   */
  deck(viewerId: string, filter: DeckFilter, now: Date, take: number, lovedBy: boolean) {
    const profile: Prisma.SwipeProfileWhereInput[] = [notSuspended(now)];
    if (filter.seeking.length > 0) profile.push({ gender: { in: filter.seeking } });
    if (filter.birthYears) {
      profile.push({ birthYear: { gte: filter.birthYears.from, lte: filter.birthYears.to } });
    }
    if (filter.country) profile.push({ country: filter.country });
    return this.prisma.swipePhoto.findMany({
      where: {
        status: 'LIVE',
        ownerId: { not: viewerId },
        votes: { none: { voterId: viewerId } },
        owner: {
          swipeBlocksMade: { none: { blockedId: viewerId } },
          swipeBlocksGot: { none: { blockerId: viewerId } },
          swipeProfile: { is: { AND: profile } },
          ...(lovedBy ? { swipeVotes: { some: { ownerId: viewerId, superLike: true } } } : {}),
        },
      },
      orderBy: { createdAt: 'desc' },
      take,
      include: { owner: { select: { swipeProfile: { select: cardProfileSelect } } } },
    });
  }

  isBlockedEitherWay(a: string, b: string): Promise<boolean> {
    return this.prisma.swipeBlock
      .count({
        where: {
          OR: [
            { blockerId: a, blockedId: b },
            { blockerId: b, blockedId: a },
          ],
        },
      })
      .then((count) => count > 0);
  }

  // ---- Votes and matches -------------------------------------------------------------------------

  /** Records a vote once; returns false when this person had already voted on the photo. */
  async vote(
    voterId: string,
    photo: SwipePhoto,
    like: boolean,
    superLike = false,
    now = new Date(),
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.swipeVote.findUnique({
        where: { voterId_photoId: { voterId, photoId: photo.id } },
      });
      if (existing) return false;
      await tx.swipeVote.create({
        data: {
          voterId,
          photoId: photo.id,
          ownerId: photo.ownerId,
          like,
          superLike: like && superLike,
          createdAt: now,
        },
      });
      if (like) {
        await tx.swipePhoto.update({ where: { id: photo.id }, data: { likes: { increment: 1 } } });
      }
      return true;
    });
  }

  countSuperLikesSince(voterId: string, since: Date): Promise<number> {
    return this.prisma.swipeVote.count({
      where: { voterId, superLike: true, createdAt: { gte: since } },
    });
  }

  lastVote(voterId: string) {
    return this.prisma.swipeVote.findFirst({
      where: { voterId },
      orderBy: { createdAt: 'desc' },
      include: {
        photo: {
          include: { owner: { select: { id: true, swipeProfile: { select: cardProfileSelect } } } },
        },
      },
    });
  }

  /** Removes a vote (and its like from the photo's count). */
  async undoVote(voterId: string, photoId: string, like: boolean): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.swipeVote.deleteMany({ where: { voterId, photoId } });
      if (count > 0 && like) {
        await tx.swipePhoto.update({ where: { id: photoId }, data: { likes: { decrement: 1 } } });
      }
    });
  }

  hasMatch(a: string, b: string): Promise<boolean> {
    const [userAId, userBId] = a < b ? [a, b] : [b, a];
    return this.prisma.swipeMatch.count({ where: { userAId, userBId } }).then((count) => count > 0);
  }

  lovesSomePhotoOf(voterId: string, ownerId: string): Promise<boolean> {
    return this.prisma.swipeVote
      .count({ where: { voterId, ownerId, superLike: true } })
      .then((count) => count > 0);
  }

  hasLikedSomePhotoOf(voterId: string, ownerId: string): Promise<boolean> {
    return this.prisma.swipeVote
      .count({ where: { voterId, ownerId, like: true } })
      .then((count) => count > 0);
  }

  /** Creates the match of two people; returns null when they already had one. */
  async createMatch(a: string, b: string): Promise<SwipeMatch | null> {
    const [userAId, userBId] = a < b ? [a, b] : [b, a];
    const existing = await this.prisma.swipeMatch.findUnique({
      where: { userAId_userBId: { userAId, userBId } },
    });
    if (existing) return null;
    try {
      return await this.prisma.swipeMatch.create({ data: { userAId, userBId } });
    } catch {
      // Both liked each other at the same moment: the other request created it.
      return null;
    }
  }

  matchesOf(userId: string): Promise<MatchWithPeople[]> {
    return this.prisma.swipeMatch.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 200,
      include: {
        userA: { select: partnerSelect },
        userB: { select: partnerSelect },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { text: true, senderId: true, createdAt: true },
        },
      },
    });
  }

  findMatch(id: string): Promise<SwipeMatch | null> {
    return this.prisma.swipeMatch.findUnique({ where: { id } });
  }

  deleteMatch(id: string): Promise<SwipeMatch> {
    return this.prisma.swipeMatch.delete({ where: { id } });
  }

  /** Messages from `senderId` in a match after `since` (unread ones). */
  countMessagesFrom(matchId: string, senderId: string, since: Date | null): Promise<number> {
    return this.prisma.swipeMessage.count({
      where: { matchId, senderId, ...(since ? { createdAt: { gt: since } } : {}) },
    });
  }

  /** The last 100 messages, or those after `after`, oldest first. */
  async messages(matchId: string, after: Date | undefined) {
    if (after) {
      return this.prisma.swipeMessage.findMany({
        where: { matchId, createdAt: { gt: after } },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });
    }
    const last = await this.prisma.swipeMessage.findMany({
      where: { matchId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return last.toReversed();
  }

  lastMessages(matchId: string, take: number) {
    return this.prisma.swipeMessage
      .findMany({ where: { matchId }, orderBy: { createdAt: 'desc' }, take })
      .then((items) => items.toReversed());
  }

  async addMessage(match: SwipeMatch, senderId: string, text: string, now: Date) {
    const readField = match.userAId === senderId ? { readAAt: now } : { readBAt: now };
    const [message] = await this.prisma.$transaction([
      this.prisma.swipeMessage.create({
        data: { matchId: match.id, senderId, text, createdAt: now },
      }),
      this.prisma.swipeMatch.update({
        where: { id: match.id },
        data: { lastMessageAt: now, ...readField },
      }),
    ]);
    return message;
  }

  /** Messages each person has sent in a match. */
  async messageCounts(matchId: string): Promise<Map<string, number>> {
    const rows = await this.prisma.swipeMessage.groupBy({
      by: ['senderId'],
      where: { matchId },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.senderId, row._count._all]));
  }

  /** Matches whose last message is between `from` and `to` old, with that message's sender. */
  recentlyActiveMatches(from: Date, to: Date) {
    return this.prisma.swipeMatch.findMany({
      where: { lastMessageAt: { gte: from, lte: to } },
      take: 500,
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { senderId: true } },
      },
    });
  }

  markNotified(match: SwipeMatch, userId: string, now: Date): Promise<SwipeMatch> {
    return this.prisma.swipeMatch.update({
      where: { id: match.id },
      data: match.userAId === userId ? { notifiedAAt: now } : { notifiedBAt: now },
    });
  }

  markRead(match: SwipeMatch, userId: string, now: Date): Promise<SwipeMatch> {
    return this.prisma.swipeMatch.update({
      where: { id: match.id },
      data: match.userAId === userId ? { readAAt: now } : { readBAt: now },
    });
  }

  /** A block, which also ends any match between them. */
  async block(blockerId: string, blockedId: string): Promise<void> {
    const [userAId, userBId] =
      blockerId < blockedId ? [blockerId, blockedId] : [blockedId, blockerId];
    await this.prisma.$transaction([
      this.prisma.swipeBlock.upsert({
        where: { blockerId_blockedId: { blockerId, blockedId } },
        create: { blockerId, blockedId },
        update: {},
      }),
      this.prisma.swipeMatch.deleteMany({ where: { userAId, userBId } }),
    ]);
  }

  /** The first live photo of each person, for the matches list. */
  async firstLivePhotos(ownerIds: string[]): Promise<Map<string, string>> {
    if (ownerIds.length === 0) return new Map();
    const photos = await this.prisma.swipePhoto.findMany({
      where: { ownerId: { in: ownerIds }, status: 'LIVE' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, ownerId: true },
    });
    const first = new Map<string, string>();
    for (const photo of photos) if (!first.has(photo.ownerId)) first.set(photo.ownerId, photo.id);
    return first;
  }

  // ---- Reports, removal requests, blocked images --------------------------------------------------

  countReportsSince(reporterId: string, since: Date): Promise<number> {
    return this.prisma.swipeReport.count({ where: { reporterId, createdAt: { gte: since } } });
  }

  createReport(data: Prisma.SwipeReportUncheckedCreateInput) {
    return this.prisma.swipeReport.create({ data });
  }

  findReport(id: string) {
    return this.prisma.swipeReport.findUnique({ where: { id }, include: { photo: true } });
  }

  reports(status: SwipeReportStatus) {
    return this.prisma.swipeReport.findMany({
      where: { status },
      orderBy: { createdAt: status === 'OPEN' ? 'asc' : 'desc' },
      take: 200,
      include: {
        reporter: { select: { ...personSelect, swipeProfile: { select: { nickname: true } } } },
        reported: { select: { ...personSelect, swipeProfile: true } },
        reviewedBy: { select: { id: true, name: true } },
        photo: { select: { id: true, ref: true, status: true } },
      },
    });
  }

  /** Reports against each person, by status. */
  async reportCounts(reportedIds: string[]): Promise<Map<string, number>> {
    if (reportedIds.length === 0) return new Map();
    const rows = await this.prisma.swipeReport.groupBy({
      by: ['reportedId'],
      where: { reportedId: { in: reportedIds } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.reportedId, row._count._all]));
  }

  closeReport(id: string, status: SwipeReportStatus, reviewedById: string, now: Date) {
    return this.prisma.swipeReport.update({
      where: { id },
      data: { status, reviewedById, reviewedAt: now },
    });
  }

  countOpenReportsOn(photoId: string, exceptId?: string): Promise<number> {
    return this.prisma.swipeReport.count({
      where: { photoId, status: 'OPEN', ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
  }

  countOpenTakedownsOn(photoId: string, exceptId?: string): Promise<number> {
    return this.prisma.swipeTakedown.count({
      where: { photoId, status: 'OPEN', ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
  }

  createTakedown(data: Prisma.SwipeTakedownUncheckedCreateInput) {
    return this.prisma.swipeTakedown.create({ data });
  }

  findTakedown(id: string) {
    return this.prisma.swipeTakedown.findUnique({ where: { id }, include: { photo: true } });
  }

  takedowns(status: SwipeTakedownStatus) {
    return this.prisma.swipeTakedown.findMany({
      where: { status },
      orderBy: { createdAt: status === 'OPEN' ? 'asc' : 'desc' },
      take: 200,
      include: {
        photo: {
          select: {
            id: true,
            ref: true,
            status: true,
            owner: { select: { ...personSelect, swipeProfile: { select: { nickname: true } } } },
          },
        },
        reviewedBy: { select: { id: true, name: true } },
      },
    });
  }

  closeTakedown(
    id: string,
    status: SwipeTakedownStatus,
    response: string | null,
    reviewedById: string,
    now: Date,
  ) {
    return this.prisma.swipeTakedown.update({
      where: { id },
      data: { status, response, reviewedById, reviewedAt: now },
    });
  }

  async blockedHashes(): Promise<string[]> {
    const rows = await this.prisma.swipeBlockedHash.findMany({ select: { hash: true } });
    return rows.map((row) => row.hash);
  }

  async blockHash(hash: string, reason: SwipeReportReason): Promise<void> {
    await this.prisma.swipeBlockedHash.upsert({
      where: { hash },
      create: { hash, reason },
      update: {},
    });
  }

  // ---- Admin -------------------------------------------------------------------------------------

  pendingVerifications() {
    return this.prisma.swipeProfile.findMany({
      where: { verificationStatus: 'PENDING' },
      orderBy: { verificationSentAt: 'asc' },
      take: 200,
      include: { user: { select: { ...personSelect, createdAt: true } } },
    });
  }

  suspendedProfiles(now: Date) {
    return this.prisma.swipeProfile.findMany({
      where: {
        suspendedAt: { not: null },
        OR: [{ suspendedUntil: null }, { suspendedUntil: { gt: now } }],
      },
      orderBy: { suspendedAt: 'desc' },
      take: 200,
      include: { user: { select: personSelect } },
    });
  }

  // ---- Watermarks and notifications --------------------------------------------------------------

  /** Photos still stored without the burnt-in watermark (rejected ones have no file). */
  photosToWatermark(take: number) {
    return this.prisma.swipePhoto.findMany({
      where: { watermarked: false, status: { not: 'REJECTED' } },
      take,
      include: { owner: { select: { swipeProfile: { select: { nickname: true } } } } },
    });
  }

  /** When the newest thing waiting for the team arrived (null: nothing waiting). */
  async newestPendingAt(): Promise<Date | null> {
    const [verification, photo, report, takedown] = await Promise.all([
      this.prisma.swipeProfile.findFirst({
        where: { verificationStatus: 'PENDING' },
        orderBy: { verificationSentAt: 'desc' },
        select: { verificationSentAt: true },
      }),
      this.prisma.swipePhoto.findFirst({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.swipeReport.findFirst({
        where: { status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.swipeTakedown.findFirst({
        where: { status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);
    const times = [
      verification?.verificationSentAt,
      photo?.createdAt,
      report?.createdAt,
      takedown?.createdAt,
    ].filter((time): time is Date => !!time);
    return times.length ? new Date(Math.max(...times.map((time) => time.getTime()))) : null;
  }

  async savePushSubscription(
    userId: string,
    data: { endpoint: string; p256dh: string; auth: string; locale: string },
  ): Promise<void> {
    await this.prisma.swipePushSubscription.upsert({
      where: { endpoint: data.endpoint },
      create: { userId, ...data },
      update: { userId, p256dh: data.p256dh, auth: data.auth, locale: data.locale },
    });
    // At most 10 browsers per account: the oldest go.
    const extra = await this.prisma.swipePushSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      select: { id: true },
    });
    if (extra.length > 0) {
      await this.prisma.swipePushSubscription.deleteMany({
        where: { id: { in: extra.map((row) => row.id) } },
      });
    }
  }

  async deletePushSubscription(endpoint: string, userId?: string): Promise<void> {
    await this.prisma.swipePushSubscription.deleteMany({
      where: userId ? { endpoint, userId } : { endpoint },
    });
  }

  pushSubscriptionsOf(userId: string) {
    return this.prisma.swipePushSubscription.findMany({ where: { userId } });
  }

  async overview(now: Date) {
    const [
      members,
      uploaders,
      pendingVerifications,
      pendingPhotos,
      livePhotos,
      openReports,
      openTakedowns,
      matches,
    ] = await Promise.all([
      this.prisma.swipeProfile.count(),
      this.prisma.swipeProfile.count({ where: { verificationStatus: 'APPROVED' } }),
      this.prisma.swipeProfile.count({ where: { verificationStatus: 'PENDING' } }),
      this.prisma.swipePhoto.count({ where: { status: 'PENDING' } }),
      this.prisma.swipePhoto.count({ where: { status: 'LIVE' } }),
      this.prisma.swipeReport.count({ where: { status: 'OPEN' } }),
      this.prisma.swipeTakedown.count({ where: { status: 'OPEN' } }),
      this.prisma.swipeMatch.count(),
    ]);
    const suspended = await this.prisma.swipeProfile.count({
      where: {
        suspendedAt: { not: null },
        OR: [{ suspendedUntil: null }, { suspendedUntil: { gt: now } }],
      },
    });
    return {
      members,
      uploaders,
      pendingVerifications,
      pendingPhotos,
      livePhotos,
      openReports,
      openTakedowns,
      matches,
      suspended,
    };
  }
}
