import {
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';
import type { AdultApp } from '../../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { adultDigestEmail } from './adult-emails.js';
import { AdultRepository } from './adult.repository.js';
import { ADULT_APPS, isActiveSuspension } from './adult.rules.js';
import { AdultSafetyService } from './adult-safety.service.js';

/** The team's digest: checked this often, sent at most once in DIGEST_MIN_GAP_MS. */
const DIGEST_EVERY_MS = 30 * 60 * 1000;
const DIGEST_MIN_GAP_MS = 60 * 60 * 1000;

const APP_LABELS: Record<AdultApp, string> = {
  CRUISING: 'Cruising',
  SWIPE: 'Swipe',
  VIDEOCHAT: 'Videochat',
};

/** "Also reported in": the other apps where the person was reported, and how many are open. */
export interface AlsoReported {
  apps: AdultApp[];
  open: number;
}

/**
 * What only the team sees across the three 18+ apps (architecture 4.16): a person's history in
 * the three, the "also reported in" mark of the report lists, and the one team digest.
 */
@Injectable()
export class AdultAdminService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AdultAdminService.name);
  private timer: NodeJS.Timeout | undefined;
  private lastDigestAt = 0;

  constructor(
    private readonly repository: AdultRepository,
    private readonly safety: AdultSafetyService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.isTest) return;
    this.timer = setInterval(() => void this.sendDigest(), DIGEST_EVERY_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  /** "Across the 18+ apps": the person in each app, shared suspensions, blocks and verification. */
  async person(userId: string, now = new Date()) {
    const user = await this.repository.findUser(userId);
    if (!user) throw new NotFoundException('Account not found');
    const apps = await Promise.all(
      ADULT_APPS.map(async (app) => {
        const overview = await this.safety.stores[app].overviewOf(userId);
        const byReason: Record<string, number> = {};
        const counts = { open: 0, dismissed: 0, actioned: 0 };
        for (const row of overview.reportsReceived) {
          byReason[row.reason] = (byReason[row.reason] ?? 0) + row.count;
          if (row.status === 'OPEN') counts.open += row.count;
          if (row.status === 'DISMISSED') counts.dismissed += row.count;
          if (row.status === 'ACTIONED') counts.actioned += row.count;
        }
        const suspension = overview.suspension;
        const inForce = !!suspension && (!suspension.until || suspension.until > now);
        return { app, overview, byReason, counts, suspension: inForce ? suspension : null };
      }),
    );
    if (apps.every((entry) => !entry.overview.enteredAt)) {
      throw new NotFoundException('That account entered none of the 18+ apps');
    }
    const [suspensions, verification, history, blockers] = await Promise.all([
      this.repository.suspensionsOf(userId),
      this.repository.findVerification(userId),
      this.repository.verificationHistory(userId),
      Promise.all(ADULT_APPS.map((app) => this.safety.stores[app].blockersOf(userId))),
    ]);
    const shared = suspensions.find((row) => isActiveSuspension(row, now));
    return {
      userId,
      name: user.name,
      email: user.email,
      apps: apps.map(({ app, overview, byReason, counts, suspension }) => ({
        app,
        enteredAt: overview.enteredAt?.toISOString() ?? null,
        name: overview.name,
        reportsReceived: { ...counts, byReason },
        reportsMade: overview.reportsMade,
        suspension: suspension
          ? {
              since: suspension.since.toISOString(),
              until: suspension.until?.toISOString() ?? null,
              reason: suspension.reason,
              category: suspension.category,
              shared: !!shared && shared.createdAt.getTime() === suspension.since.getTime(),
            }
          : null,
      })),
      sharedSuspensions: suspensions.map((row) => ({
        id: row.id,
        category: row.category,
        sourceApp: row.sourceApp,
        reason: row.reason,
        until: row.until?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        by: row.by,
        liftedAt: row.liftedAt?.toISOString() ?? null,
        liftedBy: row.liftedBy,
        liftReason: row.liftReason,
        active: isActiveSuspension(row, now),
      })),
      blockedBy: new Set(blockers.flat()).size,
      verification: verification
        ? {
            status: verification.status,
            sourceApp: verification.sourceApp,
            verifiedName: verification.verifiedName,
            sentAt: verification.sentAt?.toISOString() ?? null,
            decidedAt: verification.decidedAt?.toISOString() ?? null,
            hasPhoto: !!verification.photoKey,
            history: history.map((entry) => ({
              action: entry.action,
              at: entry.createdAt.toISOString(),
              by: entry.actorName,
              details: entry.details,
            })),
          }
        : null,
      // Phase 4 (linked profiles).
      link: null,
    };
  }

  /** For an app's report list: where else each person was reported (none: absent). */
  async alsoReported(app: AdultApp, userIds: string[]): Promise<Map<string, AlsoReported>> {
    const people = [...new Set(userIds)];
    const result = new Map<string, AlsoReported>();
    for (const other of ADULT_APPS) {
      if (other === app) continue;
      const counts = await this.safety.stores[other].reportCountsOf(people);
      for (const [userId, count] of counts) {
        if (count.total === 0) continue;
        const entry = result.get(userId) ?? { apps: [], open: 0 };
        entry.apps.push(other);
        entry.open += count.open;
        result.set(userId, entry);
      }
    }
    return result;
  }

  /**
   * The one digest of the three apps ("18+ apps: N things waiting"), when something new is waiting
   * since the last one (at most hourly); the shared verification queue counted once.
   */
  async sendDigest(now = new Date()): Promise<boolean> {
    if (!this.config.leadsNotifyTo) return false;
    if (now.getTime() - this.lastDigestAt < DIGEST_MIN_GAP_MS) return false;
    try {
      const newest = [
        await this.repository.newestVerificationAt(),
        ...(await Promise.all(ADULT_APPS.map((app) => this.safety.stores[app].newestPendingAt()))),
      ].filter((time): time is Date => !!time);
      if (newest.length === 0) return false;
      if (Math.max(...newest.map((time) => time.getTime())) <= this.lastDigestAt) return false;
      const sections = await Promise.all(
        ADULT_APPS.map(async (app) => ({
          app: APP_LABELS[app],
          rows: await this.safety.stores[app].digestCounts(),
        })),
      );
      const verifications = await this.repository.countPendingVerifications();
      this.lastDigestAt = now.getTime();
      this.mail
        .send(
          adultDigestEmail(this.config.leadsNotifyTo, sections, verifications, this.config.siteUrl),
        )
        .catch((error: unknown) => this.logger.error(`18+ apps digest not sent: ${String(error)}`));
      return true;
    } catch (error) {
      this.logger.error(`18+ apps digest failed: ${String(error)}`);
      return false;
    }
  }
}
