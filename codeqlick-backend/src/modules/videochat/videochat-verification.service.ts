import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { toApiLocale } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { MailService } from '../mail/mail.service.js';
import { processImage } from '../swipe/swipe-image.js';
import { VideochatPhotoStorage } from '../swipe/swipe.storage.js';
import type { PhotoFile } from '../swipe/swipe.service.js';
import { verificationDecidedEmail } from './videochat-emails.js';
import { VideochatRepository } from './videochat.repository.js';
import { VideochatService, isSuspended, type VideochatStatus } from './videochat.service.js';
import { VIDEOCHAT_TERMS_VERSION } from './videochat.schemas.js';

/** A rejected person may try again; a few sends a day are enough. */
const SENDS_PER_DAY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Files nothing points to (a deleted account's photo) go after an hour, checked every 6 hours. */
const ORPHAN_AGE_MS = 60 * 60 * 1000;
const CLEANUP_FIRST_MS = 2 * 60_000;
const CLEANUP_EVERY_MS = 6 * 60 * 60 * 1000;

export interface PendingVerification {
  userId: string;
  nickname: string | null;
  name: string;
  email: string;
  sentAt: string | null;
}

/**
 * The video chat's optional photo verification (architecture 4.7): the person sends a photo of
 * themselves holding a paper with their nickname and the date, the team approves or rejects it,
 * and approved people show a "verified" badge to partners and contacts. The photo is deleted
 * once decided: only the outcome is kept.
 */
@Injectable()
export class VideochatVerificationService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(VideochatVerificationService.name);
  private timer: NodeJS.Timeout | undefined;
  /** Sends per account in the last day (in memory: a restart only forgives a few). */
  private readonly sends = new Map<string, number[]>();

  constructor(
    private readonly repository: VideochatRepository,
    private readonly videochat: VideochatService,
    private readonly storage: VideochatPhotoStorage,
    private readonly mail: MailService,
    private readonly activity: ActivityService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    // Tests run against a shared database and start the app many times: no background work there.
    if (this.config.nodeEnv === 'test') return;
    this.timer = setTimeout(() => {
      void this.cleanOrphans();
      this.timer = setInterval(() => void this.cleanOrphans(), CLEANUP_EVERY_MS).unref();
    }, CLEANUP_FIRST_MS).unref();
  }

  onApplicationShutdown(): void {
    clearTimeout(this.timer);
  }

  /** Deletes photo files no profile points to any more. Never throws; returns how many went. */
  async cleanOrphans(now: Date = new Date()): Promise<number> {
    try {
      const used = new Set(await this.repository.verificationKeys());
      const orphans = (await this.storage.list()).filter(
        (file) => !used.has(file.key) && now.getTime() - file.modifiedAt.getTime() > ORPHAN_AGE_MS,
      );
      for (const file of orphans) await this.storage.remove(file.key);
      return orphans.length;
    } catch (error) {
      this.logger.error(`Video chat verification cleanup failed: ${String(error)}`);
      return 0;
    }
  }

  async upload(
    userId: string,
    data: Buffer | undefined,
    now: Date = new Date(),
  ): Promise<VideochatStatus> {
    const profile = await this.repository.findProfile(userId);
    if (!profile || profile.termsVersion !== VIDEOCHAT_TERMS_VERSION) {
      throw new ConflictException('Confirm your age and accept the rules first');
    }
    if (isSuspended(profile, now)) throw new ConflictException('Your access is suspended');
    if (!profile.nickname) throw new ConflictException('Choose your nickname first');
    if (profile.verificationStatus === 'APPROVED') {
      throw new ConflictException('You are verified already');
    }
    if (!data || data.length === 0) {
      throw new BadRequestException('Send the image in a multipart field called "file"');
    }
    const recent = (this.sends.get(userId) ?? []).filter((at) => now.getTime() - at < DAY_MS);
    if (recent.length >= SENDS_PER_DAY) {
      throw new HttpException(
        'Too many photos today: try again tomorrow',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const image = await processImage(data);
    if (!image) throw new BadRequestException('Only PNG, JPEG and WebP photos are accepted');
    this.sends.set(userId, [...recent, now.getTime()]);
    const key = await this.storage.write(image.data);
    await this.repository.updateVerification(userId, {
      verificationStatus: 'PENDING',
      verificationKey: key,
      verificationNote: null,
      verificationSentAt: now,
    });
    await this.storage.remove(profile.verificationKey);
    return this.videochat.status(userId, now);
  }

  /** The photo waiting for review, for its owner or the team. */
  async file(userId: string): Promise<PhotoFile> {
    const profile = await this.repository.findProfile(userId);
    const key = profile?.verificationKey;
    const size = key ? await this.storage.size(key) : undefined;
    if (!key || size === undefined) throw new NotFoundException('No verification photo');
    return { stream: this.storage.read(key), size };
  }

  async pending(): Promise<PendingVerification[]> {
    return (await this.repository.pendingVerifications()).map((profile) => ({
      userId: profile.userId,
      nickname: profile.nickname,
      name: profile.user.name,
      email: profile.user.email,
      sentAt: profile.verificationSentAt?.toISOString() ?? null,
    }));
  }

  /** Approves (badge) or rejects (with a note the person reads); the photo is deleted either way. */
  async decide(
    admin: AuthUser,
    userId: string,
    input: { approve: boolean; note?: string },
    now: Date = new Date(),
  ): Promise<void> {
    const profile = await this.repository.findProfile(userId);
    if (!profile || profile.verificationStatus !== 'PENDING') {
      throw new NotFoundException('No verification waiting for review');
    }
    await this.repository.updateVerification(userId, {
      verificationStatus: input.approve ? 'APPROVED' : 'REJECTED',
      verificationNote: input.note || null,
      verificationKey: null,
      verifiedAt: input.approve ? now : null,
    });
    await this.storage.remove(profile.verificationKey);
    await this.activity.record(admin, {
      action: input.approve ? 'videochat.verification_approved' : 'videochat.verification_rejected',
      targetId: userId,
      targetLabel: profile.nickname,
    });
    const person = await this.repository.person(userId);
    if (!person) return;
    this.mail
      .send(
        verificationDecidedEmail(
          { to: person.email, name: person.name, locale: toApiLocale(person.locale) },
          { approved: input.approve, note: input.note || null },
          this.config.webappUrl('videochat'),
          this.config.siteUrl,
        ),
      )
      .catch((error: unknown) =>
        this.logger.error(`Verification email not sent: ${String(error)}`),
      );
  }

  /** Takes the badge away (for example after a report): the person can send a new photo. */
  async revoke(admin: AuthUser, userId: string): Promise<void> {
    const profile = await this.repository.findProfile(userId);
    if (!profile || profile.verificationStatus !== 'APPROVED') {
      throw new NotFoundException('That account is not verified');
    }
    await this.repository.updateVerification(userId, {
      verificationStatus: 'NONE',
      verifiedAt: null,
      verificationNote: null,
    });
    await this.activity.record(admin, {
      action: 'videochat.verification_revoked',
      targetId: userId,
      targetLabel: profile.nickname,
    });
  }
}
