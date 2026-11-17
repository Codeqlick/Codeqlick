import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { ReadStream } from 'node:fs';
import { toAccountLocale } from '../../common/schemas/common.schemas.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { AdultApp, AdultVerification } from '../../generated/prisma/client.js';
import { ActivityService, type ActivityActor } from '../activity/activity.service.js';
import { CruisingRepository } from '../cruising/cruising.repository.js';
import { MailService, type MailMessage } from '../mail/mail.service.js';
import { processImage } from '../swipe/swipe-image.js';
import { SwipeRepository } from '../swipe/swipe.repository.js';
import { SWIPE_TERMS_VERSION } from '../swipe/swipe.schemas.js';
import { VideochatRepository } from '../videochat/videochat.repository.js';
import { VIDEOCHAT_TERMS_VERSION } from '../videochat/videochat.schemas.js';
import type { AdultAppStore, AppEntry } from './adult-app-store.js';
import { adultNoticeEmail, type AdultNotice } from './adult-emails.js';
import { AdultEvents } from './adult-events.js';
import { AdultRepository } from './adult.repository.js';
import { nameStillHeld, useVerificationTry } from './adult.rules.js';
import { AdultVerificationStorage } from './adult.storage.js';

/** Photo files nothing points to go after an hour, checked every 6 hours. */
const ORPHAN_AGE_MS = 60 * 60 * 1000;
const CLEANUP_FIRST_MS = 3 * 60_000;
const CLEANUP_EVERY_MS = 6 * 60 * 60 * 1000;
/** Automatic withdrawals in the activity log. */
const SYSTEM: ActivityActor = { id: null, name: 'Codeqlick' };

export interface AdultVerificationView {
  status: AdultVerification['status'];
  sourceApp: AdultApp | null;
  verifiedAt: string | null;
  sentAt: string | null;
  note: string | null;
  /** A photo waiting for review (the member can look at it). */
  hasPhoto: boolean;
}

export interface PhotoFile {
  stream: ReadStream;
  size: number;
}

/**
 * One verification per account for the three 18+ apps (architecture 4.16, decision 113): a photo of
 * the person holding a paper with their name in the app they send it from, "Codeqlick" and the
 * date, decided once by the team in one queue. APPROVED gives the "Verified" badge in the three
 * apps; the approved photo is kept privately while the verification stands.
 */
@Injectable()
export class AdultVerificationService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AdultVerificationService.name);
  private timers: NodeJS.Timeout[] = [];
  private readonly stores: Record<AdultApp, AdultAppStore>;

  constructor(
    private readonly repository: AdultRepository,
    private readonly storage: AdultVerificationStorage,
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
    const first = setTimeout(() => {
      void this.cleanOrphans();
      this.timers.push(setInterval(() => void this.cleanOrphans(), CLEANUP_EVERY_MS).unref());
    }, CLEANUP_FIRST_MS).unref();
    this.timers.push(first);
  }

  onApplicationShutdown(): void {
    for (const timer of this.timers) clearTimeout(timer);
  }

  /** Deletes photo files no verification points to any more. Never throws. */
  async cleanOrphans(now = new Date()): Promise<number> {
    try {
      const used = await this.repository.photoKeys();
      const orphans = (await this.storage.list()).filter(
        (file) => !used.has(file.key) && now.getTime() - file.modifiedAt.getTime() > ORPHAN_AGE_MS,
      );
      for (const file of orphans) await this.storage.remove(file.key);
      return orphans.length;
    } catch (error) {
      this.logger.error(`18+ apps verification cleanup failed: ${String(error)}`);
      return 0;
    }
  }

  /** The current terms version of each app. */
  private termsOf(app: AdultApp): string {
    if (app === 'CRUISING') return this.config.cruisingTermsVersion;
    return app === 'SWIPE' ? SWIPE_TERMS_VERSION : VIDEOCHAT_TERMS_VERSION;
  }

  private viewOf(row: AdultVerification | null): AdultVerificationView {
    return {
      status: row?.status ?? 'NONE',
      sourceApp: row?.sourceApp ?? null,
      verifiedAt: row?.status === 'APPROVED' ? (row.decidedAt?.toISOString() ?? null) : null,
      sentAt: row?.sentAt?.toISOString() ?? null,
      note: row?.note ?? null,
      hasPhoto: row?.status === 'PENDING' && !!row.photoKey,
    };
  }

  /** The account's verification, as each app's status shows it. */
  async view(userId: string): Promise<AdultVerificationView> {
    return this.viewOf(await this.repository.findVerification(userId));
  }

  /** Whether the account carries the "Verified" badge (in the three apps). */
  async isVerified(userId: string): Promise<boolean> {
    return (await this.repository.findVerification(userId))?.status === 'APPROVED';
  }

  /** The badge of several accounts at once. */
  verifiedAmong(userIds: string[]): Promise<Set<string>> {
    return this.repository.verifiedAmong([...new Set(userIds)]);
  }

  /** The member's entry in `app`, entered with the current terms and not suspended. */
  private async enteredIn(app: AdultApp, userId: string, now: Date): Promise<AppEntry> {
    const entry = await this.stores[app].entryOf(userId);
    if (!entry || entry.termsVersion !== this.termsOf(app)) {
      throw new ConflictException('Confirm your age and accept the rules first');
    }
    if (entry.suspendedAt && (!entry.suspendedUntil || entry.suspendedUntil > now)) {
      throw new ForbiddenException('Your account is suspended');
    }
    return entry;
  }

  /**
   * The photo, sent from `app`: the member holding a paper with their name there, "Codeqlick" and
   * the date. Re-encoded to WebP without metadata; 5 a day.
   */
  async upload(
    userId: string,
    app: AdultApp,
    data: Buffer | undefined,
    now = new Date(),
  ): Promise<AdultVerificationView> {
    const entry = await this.enteredIn(app, userId, now);
    if (!entry.name) throw new ConflictException('Choose your name in the app first');
    const current = await this.repository.findVerification(userId);
    if (current?.status === 'APPROVED') throw new ConflictException('You are verified already');
    if (current?.status === 'PENDING') {
      throw new ConflictException('Your verification photo is waiting for the team');
    }
    if (!data || data.length === 0) {
      throw new BadRequestException('Send the photo in a multipart field called "file"');
    }
    const allowance = useVerificationTry(current?.tries ?? 0, current?.triesSince ?? null, now);
    if (!allowance) {
      throw new HttpException(
        'Too many verification photos today: try again tomorrow',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const image = await processImage(data);
    if (!image) throw new BadRequestException('Only PNG, JPEG and WebP photos are accepted');
    const photoKey = await this.storage.write(image.data);
    const saved = await this.repository.saveVerification(userId, {
      status: 'PENDING',
      sourceApp: app,
      verifiedName: entry.name,
      photoKey,
      note: null,
      sentAt: now,
      decidedAt: null,
      decidedById: null,
      tries: allowance.tries,
      triesSince: allowance.since,
    });
    if (current?.photoKey && current.photoKey !== photoKey)
      await this.storage.remove(current.photoKey);
    return this.viewOf(saved);
  }

  private async open(key: string | null | undefined): Promise<PhotoFile> {
    const size = key ? await this.storage.size(key) : undefined;
    if (!key || size === undefined) throw new NotFoundException('No verification photo');
    return { stream: this.storage.read(key), size };
  }

  /** My photo while it waits for review. */
  async myFile(userId: string): Promise<PhotoFile> {
    const row = await this.repository.findVerification(userId);
    return this.open(row?.status === 'PENDING' ? row.photoKey : null);
  }

  /** For the team: the photo waiting, or the approved one kept while it stands. */
  async adminFile(userId: string): Promise<PhotoFile> {
    return this.open((await this.repository.findVerification(userId))?.photoKey);
  }

  /** The one queue, oldest first. */
  async pending() {
    const rows = await this.repository.pendingVerifications();
    return {
      items: rows.map((row) => ({
        userId: row.userId,
        name: row.user.name,
        email: row.user.email,
        memberSince: row.user.createdAt.toISOString(),
        names: {
          cruising: row.user.cruisingProfile?.nickname ?? null,
          username: row.user.username,
        },
        verifiedName: row.verifiedName,
        sourceApp: row.sourceApp,
        sentAt: row.sentAt?.toISOString() ?? null,
      })),
    };
  }

  /**
   * Approves (the badge in the three apps; the photo is kept) or rejects (the photo is deleted, the
   * note goes to the person). Deciding in one admin decides for all.
   */
  async decide(
    actor: ActivityActor,
    userId: string,
    input: { approve: boolean; note?: string },
    now = new Date(),
  ): Promise<void> {
    const row = await this.repository.findVerification(userId);
    if (!row || row.status !== 'PENDING') {
      throw new NotFoundException('No verification waiting for review');
    }
    const decided = await this.repository.updateVerificationIf(userId, 'PENDING', {
      status: input.approve ? 'APPROVED' : 'REJECTED',
      note: input.note || null,
      decidedAt: now,
      decidedById: actor.id,
      withdrawnAt: null,
      withdrawnReason: null,
      ...(input.approve ? {} : { photoKey: null }),
    });
    if (!decided) throw new NotFoundException('No verification waiting for review');
    if (!input.approve) await this.storage.remove(row.photoKey);
    await this.activity.record(actor, {
      action: 'adult.verification_decided',
      targetId: userId,
      targetLabel: row.verifiedName,
      details: { approve: input.approve, sourceApp: row.sourceApp, note: input.note || null },
    });
    this.events.verification.next({ userId, status: input.approve ? 'APPROVED' : 'REJECTED' });
    await this.notify(
      userId,
      input.approve ? 'verification-approved' : 'verification-rejected',
      input.note || null,
    );
  }

  /** The team takes the badge away in the three apps (on a report); the person is emailed. */
  async withdraw(actor: ActivityActor, userId: string, reason: string | null, now = new Date()) {
    if (!(await this.withdrawRow(actor, userId, reason, now))) {
      throw new NotFoundException('That account is not verified');
    }
    await this.notify(userId, 'verification-withdrawn', reason);
  }

  /** Withdraws without its own email (a shared suspension's email says enough). */
  async withdrawSilently(actor: ActivityActor, userId: string, reason: string, now = new Date()) {
    await this.withdrawRow(actor, userId, reason, now);
  }

  /** Back to NONE, photo deleted; false when there was nothing approved or pending. */
  private async withdrawRow(
    actor: ActivityActor,
    userId: string,
    reason: string | null,
    now: Date,
  ): Promise<boolean> {
    const row = await this.repository.findVerification(userId);
    if (!row || (row.status !== 'APPROVED' && row.status !== 'PENDING')) return false;
    if (
      !(await this.repository.updateVerificationIf(userId, row.status, {
        status: 'NONE',
        photoKey: null,
        note: null,
        withdrawnAt: now,
        withdrawnReason: reason,
      }))
    ) {
      return false;
    }
    await this.storage.remove(row.photoKey);
    await this.activity.record(actor, {
      action: 'adult.verification_withdrawn',
      targetId: userId,
      targetLabel: row.verifiedName,
      details: { reason, was: row.status },
    });
    this.events.verification.next({ userId, status: 'WITHDRAWN' });
    return true;
  }

  /**
   * After a name change (the username, or the Cruising nickname): when the name on the paper is no
   * longer any of the account's adult names, the verification goes (decision 83's rule, now for
   * the three apps) and the person is told.
   */
  async nameChanged(userId: string, now = new Date()): Promise<void> {
    const row = await this.repository.findVerification(userId);
    if (!row || (row.status !== 'APPROVED' && row.status !== 'PENDING')) return;
    if (nameStillHeld(row.verifiedName, await this.repository.namesOf(userId))) return;
    if (await this.withdrawRow(SYSTEM, userId, 'The name on the paper changed', now)) {
      if (row.status === 'APPROVED') await this.notify(userId, 'verification-withdrawn', null);
    }
  }

  /** The account is being deleted: its photo goes with it (the row cascades). */
  async forgetPhoto(userId: string): Promise<void> {
    const row = await this.repository.findVerification(userId);
    await this.storage.remove(row?.photoKey);
  }

  private async notify(userId: string, notice: AdultNotice, note: string | null): Promise<void> {
    const user = await this.repository.findUser(userId);
    if (!user) return;
    this.send(
      adultNoticeEmail(user.email, toAccountLocale(user.locale), notice, note, this.config.siteUrl),
    );
  }

  private send(message: MailMessage): void {
    this.mail
      .send(message)
      .catch((error: unknown) => this.logger.error(`18+ apps email not sent: ${String(error)}`));
  }
}
