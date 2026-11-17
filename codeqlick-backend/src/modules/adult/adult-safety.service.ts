import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { toAccountLocale } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type {
  AdultApp,
  AdultSuspension,
  AdultSuspensionCategory,
} from '../../generated/prisma/client.js';
import { ActivityService, type ActivityActor } from '../activity/activity.service.js';
import { CruisingRepository } from '../cruising/cruising.repository.js';
import { MailService, type MailMessage } from '../mail/mail.service.js';
import { SwipeRepository } from '../swipe/swipe.repository.js';
import { VideochatRepository } from '../videochat/videochat.repository.js';
import { suspensionEnd, type SuspensionDuration } from '../videochat/videochat.schemas.js';
import type { AdultAppStore, Db } from './adult-app-store.js';
import { adultNoticeEmail } from './adult-emails.js';
import { AdultEvents } from './adult-events.js';
import { AdultRepository } from './adult.repository.js';
import {
  ADULT_APPS,
  banExpiry,
  blockRef,
  emailHash,
  endsLater,
  isActiveSuspension,
  isSeriousCategory,
} from './adult.rules.js';
import { AdultVerificationService } from './adult-verification.service.js';

/** What a refused entry says (decision 120): neutral, nothing about why. */
export const BANNED_ENTRY_MESSAGE =
  "This account can't use Codeqlick's 18+ apps; contact hello@codeqlick.com";

const HOUR_MS = 60 * 60 * 1000;
/** Automatic actions in the activity log. */
const SYSTEM: ActivityActor = { id: null, name: 'Codeqlick' };

export interface AdultBlockView {
  ref: string;
  /** The person's name in the asking app; null: no name there ("A member of another 18+ app"). */
  name: string | null;
  sourceApp: AdultApp | null;
  createdAt: string;
}

export interface SharedSuspensionInput {
  category: AdultSuspensionCategory;
  sourceApp: AdultApp;
  reason: string;
  duration: SuspensionDuration;
  reportId?: string | null;
}

/** A shared suspension as an app's status shows it to the person. */
export interface SharedSuspensionState {
  reason: string;
  until: Date | null;
  createdAt: Date;
}

/**
 * Shared safety of the three 18+ apps (architecture 4.16, phase 1): blocks written into the three
 * block tables (decision 112), MINOR, NON_CONSENSUAL and ILLEGAL suspensions applied in the three
 * with the same end (114), and no coming back with a new account (120). The apps' tables are
 * reached through their repositories, in one transaction.
 */
@Injectable()
export class AdultSafetyService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AdultSafetyService.name);
  private timer: NodeJS.Timeout | undefined;
  readonly stores: Record<AdultApp, AdultAppStore>;

  constructor(
    private readonly repository: AdultRepository,
    private readonly verification: AdultVerificationService,
    private readonly events: AdultEvents,
    private readonly activity: ActivityService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
    cruising: CruisingRepository,
    swipe: SwipeRepository,
    videochat: VideochatRepository,
  ) {
    this.stores = { CRUISING: cruising, SWIPE: swipe, VIDEOCHAT: videochat };
  }

  onApplicationBootstrap(): void {
    if (this.config.isTest) return;
    this.timer = setInterval(() => void this.cleanup(), HOUR_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  /** The hourly cleanup: banned email hashes past their end go. Never throws. */
  async cleanup(now = new Date()): Promise<number> {
    try {
      return await this.repository.deleteExpiredBans(now);
    } catch (error) {
      this.logger.error(`18+ apps cleanup failed: ${String(error)}`);
      return 0;
    }
  }

  // ---- Blocks (decision 112) ---------------------------------------------------------------------

  /**
   * Blocks `blockedId` for `blockerId` in the three apps at once, with each app's side effects, in
   * one transaction; then the video chat ends anything live between them.
   */
  async block(blockerId: string, blockedId: string, sourceApp: AdultApp): Promise<void> {
    if (blockerId === blockedId) throw new BadRequestException('You cannot block yourself');
    await this.repository.transaction(async (db) => {
      for (const app of ADULT_APPS) {
        await this.stores[app].applyBlock(db, blockerId, blockedId, sourceApp);
      }
    });
    this.events.blocked.next({ a: blockerId, b: blockedId, sourceApp });
  }

  /** Lifts my block of a person in the three apps (one transaction); false when there was none. */
  async unblock(blockerId: string, blockedId: string): Promise<boolean> {
    return this.repository.transaction(async (db) => {
      let lifted = false;
      for (const app of ADULT_APPS) {
        lifted = (await this.stores[app].removeBlock(db, blockerId, blockedId)) || lifted;
      }
      return lifted;
    });
  }

  /** The people I blocked, by the person; the earliest row and its app. */
  private async blocksMade(userId: string) {
    const byPerson = new Map<string, { sourceApp: AdultApp | null; createdAt: Date }>();
    for (const app of ADULT_APPS) {
      for (const row of await this.stores[app].blocksMadeBy(userId)) {
        const seen = byPerson.get(row.blockedId);
        if (!seen || row.createdAt < seen.createdAt) {
          byPerson.set(row.blockedId, {
            sourceApp: row.sourceApp ?? seen?.sourceApp ?? null,
            createdAt: row.createdAt,
          });
        } else if (!seen.sourceApp && row.sourceApp) {
          seen.sourceApp = row.sourceApp;
        }
      }
    }
    return byPerson;
  }

  /** My blocks in the three apps, newest first, each person named in the asking app. */
  async blocks(userId: string, app: AdultApp): Promise<{ items: AdultBlockView[] }> {
    const byPerson = await this.blocksMade(userId);
    const names = await this.stores[app].namesOf([...byPerson.keys()]);
    return {
      items: [...byPerson.entries()]
        .sort(([, a], [, b]) => b.createdAt.getTime() - a.createdAt.getTime())
        .map(([blockedId, row]) => ({
          ref: blockRef(userId, blockedId),
          name: names.get(blockedId) ?? null,
          sourceApp: row.sourceApp,
          createdAt: row.createdAt.toISOString(),
        })),
    };
  }

  /** Lifts one of my blocks by its reference, in the three apps. */
  async unblockRef(userId: string, ref: string): Promise<void> {
    const byPerson = await this.blocksMade(userId);
    const blockedId = [...byPerson.keys()].find((id) => blockRef(userId, id) === ref);
    if (!blockedId || !(await this.unblock(userId, blockedId))) {
      throw new NotFoundException('No such block');
    }
  }

  // ---- Shared suspensions (decision 114) ---------------------------------------------------------

  /** The shared suspension in force for the account, if any. */
  async activeSuspension(userId: string, now = new Date()): Promise<AdultSuspension | null> {
    const suspension = await this.repository.activeSuspension(userId, now);
    return isActiveSuspension(suspension, now) ? suspension : null;
  }

  /** What an app's status shows of a shared suspension. */
  async sharedState(userId: string, now = new Date()): Promise<SharedSuspensionState | null> {
    const suspension = await this.activeSuspension(userId, now);
    return suspension
      ? { reason: suspension.reason, until: suspension.until, createdAt: suspension.createdAt }
      : null;
  }

  /**
   * Writes a shared suspension into an app's profile, unless the profile is under a per-app one
   * that ends later. Inside the caller's transaction.
   */
  private async mirror(
    db: Db,
    app: AdultApp,
    suspension: AdultSuspension,
    now: Date,
  ): Promise<void> {
    const store = this.stores[app];
    const state = await store.suspensionState(db, suspension.userId);
    if (!state) return;
    const current =
      state.suspendedAt && (!state.suspendedUntil || state.suspendedUntil > now)
        ? state.suspendedUntil
        : undefined;
    if (current !== undefined && !endsLater(suspension.until, current)) return;
    await store.setSuspension(db, suspension.userId, {
      at: suspension.createdAt,
      until: suspension.until,
      reason: suspension.reason,
      category: suspension.category,
      byId: suspension.byId,
      reportId: suspension.sourceApp === app ? suspension.reportId : null,
    });
  }

  /**
   * A MINOR, NON_CONSENSUAL or ILLEGAL suspension by the team, in the three apps with the same end:
   * it replaces an active shared one, ends what the person is doing live, withdraws their
   * verification and emails them without naming an app.
   */
  async suspend(
    actor: AuthUser,
    userId: string,
    input: SharedSuspensionInput,
    now = new Date(),
  ): Promise<void> {
    if (!isSeriousCategory(input.category)) {
      throw new BadRequestException('Only MINOR, NON_CONSENSUAL and ILLEGAL are shared');
    }
    const user = await this.repository.findUser(userId);
    if (!user) throw new NotFoundException('Account not found');
    const until = suspensionEnd(input.duration, now);
    await this.repository.transaction(async (db) => {
      const replaced = await this.repository.liftSuspensions(db, userId, now, {
        liftedById: actor.id,
        liftReason: 'Replaced by a new suspension',
      });
      for (const old of replaced) {
        for (const app of ADULT_APPS) {
          await this.stores[app].clearSuspensionAt(db, userId, old.createdAt, actor.id, 'Replaced');
        }
      }
      const suspension = await this.repository.createSuspension(db, {
        userId,
        category: input.category,
        sourceApp: input.sourceApp,
        reportId: input.reportId ?? null,
        reason: input.reason,
        until,
        byId: actor.id,
        createdAt: now,
      });
      for (const app of ADULT_APPS) await this.mirror(db, app, suspension, now);
    });
    this.events.suspended.next(userId);
    await this.verification.withdrawSilently(actor, userId, 'Suspended in the 18+ apps', now);
    await this.activity.record(actor, {
      action: 'adult.suspension',
      targetId: userId,
      targetLabel: user.email,
      details: {
        category: input.category,
        sourceApp: input.sourceApp,
        duration: input.duration,
        reason: input.reason,
        reportId: input.reportId ?? null,
      },
    });
    this.send(
      adultNoticeEmail(
        user.email,
        toAccountLocale(user.locale),
        'suspended',
        input.reason,
        this.config.siteUrl,
        until,
      ),
    );
  }

  /** Lifts the active shared suspension in the three apps (with a reason, logged). */
  async lift(actor: AuthUser, userId: string, reason: string, now = new Date()): Promise<void> {
    const lifted = await this.repository.transaction(async (db) => {
      const active = await this.repository.liftSuspensions(db, userId, now, {
        liftedById: actor.id,
        liftReason: reason,
      });
      for (const suspension of active) {
        for (const app of ADULT_APPS) {
          await this.stores[app].clearSuspensionAt(
            db,
            userId,
            suspension.createdAt,
            actor.id,
            reason,
          );
        }
      }
      return active;
    });
    if (lifted.length === 0) throw new NotFoundException('No shared suspension in force');
    const user = await this.repository.findUser(userId);
    await this.activity.record(actor, {
      action: 'adult.suspension_lifted',
      targetId: userId,
      targetLabel: user?.email ?? userId,
      details: { reason },
    });
  }

  /**
   * After an app's own suspension of the person is lifted (or the person enters an app), the
   * shared one still in force is written back into the profiles that don't show it.
   */
  async reapply(userId: string, now = new Date(), apps: readonly AdultApp[] = ADULT_APPS) {
    const suspension = await this.activeSuspension(userId, now);
    if (!suspension) return;
    await this.repository.transaction(async (db) => {
      for (const app of apps) await this.mirror(db, app, suspension, now);
    });
  }

  /**
   * Whether lifting an app's suspension of the person lifts the shared one: true when the profile's
   * suspension is the shared one (same start); the caller then lifts it in the three.
   */
  async isSharedInProfile(userId: string, suspendedAt: Date | null, now = new Date()) {
    const suspension = await this.activeSuspension(userId, now);
    return (
      !!suspension && !!suspendedAt && suspension.createdAt.getTime() === suspendedAt.getTime()
    );
  }

  // ---- Entry and deleted accounts (decision 120) -------------------------------------------------

  /** Refuses entering an adult app with an email kept after a serious suspension. */
  async checkEntry(email: string, now = new Date()): Promise<void> {
    if (await this.repository.isBannedHash(emailHash(this.config.adultBanHashKey, email), now)) {
      throw new ForbiddenException(BANNED_ENTRY_MESSAGE);
    }
  }

  /**
   * Before an account is deleted: with a shared suspension in force, only a keyed hash of its email
   * stays, for the suspension's length (2 years when permanent). The verification photo goes.
   */
  async beforeAccountDeletion(userId: string, email: string, now = new Date()): Promise<void> {
    const suspension = await this.activeSuspension(userId, now);
    if (suspension) {
      await this.repository.createBannedEmail({
        emailHash: emailHash(this.config.adultBanHashKey, email),
        category: suspension.category,
        expiresAt: banExpiry(suspension.until, now),
      });
    }
    await this.verification.forgetPhoto(userId);
  }

  /** The team deletes a hash on an accepted appeal by email (logged, never the address). */
  async deleteBannedEmail(actor: AuthUser, email: string): Promise<void> {
    const count = await this.repository.deleteBannedHash(
      emailHash(this.config.adultBanHashKey, email),
    );
    if (count === 0) throw new NotFoundException('No banned email matches');
    await this.activity.record(actor, {
      action: 'adult.banned_email_deleted',
      targetLabel: 'Banned email',
    });
  }

  // ---- Per-app suspensions to review (phase 1's migration) ---------------------------------------

  async reviews(now = new Date()) {
    const rows = await this.repository.pendingReviews();
    const items = [];
    for (const row of rows) {
      const entry = await this.stores[row.app].entryOf(row.userId);
      // Lifted or over since it was listed: nothing left to share.
      const active =
        !!entry?.suspendedAt &&
        entry.suspendedAt.getTime() === row.suspendedAt.getTime() &&
        (!entry.suspendedUntil || entry.suspendedUntil > now);
      if (!active) continue;
      items.push({
        app: row.app,
        userId: row.userId,
        name: row.user.name,
        email: row.user.email,
        appName: entry.name,
        reportReason: row.category,
        reason: (await this.stores[row.app].overviewOf(row.userId)).suspension?.reason ?? null,
        suspendedAt: row.suspendedAt.toISOString(),
        until: entry.suspendedUntil?.toISOString() ?? null,
      });
    }
    return { items };
  }

  /** Shares a listed per-app suspension in the three apps, with the same end. */
  async shareReviewed(actor: AuthUser, app: AdultApp, userId: string, now = new Date()) {
    const review = await this.repository.findPendingReview(app, userId);
    const entry = await this.stores[app].entryOf(userId);
    if (!review || !entry?.suspendedAt) throw new NotFoundException('Nothing to review');
    const until = entry.suspendedUntil;
    if (until && until <= now) throw new NotFoundException('That suspension is over');
    const overview = await this.stores[app].overviewOf(userId);
    await this.suspendUntil(actor, userId, {
      category: review.category,
      sourceApp: app,
      reason: overview.suspension?.reason ?? `Report: ${review.category}`,
      reportId: review.reportId,
      until,
      now,
    });
    await this.repository.closeReview(app, userId, 'SHARED', actor.id, now);
  }

  /** Leaves a listed per-app suspension as it is. */
  async keepReviewed(actor: AuthUser, app: AdultApp, userId: string, now = new Date()) {
    const review = await this.repository.findPendingReview(app, userId);
    if (!review) throw new NotFoundException('Nothing to review');
    await this.repository.closeReview(app, userId, 'KEPT', actor.id, now);
    await this.activity.record(actor, {
      action: 'adult.suspension_kept',
      targetId: userId,
      details: { app, category: review.category },
    });
  }

  /** A shared suspension with a given end (the reviewed per-app one's), like `suspend`. */
  private async suspendUntil(
    actor: AuthUser,
    userId: string,
    input: {
      category: AdultSuspensionCategory;
      sourceApp: AdultApp;
      reason: string;
      reportId: string | null;
      until: Date | null;
      now: Date;
    },
  ): Promise<void> {
    const user = await this.repository.findUser(userId);
    if (!user) throw new NotFoundException('Account not found');
    const { now } = input;
    await this.repository.transaction(async (db) => {
      const suspension = await this.repository.createSuspension(db, {
        userId,
        category: input.category,
        sourceApp: input.sourceApp,
        reportId: input.reportId,
        reason: input.reason,
        until: input.until,
        byId: actor.id,
        createdAt: now,
      });
      for (const app of ADULT_APPS) await this.mirror(db, app, suspension, now);
    });
    this.events.suspended.next(userId);
    await this.verification.withdrawSilently(actor, userId, 'Suspended in the 18+ apps', now);
    await this.activity.record(actor, {
      action: 'adult.suspension',
      targetId: userId,
      targetLabel: user.email,
      details: {
        category: input.category,
        sourceApp: input.sourceApp,
        until: input.until?.toISOString() ?? null,
        reason: input.reason,
        reviewed: true,
      },
    });
    this.send(
      adultNoticeEmail(
        user.email,
        toAccountLocale(user.locale),
        'suspended',
        input.reason,
        this.config.siteUrl,
        input.until,
      ),
    );
  }

  /** For the activity log of automatic actions. */
  get system(): ActivityActor {
    return SYSTEM;
  }

  private send(message: MailMessage): void {
    this.mail
      .send(message)
      .catch((error: unknown) => this.logger.error(`18+ apps email not sent: ${String(error)}`));
  }
}
