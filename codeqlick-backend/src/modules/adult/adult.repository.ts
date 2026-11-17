import { Injectable } from '@nestjs/common';
import type {
  AdultApp,
  AdultSuspension,
  AdultSuspensionCategory,
  AdultVerification,
  Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Db } from './adult-app-store.js';

const personSelect = { id: true, name: true, email: true } as const;

/** Active at `now`: not lifted, and permanent or not over yet. */
function activeWhere(now: Date): Prisma.AdultSuspensionWhereInput {
  return { liftedAt: null, OR: [{ until: null }, { until: { gt: now } }] };
}

/**
 * The shared safety's own tables (architecture 4.16): the account's verification, the shared
 * suspensions, the banned email hashes and the suspensions listed for review. The apps' tables are
 * reached through their repositories (`AdultAppStore`), inside `transaction`.
 */
@Injectable()
export class AdultRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Runs `work` in one transaction; the app repositories take the `db` it is given. */
  transaction<T>(work: (db: Db) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work, { timeout: 15_000 });
  }

  // ---- Accounts ----------------------------------------------------------------------------------

  findUser(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, locale: true, username: true },
    });
  }

  /** The account's adult names: its username and its Cruising nickname. */
  async namesOf(userId: string): Promise<{ username: string | null; cruising: string | null }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, cruisingProfile: { select: { nickname: true } } },
    });
    return { username: user?.username ?? null, cruising: user?.cruisingProfile?.nickname ?? null };
  }

  // ---- Verification ------------------------------------------------------------------------------

  findVerification(userId: string): Promise<AdultVerification | null> {
    return this.prisma.adultVerification.findUnique({ where: { userId } });
  }

  saveVerification(
    userId: string,
    data: Omit<Prisma.AdultVerificationUncheckedCreateInput, 'userId'>,
  ): Promise<AdultVerification> {
    return this.prisma.adultVerification.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  /** Updates the verification only while it is in `status` (a decision races nothing). */
  async updateVerificationIf(
    userId: string,
    status: AdultVerification['status'],
    data: Prisma.AdultVerificationUncheckedUpdateInput,
  ): Promise<boolean> {
    const { count } = await this.prisma.adultVerification.updateMany({
      where: { userId, status },
      data,
    });
    return count > 0;
  }

  /** The approved accounts among `userIds` (the "Verified" badge in the three apps). */
  async verifiedAmong(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await this.prisma.adultVerification.findMany({
      where: { userId: { in: userIds }, status: 'APPROVED' },
      select: { userId: true },
    });
    return new Set(rows.map((row) => row.userId));
  }

  /** The one queue: photos waiting, oldest first, with the account's names. */
  pendingVerifications() {
    return this.prisma.adultVerification.findMany({
      where: { status: 'PENDING' },
      orderBy: { sentAt: 'asc' },
      take: 200,
      include: {
        user: {
          select: {
            ...personSelect,
            username: true,
            createdAt: true,
            cruisingProfile: { select: { nickname: true } },
          },
        },
      },
    });
  }

  countPendingVerifications(): Promise<number> {
    return this.prisma.adultVerification.count({ where: { status: 'PENDING' } });
  }

  async newestVerificationAt(): Promise<Date | null> {
    const row = await this.prisma.adultVerification.findFirst({
      where: { status: 'PENDING' },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true },
    });
    return row?.sentAt ?? null;
  }

  /** Every verification photo still pointed to (the orphan cleanup keeps them). */
  async photoKeys(): Promise<Set<string>> {
    const rows = await this.prisma.adultVerification.findMany({
      where: { photoKey: { not: null } },
      select: { photoKey: true },
    });
    return new Set(rows.map((row) => row.photoKey as string));
  }

  /** The team's past decisions and withdrawals of an account's verification (activity log). */
  verificationHistory(userId: string) {
    return this.prisma.activityLog.findMany({
      where: {
        targetType: 'adult',
        targetId: userId,
        action: { in: ['adult.verification_decided', 'adult.verification_withdrawn'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { action: true, actorName: true, details: true, createdAt: true },
    });
  }

  // ---- Shared suspensions ------------------------------------------------------------------------

  activeSuspension(userId: string, now: Date): Promise<AdultSuspension | null> {
    return this.prisma.adultSuspension.findFirst({
      where: { userId, ...activeWhere(now) },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Active shared suspensions among `userIds`. */
  async suspendedAmong(userIds: string[], now: Date): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await this.prisma.adultSuspension.findMany({
      where: { userId: { in: userIds }, ...activeWhere(now) },
      select: { userId: true },
    });
    return new Set(rows.map((row) => row.userId));
  }

  createSuspension(db: Db, data: Prisma.AdultSuspensionUncheckedCreateInput) {
    return db.adultSuspension.create({ data });
  }

  /** Ends every active shared suspension of the account (one is active at a time). */
  async liftSuspensions(
    db: Db,
    userId: string,
    now: Date,
    data: { liftedById: string | null; liftReason: string },
  ): Promise<AdultSuspension[]> {
    const active = await db.adultSuspension.findMany({ where: { userId, ...activeWhere(now) } });
    if (active.length > 0) {
      await db.adultSuspension.updateMany({
        where: { id: { in: active.map((row) => row.id) } },
        data: { liftedAt: now, ...data },
      });
    }
    return active;
  }

  suspensionsOf(userId: string) {
    return this.prisma.adultSuspension.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        by: { select: { id: true, name: true } },
        liftedBy: { select: { id: true, name: true } },
      },
    });
  }

  // ---- Banned emails (decision 120) --------------------------------------------------------------

  createBannedEmail(data: {
    emailHash: string;
    category: AdultSuspensionCategory;
    expiresAt: Date;
  }) {
    return this.prisma.adultBannedEmail.create({ data });
  }

  async isBannedHash(emailHash: string, now: Date): Promise<boolean> {
    const row = await this.prisma.adultBannedEmail.findFirst({
      where: { emailHash, expiresAt: { gt: now } },
      select: { id: true },
    });
    return !!row;
  }

  async deleteBannedHash(emailHash: string): Promise<number> {
    const { count } = await this.prisma.adultBannedEmail.deleteMany({ where: { emailHash } });
    return count;
  }

  async deleteExpiredBans(now: Date): Promise<number> {
    const { count } = await this.prisma.adultBannedEmail.deleteMany({
      where: { expiresAt: { lte: now } },
    });
    return count;
  }

  // ---- Per-app suspensions to review (phase 1's migration) ---------------------------------------

  pendingReviews() {
    return this.prisma.adultSuspensionReview.findMany({
      where: { status: 'PENDING' },
      orderBy: { suspendedAt: 'asc' },
      include: { user: { select: personSelect } },
    });
  }

  findPendingReview(app: AdultApp, userId: string) {
    return this.prisma.adultSuspensionReview.findFirst({
      where: { app, userId, status: 'PENDING' },
      orderBy: { suspendedAt: 'desc' },
    });
  }

  async closeReview(
    app: AdultApp,
    userId: string,
    status: 'SHARED' | 'KEPT',
    decidedById: string,
    now: Date,
  ): Promise<void> {
    await this.prisma.adultSuspensionReview.updateMany({
      where: { app, userId, status: 'PENDING' },
      data: { status, decidedById, decidedAt: now },
    });
  }

  // ---- Export ------------------------------------------------------------------------------------

  async exportOf(userId: string) {
    const [verification, suspensions] = await Promise.all([
      this.prisma.adultVerification.findUnique({
        where: { userId },
        select: {
          status: true,
          sourceApp: true,
          sentAt: true,
          decidedAt: true,
          withdrawnAt: true,
          createdAt: true,
        },
      }),
      this.prisma.adultSuspension.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
          category: true,
          sourceApp: true,
          reason: true,
          until: true,
          createdAt: true,
          liftedAt: true,
        },
      }),
    ]);
    return { verification, suspensions };
  }

  // ---- Phase 1's one-off task --------------------------------------------------------------------

  /** Verifications whose photo is still in an app's own folder (moved by the one-off task). */
  verificationsWithoutPhoto() {
    return this.prisma.adultVerification.findMany({
      where: { status: { in: ['PENDING', 'APPROVED'] }, photoKey: null, sourceApp: { not: null } },
      select: { userId: true, status: true, sourceApp: true },
    });
  }

  /** The per-app verification photos left (one column per app, dropped one release later). */
  async legacyVerificationKeys() {
    const [cruising, swipe, videochat] = await Promise.all([
      this.prisma.cruisingProfile.findMany({
        where: { verificationKey: { not: null } },
        select: { userId: true, verificationKey: true },
      }),
      this.prisma.swipeProfile.findMany({
        where: { verificationKey: { not: null } },
        select: { userId: true, verificationKey: true },
      }),
      this.prisma.videochatProfile.findMany({
        where: { verificationKey: { not: null } },
        select: { userId: true, verificationKey: true },
      }),
    ]);
    const keys = (rows: { userId: string; verificationKey: string | null }[]) =>
      new Map(rows.map((row) => [row.userId, row.verificationKey as string]));
    return { CRUISING: keys(cruising), SWIPE: keys(swipe), VIDEOCHAT: keys(videochat) };
  }

  /** Forgets an app's legacy verification photo of an account (its file is deleted after). */
  async clearLegacyVerificationKey(app: AdultApp, userId: string): Promise<void> {
    const data = { verificationKey: null };
    if (app === 'CRUISING')
      await this.prisma.cruisingProfile.updateMany({ where: { userId }, data });
    if (app === 'SWIPE') await this.prisma.swipeProfile.updateMany({ where: { userId }, data });
    if (app === 'VIDEOCHAT') {
      await this.prisma.videochatProfile.updateMany({ where: { userId }, data });
    }
  }

  setPhotoKey(userId: string, photoKey: string) {
    return this.prisma.adultVerification.update({ where: { userId }, data: { photoKey } });
  }

  /**
   * Pairs blocked in any app (a < b) that still have something a block ends between them: a Swipe
   * match, a Cruising conversation or album grant, or a video chat like. Up to `take`.
   */
  async blockedPairsToClear(take: number): Promise<Array<{ a: string; b: string }>> {
    return this.prisma.$queryRaw<Array<{ a: string; b: string }>>`
      WITH pairs AS (
        SELECT DISTINCT LEAST(blocker_id, blocked_id) AS a, GREATEST(blocker_id, blocked_id) AS b
        FROM (
          SELECT blocker_id, blocked_id FROM cruising_blocks
          UNION ALL SELECT blocker_id, blocked_id FROM swipe_blocks
          UNION ALL SELECT blocker_id, blocked_id FROM videochat_blocks
        ) blocks
      )
      SELECT p.a::text AS a, p.b::text AS b FROM pairs p
      WHERE EXISTS (SELECT 1 FROM swipe_matches m WHERE m.user_a_id = p.a AND m.user_b_id = p.b)
         OR EXISTS (SELECT 1 FROM cruising_conversations c
                    WHERE c.user_a_id = p.a AND c.user_b_id = p.b)
         OR EXISTS (SELECT 1 FROM cruising_album_grants g
                    WHERE (g.owner_id = p.a AND g.grantee_id = p.b)
                       OR (g.owner_id = p.b AND g.grantee_id = p.a))
         OR EXISTS (SELECT 1 FROM videochat_likes l
                    WHERE (l.from_id = p.a AND l.to_id = p.b) OR (l.from_id = p.b AND l.to_id = p.a))
      LIMIT ${take}`;
  }
}
