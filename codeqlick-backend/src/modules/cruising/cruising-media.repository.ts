import { Injectable } from '@nestjs/common';
import type {
  CruisingMedia,
  CruisingMediaAlbum,
  CruisingMediaKind,
  CruisingMediaStatus,
  Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { isSuspended } from './cruising.rules.js';
import { ADMIN_LIST_LIMIT } from './cruising.schemas.js';

/** Items that hold a place against the limits (a FAILED one doesn't). */
const ACTIVE: CruisingMediaStatus[] = ['PROCESSING', 'LIVE', 'HIDDEN'];

const ownerSelect = {
  id: true,
  name: true,
  email: true,
  cruisingProfile: {
    select: {
      nickname: true,
      suspendedAt: true,
      suspendedUntil: true,
    },
  },
  // The account's verification gives the badge in the three 18+ apps (architecture 4.16).
  adultVerification: { select: { status: true } },
} as const;

/** What a list shows next to a member's nickname: the badge and the cover photo (decision 87). */
export interface MemberBadge {
  verified: boolean;
  /** The member's cover photo; null when they have none or are suspended. */
  coverId: string | null;
}

export type AdminMediaQueue = 'new' | 'hidden' | 'all';

/** Cruising's photos, videos, verification photos and blocked hashes (architecture 4.15, phase 4). */
@Injectable()
export class CruisingMediaRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---- A member's media --------------------------------------------------------------------------

  /** The active items of one album (each album has its own limits, decision 99). */
  async countActive(
    ownerId: string,
    album: CruisingMediaAlbum = 'PUBLIC',
  ): Promise<{ photos: number; videos: number }> {
    const rows = await this.prisma.cruisingMedia.groupBy({
      by: ['kind'],
      where: { ownerId, album, status: { in: ACTIVE } },
      _count: { _all: true },
    });
    const count = (kind: CruisingMediaKind) =>
      rows.find((row) => row.kind === kind)?._count._all ?? 0;
    return { photos: count('PHOTO'), videos: count('VIDEO') };
  }

  /** The next position at the end of the member's list. */
  async nextPosition(ownerId: string): Promise<number> {
    const last = await this.prisma.cruisingMedia.aggregate({
      where: { ownerId },
      _max: { position: true },
    });
    return (last._max.position ?? -1) + 1;
  }

  createMedia(data: Prisma.CruisingMediaUncheckedCreateInput): Promise<CruisingMedia> {
    return this.prisma.cruisingMedia.create({ data });
  }

  findMedia(id: string) {
    return this.prisma.cruisingMedia.findUnique({
      where: { id },
      include: { owner: { select: ownerSelect } },
    });
  }

  findByRef(ref: string) {
    return this.prisma.cruisingMedia.findUnique({ where: { ref } });
  }

  async refTaken(ref: string): Promise<boolean> {
    return (await this.prisma.cruisingMedia.count({ where: { ref } })) > 0;
  }

  /** My media in my order. */
  mediaOf(ownerId: string): Promise<CruisingMedia[]> {
    return this.prisma.cruisingMedia.findMany({
      where: { ownerId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** A member's LIVE media in their order: the public ones, and the private album's when asked. */
  liveMediaOf(ownerId: string, withPrivate = false): Promise<CruisingMedia[]> {
    return this.prisma.cruisingMedia.findMany({
      where: { ownerId, status: 'LIVE', ...(withPrivate ? {} : { album: 'PUBLIC' }) },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  updateMedia(id: string, data: Prisma.CruisingMediaUncheckedUpdateInput): Promise<CruisingMedia> {
    return this.prisma.cruisingMedia.update({ where: { id }, data });
  }

  /** A transcoded video goes LIVE, only if it is still waiting (not deleted or failed meanwhile). */
  async finishVideo(id: string, data: Prisma.CruisingMediaUncheckedUpdateInput): Promise<boolean> {
    const { count } = await this.prisma.cruisingMedia.updateMany({
      where: { id, status: 'PROCESSING' },
      data: { ...data, status: 'LIVE' },
    });
    return count > 0;
  }

  async failVideo(id: string, failure: string): Promise<void> {
    await this.prisma.cruisingMedia.updateMany({
      where: { id, status: 'PROCESSING' },
      data: { status: 'FAILED', failure, storageKey: null, posterKey: null },
    });
  }

  /** Makes one photo the cover, and no other. */
  async setCover(ownerId: string, id: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.cruisingMedia.updateMany({
        where: { ownerId, cover: true, id: { not: id } },
        data: { cover: false },
      }),
      this.prisma.cruisingMedia.update({ where: { id }, data: { cover: true } }),
    ]);
  }

  /** Writes the member's order: each id's position is its index. */
  async setPositions(ownerId: string, ids: string[]): Promise<void> {
    await this.prisma.$transaction(
      ids.map((id, position) =>
        this.prisma.cruisingMedia.updateMany({ where: { id, ownerId }, data: { position } }),
      ),
    );
  }

  async deleteMedia(id: string): Promise<void> {
    await this.prisma.cruisingMedia.deleteMany({ where: { id } });
  }

  /** Videos waiting for the transcoder (after a restart). */
  async processingIds(): Promise<string[]> {
    const rows = await this.prisma.cruisingMedia.findMany({
      where: { status: 'PROCESSING' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /** Every file a row points to (media, posters, verification photos), for the orphan cleanup. */
  async storageKeys(): Promise<Set<string>> {
    const [media, profiles] = await Promise.all([
      this.prisma.cruisingMedia.findMany({
        where: { OR: [{ storageKey: { not: null } }, { posterKey: { not: null } }] },
        select: { storageKey: true, posterKey: true },
      }),
      this.prisma.cruisingProfile.findMany({
        where: { verificationKey: { not: null } },
        select: { verificationKey: true },
      }),
    ]);
    return new Set(
      [
        ...media.flatMap((row) => [row.storageKey, row.posterKey]),
        ...profiles.map((row) => row.verificationKey),
      ].filter((key): key is string => !!key),
    );
  }

  // ---- Badges and covers -------------------------------------------------------------------------

  /**
   * The badge and cover photo of each member: verified when their verification photo was approved;
   * the cover is the LIVE photo they chose, else their first LIVE photo, and none while suspended.
   */
  async badges(userIds: string[], now: Date = new Date()): Promise<Map<string, MemberBadge>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return new Map();
    const [profiles, photos] = await Promise.all([
      this.prisma.cruisingProfile.findMany({
        where: { userId: { in: ids } },
        select: {
          userId: true,
          suspendedAt: true,
          suspendedUntil: true,
          user: { select: { adultVerification: { select: { status: true } } } },
        },
      }),
      this.prisma.cruisingMedia.findMany({
        where: { ownerId: { in: ids }, kind: 'PHOTO', status: 'LIVE', album: 'PUBLIC' },
        orderBy: [{ cover: 'desc' }, { position: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, ownerId: true },
      }),
    ]);
    const covers = new Map<string, string>();
    for (const photo of photos) if (!covers.has(photo.ownerId)) covers.set(photo.ownerId, photo.id);
    return new Map(
      profiles.map((profile) => [
        profile.userId,
        {
          verified: profile.user.adultVerification?.status === 'APPROVED',
          coverId: isSuspended(profile, now) ? null : (covers.get(profile.userId) ?? null),
        },
      ]),
    );
  }

  // ---- Private album grants (phase 6, decision 99) -----------------------------------------------

  async isGranted(ownerId: string, granteeId: string): Promise<boolean> {
    return (await this.prisma.cruisingAlbumGrant.count({ where: { ownerId, granteeId } })) > 0;
  }

  /** Shares the owner's private album; true when it is new (not shared already). */
  async grant(ownerId: string, granteeId: string, now: Date): Promise<boolean> {
    const { count } = await this.prisma.cruisingAlbumGrant.createMany({
      data: [{ ownerId, granteeId, createdAt: now }],
      skipDuplicates: true,
    });
    return count > 0;
  }

  async revoke(ownerId: string, granteeId: string): Promise<void> {
    await this.prisma.cruisingAlbumGrant.deleteMany({ where: { ownerId, granteeId } });
  }

  /** The grants I gave and received, newest first, with the other person's profile. */
  grantsOf(userId: string) {
    const profile = {
      select: {
        cruisingProfile: {
          select: { nickname: true, suspendedAt: true, suspendedUntil: true },
        },
      },
    } as const;
    return Promise.all([
      this.prisma.cruisingAlbumGrant.findMany({
        where: { ownerId: userId },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: { granteeId: true, createdAt: true, grantee: profile },
      }),
      this.prisma.cruisingAlbumGrant.findMany({
        where: { granteeId: userId },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: { ownerId: true, createdAt: true, owner: profile },
      }),
    ]);
  }

  // ---- Blocked images ----------------------------------------------------------------------------

  async blockedHashes(): Promise<string[]> {
    const rows = await this.prisma.cruisingBlockedHash.findMany({ select: { hash: true } });
    return rows.map((row) => row.hash);
  }

  async blockHash(hash: string, reason: string): Promise<void> {
    await this.prisma.cruisingBlockedHash.upsert({
      where: { hash },
      create: { hash, reason },
      update: {},
    });
  }

  // ---- Moderation --------------------------------------------------------------------------------

  adminMedia(queue: AdminMediaQueue) {
    const where: Prisma.CruisingMediaWhereInput =
      queue === 'new'
        ? { reviewedAt: null, status: { in: ['LIVE', 'HIDDEN', 'PROCESSING'] } }
        : queue === 'hidden'
          ? { status: 'HIDDEN' }
          : {};
    return this.prisma.cruisingMedia.findMany({
      where,
      orderBy: { createdAt: queue === 'all' ? 'desc' : 'asc' },
      take: ADMIN_LIST_LIMIT,
      include: {
        owner: { select: ownerSelect },
        _count: { select: { reports: { where: { status: 'OPEN' } } } },
      },
    });
  }

  markReviewed(id: string, reviewedById: string, now: Date, status?: CruisingMediaStatus) {
    return this.prisma.cruisingMedia.update({
      where: { id },
      data: { reviewedById, reviewedAt: now, ...(status ? { status } : {}) },
    });
  }

  countOpenReportsOnMedia(mediaId: string, exceptId?: string): Promise<number> {
    return this.prisma.cruisingReport.count({
      where: { mediaId, status: 'OPEN', ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
  }

  countOpenTakedownsOnMedia(mediaId: string, exceptId?: string): Promise<number> {
    return this.prisma.cruisingTakedown.count({
      where: { mediaId, status: 'OPEN', ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
  }

  /** The open reports of a removed item are settled with it. */
  async closeOpenReportsOnMedia(mediaId: string, reviewedById: string, now: Date): Promise<void> {
    await this.prisma.cruisingReport.updateMany({
      where: { mediaId, status: 'OPEN' },
      data: { status: 'ACTIONED', reviewedById, reviewedAt: now },
    });
  }
}
