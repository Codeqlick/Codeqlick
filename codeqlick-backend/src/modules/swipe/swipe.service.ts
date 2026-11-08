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
import { randomBytes } from 'node:crypto';
import type { ReadStream } from 'node:fs';
import type { SwipePhoto, SwipeProfile } from '../../generated/prisma/client.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { toApiLocale, toDbLocale } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { ActivityService } from '../activity/activity.service.js';
import { MailService } from '../mail/mail.service.js';
import { sharesContact } from './swipe-chat-guard.js';
import {
  swipeAlertEmail,
  swipeDigestEmail,
  swipeNoticeEmail,
  takedownEmail,
  type SwipeNotice,
} from './swipe-emails.js';
import { isBlockedImage, processImage, watermark, watermarkText } from './swipe-image.js';
import { SwipePushService, type SwipePushKind } from './swipe-push.service.js';
import { SwipeRepository, type DeckFilter } from './swipe.repository.js';
import {
  ageOn,
  MAX_AGE_FILTER,
  MIN_AGE_FILTER,
  SAFE_CHAT_MESSAGES,
  SUPER_LIKES_PER_DAY,
  UNDO_WINDOW_MS,
  DECK_SIZE,
  HIDE_AT_ONCE,
  INTERESTS,
  MAX_PHOTOS,
  normalizeRef,
  REPORTS_PER_DAY,
  suspensionEnd,
  SWIPE_MIN_AGE,
  SWIPE_TERMS_VERSION,
  TRANSCRIPT_LINES,
  UPLOADS_PER_DAY,
  type Country,
  type Gender,
  type Interest,
  type OnboardingInput,
  type ReportActionInput,
  type ReportInput,
  type ReportReason,
  type SuspendUserInput,
  type SwipeProfileInput,
  type TakedownDecision,
  type TakedownInput,
  type VerificationDecision,
} from './swipe.schemas.js';
import { SwipeStorage } from './swipe.storage.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** The orphan cleanup: first run a minute after start, then every 6 hours. */
const CLEANUP_FIRST_MS = 60_000;
const CLEANUP_EVERY_MS = 6 * 60 * 60 * 1000;
/** A file nothing points to is deleted once it is this old (an upload may still be saving it). */
const ORPHAN_AGE_MS = 60 * 60 * 1000;
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Unread messages are emailed once they have waited this long… */
const UNREAD_AFTER_MS = 15 * 60 * 1000;
/** …checked this often, for chats active in the last week. */
const UNREAD_EVERY_MS = 10 * 60 * 1000;
const UNREAD_LOOKBACK_MS = 7 * DAY_MS;
/** The team's digest: checked this often, sent at most once in DIGEST_MIN_GAP_MS. */
const DIGEST_EVERY_MS = 30 * 60 * 1000;
const DIGEST_MIN_GAP_MS = 60 * 60 * 1000;
/** A chat's partner gets at most one push about new messages in this time. */
const MESSAGE_PUSH_GAP_MS = 2 * 60 * 1000;
/** Photos watermarked per background run. */
const WATERMARK_BATCH = 50;

/** The deck's birth years for an age range, or undefined for the full range (anyone). */
export function birthYearsFor(
  ageMin: number,
  ageMax: number,
  now: Date,
): { from: number; to: number } | undefined {
  if (ageMin <= MIN_AGE_FILTER && ageMax >= MAX_AGE_FILTER) return undefined;
  const year = now.getUTCFullYear();
  return { from: year - ageMax, to: year - ageMin };
}

/** Age from a birth year (the year only: at most one year off). */
export function ageFromYear(birthYear: number | null | undefined, now: Date): number | null {
  return birthYear ? now.getUTCFullYear() - birthYear : null;
}

/** Suspended right now: a timed suspension that ended no longer counts. */
export function isSuspended(
  profile: Pick<SwipeProfile, 'suspendedAt' | 'suspendedUntil'> | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!profile?.suspendedAt) return false;
  return !profile.suspendedUntil || profile.suspendedUntil > now;
}

/** 8 characters without look-alikes (no I, O, 0, 1), e.g. K7QM2XPA. */
export function newRef(): string {
  const bytes = randomBytes(8);
  return Array.from(bytes, (byte) => REF_ALPHABET[byte % REF_ALPHABET.length]).join('');
}

function knownInterests(stored: string[] | undefined): Interest[] {
  return (stored ?? []).filter((value): value is Interest =>
    (INTERESTS as readonly string[]).includes(value),
  );
}

export interface SwipeProfileView {
  nickname: string | null;
  gender: Gender | null;
  seeking: Gender[];
  interests: Interest[];
  bio: string | null;
  birthYear: number | null;
  country: Country | null;
  ageMin: number;
  ageMax: number;
  sameCountry: boolean;
  emailAlerts: boolean;
  blurPhotos: boolean;
}

export interface SwipeStatus {
  onboarded: boolean;
  termsVersion: string;
  acceptedTermsVersion: string | null;
  suspended: boolean;
  suspension: { reason: string | null; until: string | null } | null;
  /** May see and vote on photos: onboarded and not suspended. */
  allowed: boolean;
  profile: SwipeProfileView | null;
  verification: {
    status: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
    note: string | null;
    hasPhoto: boolean;
  };
  /** May upload photos: verified, with a nickname, not suspended. */
  canUpload: boolean;
  /** "Love" left today. */
  superLikesLeft: number;
}

export interface MyPhotoView {
  id: string;
  ref: string;
  status: 'PENDING' | 'LIVE' | 'REJECTED' | 'HIDDEN';
  rejectReason: string | null;
  likes: number;
  width: number;
  height: number;
  createdAt: string;
}

export interface CardView {
  id: string;
  ref: string;
  width: number;
  height: number;
  nickname: string;
  gender: Gender | null;
  interests: Interest[];
  bio: string | null;
  /** They gave one of my photos a "love". */
  lovesYou: boolean;
}

export interface MatchView {
  id: string;
  partner: {
    nickname: string;
    gender: Gender | null;
    interests: Interest[];
    bio: string | null;
    photoId: string | null;
  };
  lastMessage: { text: string; mine: boolean; at: string } | null;
  unread: number;
  createdAt: string;
}

export interface MessageView {
  id: string;
  mine: boolean;
  text: string;
  createdAt: string;
}

export interface PhotoFile {
  stream: ReadStream;
  size: number;
}

@Injectable()
export class SwipeService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SwipeService.name);
  private timers: NodeJS.Timeout[] = [];
  private lastDigestAt = 0;
  private readonly messagePushedAt = new Map<string, number>();

  constructor(
    private readonly repository: SwipeRepository,
    private readonly storage: SwipeStorage,
    private readonly activity: ActivityService,
    private readonly mail: MailService,
    private readonly push: SwipePushService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.isTest) return;
    const first = setTimeout(() => {
      void this.cleanupFiles().then(() => this.watermarkStored());
      this.timers.push(
        setInterval(() => {
          void this.cleanupFiles().then(() => this.watermarkStored());
        }, CLEANUP_EVERY_MS).unref(),
      );
    }, CLEANUP_FIRST_MS).unref();
    this.timers.push(
      first,
      setInterval(() => void this.emailUnread(), UNREAD_EVERY_MS).unref(),
      setInterval(() => void this.sendDigest(), DIGEST_EVERY_MS).unref(),
    );
  }

  onApplicationShutdown(): void {
    for (const timer of this.timers) clearTimeout(timer);
  }

  private get swipeUrl(): string {
    return this.config.webappUrl('swipe');
  }

  /**
   * Tells a person about something: an email (decisions always; matches, messages and "love"
   * unless they turned them off) and, for those, a push to their browsers.
   */
  private async notifyUser(
    userId: string,
    notice: SwipeNotice,
    note: string | null = null,
    now = new Date(),
  ): Promise<void> {
    try {
      const user = await this.repository.recipient(userId);
      if (!user || isSuspended(user.swipeProfile, now)) return;
      const pushKind: Record<string, SwipePushKind> = { match: 'match', loved: 'loved' };
      if (pushKind[notice]) void this.push.notify(userId, pushKind[notice]);
      const optional = notice === 'match' || notice === 'loved' || notice === 'unread';
      if (optional && user.swipeProfile?.emailAlerts === false) return;
      this.sendMail(
        swipeNoticeEmail(
          user.email,
          toApiLocale(user.locale),
          notice,
          note,
          this.swipeUrl,
          this.config.siteUrl,
        ),
      );
    } catch (error) {
      this.logger.error(`Swipe notice not sent: ${String(error)}`);
    }
  }

  /** Emails each person whose match's messages have waited unread (once until they read). */
  async emailUnread(now = new Date()): Promise<number> {
    let sent = 0;
    try {
      const matches = await this.repository.recentlyActiveMatches(
        new Date(now.getTime() - UNREAD_LOOKBACK_MS),
        new Date(now.getTime() - UNREAD_AFTER_MS),
      );
      for (const match of matches) {
        const sender = match.messages[0]?.senderId;
        if (!sender || !match.lastMessageAt) continue;
        const reader = sender === match.userAId ? match.userBId : match.userAId;
        const isA = reader === match.userAId;
        const readAt = isA ? match.readAAt : match.readBAt;
        const notifiedAt = isA ? match.notifiedAAt : match.notifiedBAt;
        if (readAt && readAt >= match.lastMessageAt) continue;
        // Told already, and they haven't read since.
        if (notifiedAt && (!readAt || notifiedAt > readAt)) continue;
        await this.repository.markNotified(match, reader, now);
        await this.notifyUser(reader, 'unread', null, now);
        sent += 1;
      }
    } catch (error) {
      this.logger.error(`Swipe unread emails failed: ${String(error)}`);
    }
    return sent;
  }

  /** The team's digest, when something new is waiting since the last one (at most hourly). */
  async sendDigest(now = new Date()): Promise<boolean> {
    if (!this.config.leadsNotifyTo) return false;
    if (now.getTime() - this.lastDigestAt < DIGEST_MIN_GAP_MS) return false;
    try {
      const newest = await this.repository.newestPendingAt();
      if (!newest || newest.getTime() <= this.lastDigestAt) return false;
      const overview = await this.repository.overview(now);
      this.lastDigestAt = now.getTime();
      this.sendMail(
        swipeDigestEmail(
          this.config.leadsNotifyTo,
          {
            verifications: overview.pendingVerifications,
            photos: overview.pendingPhotos,
            reports: overview.openReports,
            takedowns: overview.openTakedowns,
          },
          this.config.siteUrl,
        ),
      );
      return true;
    } catch (error) {
      this.logger.error(`Swipe digest failed: ${String(error)}`);
      return false;
    }
  }

  /** Burns the watermark into photos stored before it existed. */
  async watermarkStored(): Promise<number> {
    let done = 0;
    try {
      for (const photo of await this.repository.photosToWatermark(WATERMARK_BATCH)) {
        const data = await this.storage.readAll(photo.storageKey);
        if (!data) {
          await this.repository.updatePhoto(photo.id, { watermarked: true });
          continue;
        }
        const marked = await watermark(
          data,
          watermarkText(photo.owner.swipeProfile?.nickname, photo.ref),
        );
        const storageKey = await this.storage.write(marked);
        await this.repository.updatePhoto(photo.id, { storageKey, watermarked: true });
        await this.storage.remove(photo.storageKey);
        done += 1;
      }
    } catch (error) {
      this.logger.error(`Swipe watermarking failed: ${String(error)}`);
    }
    return done;
  }

  /** Deletes files no photo or profile points to (deleted accounts, failed saves). */
  async cleanupFiles(now = new Date()): Promise<number> {
    try {
      const [files, used] = await Promise.all([this.storage.list(), this.repository.storageKeys()]);
      const orphans = files.filter(
        (file) => !used.has(file.key) && now.getTime() - file.modifiedAt.getTime() > ORPHAN_AGE_MS,
      );
      for (const file of orphans) await this.storage.remove(file.key);
      return orphans.length;
    } catch (error) {
      this.logger.error(`Swipe file cleanup failed: ${String(error)}`);
      return 0;
    }
  }

  // ---- Status and profile ------------------------------------------------------------------------

  async status(userId: string, now = new Date()): Promise<SwipeStatus> {
    return this.statusOf(await this.repository.findProfile(userId), now);
  }

  private async superLikesLeft(userId: string, now: Date): Promise<number> {
    const used = await this.repository.countSuperLikesSince(
      userId,
      new Date(now.getTime() - DAY_MS),
    );
    return Math.max(0, SUPER_LIKES_PER_DAY - used);
  }

  private async statusOf(profile: SwipeProfile | null, now: Date): Promise<SwipeStatus> {
    const onboarded = !!profile && profile.termsVersion === SWIPE_TERMS_VERSION;
    const suspended = isSuspended(profile, now);
    return {
      onboarded,
      termsVersion: SWIPE_TERMS_VERSION,
      acceptedTermsVersion: profile?.termsVersion ?? null,
      suspended,
      suspension: suspended
        ? {
            reason: profile?.suspensionReason ?? null,
            until: profile?.suspendedUntil?.toISOString() ?? null,
          }
        : null,
      allowed: onboarded && !suspended,
      profile: profile
        ? {
            nickname: profile.nickname,
            gender: profile.gender,
            seeking: profile.seeking,
            interests: knownInterests(profile.interests),
            bio: profile.bio,
            birthYear: profile.birthYear,
            country: (profile.country as Country | null) ?? null,
            ageMin: profile.ageMin,
            ageMax: profile.ageMax,
            sameCountry: profile.sameCountry,
            emailAlerts: profile.emailAlerts,
            blurPhotos: profile.blurPhotos,
          }
        : null,
      verification: {
        status: profile?.verificationStatus ?? 'NONE',
        note: profile?.verificationNote ?? null,
        hasPhoto: !!profile?.verificationKey,
      },
      canUpload:
        onboarded && !suspended && profile?.verificationStatus === 'APPROVED' && !!profile.nickname,
      superLikesLeft: profile ? await this.superLikesLeft(profile.userId, now) : 0,
    };
  }

  /** Checks 18+ (the date of birth is not stored) and records the accepted rules. */
  async onboard(userId: string, input: OnboardingInput, now = new Date()): Promise<SwipeStatus> {
    if (input.termsVersion !== SWIPE_TERMS_VERSION) {
      throw new ConflictException('The rules changed: read them again');
    }
    if (ageOn(input.birthDate, now) < SWIPE_MIN_AGE) {
      throw new ForbiddenException('Swipe is only for people aged 18 or over');
    }
    const birthYear = Number(input.birthDate.slice(0, 4));
    const profile = await this.repository.saveOnboarding(
      userId,
      SWIPE_TERMS_VERSION,
      birthYear,
      now,
    );
    return this.statusOf(profile, now);
  }

  /** A person who may use Swipe now, or the reason they can't. */
  private async allowedProfile(userId: string, now: Date): Promise<SwipeProfile> {
    const profile = await this.repository.findProfile(userId);
    if (!profile || profile.termsVersion !== SWIPE_TERMS_VERSION) {
      throw new ConflictException('Confirm your age and accept the rules first');
    }
    if (isSuspended(profile, now)) throw new ForbiddenException('Your account is suspended');
    return profile;
  }

  async saveProfile(
    userId: string,
    input: SwipeProfileInput,
    now = new Date(),
  ): Promise<SwipeStatus> {
    await this.allowedProfile(userId, now);
    if (input.birthYear !== null && now.getUTCFullYear() - input.birthYear < SWIPE_MIN_AGE) {
      throw new ForbiddenException('Swipe is only for people aged 18 or over');
    }
    const [ageMin, ageMax] =
      input.ageMin <= input.ageMax ? [input.ageMin, input.ageMax] : [input.ageMax, input.ageMin];
    const profile = await this.repository.updateProfile(userId, {
      nickname: input.nickname,
      gender: input.gender,
      seeking: input.seeking,
      interests: input.interests,
      bio: input.bio,
      // A year already given stays when the form leaves it empty.
      ...(input.birthYear !== null ? { birthYear: input.birthYear } : {}),
      country: input.country,
      ageMin,
      ageMax,
      sameCountry: input.sameCountry,
      emailAlerts: input.emailAlerts,
      blurPhotos: input.blurPhotos,
    });
    return this.statusOf(profile, now);
  }

  // ---- Uploads -----------------------------------------------------------------------------------

  /** Re-encodes an upload, refusing anything that isn't an image or is a removed image. */
  private async prepareUpload(ownerId: string, data: Buffer | undefined, now: Date) {
    if (!data || data.length === 0) {
      throw new BadRequestException('Send the image in a multipart field called "file"');
    }
    if (
      (await this.repository.countPhotosSince(ownerId, new Date(now.getTime() - DAY_MS))) >=
      UPLOADS_PER_DAY
    ) {
      throw new HttpException(
        'Too many uploads today: try again tomorrow',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const image = await processImage(data);
    if (!image) throw new BadRequestException('Only PNG, JPEG and WebP photos are accepted');
    if (isBlockedImage(image.hash, await this.repository.blockedHashes())) {
      throw new BadRequestException('This image was removed from Swipe and cannot be uploaded');
    }
    return image;
  }

  /** The verification photo: the person holding a paper with their nickname and today's date. */
  async uploadVerification(
    userId: string,
    data: Buffer | undefined,
    now = new Date(),
  ): Promise<SwipeStatus> {
    const profile = await this.allowedProfile(userId, now);
    if (!profile.nickname) throw new ConflictException('Choose your nickname first');
    if (profile.verificationStatus === 'APPROVED')
      throw new ConflictException('You are verified already');
    const image = await this.prepareUpload(userId, data, now);
    const key = await this.storage.write(image.data);
    const updated = await this.repository.updateProfile(userId, {
      verificationStatus: 'PENDING',
      verificationKey: key,
      verificationNote: null,
      verificationSentAt: now,
    });
    await this.storage.remove(profile.verificationKey);
    return this.statusOf(updated, now);
  }

  async uploadPhoto(
    userId: string,
    data: Buffer | undefined,
    now = new Date(),
  ): Promise<MyPhotoView> {
    const profile = await this.allowedProfile(userId, now);
    if (profile.verificationStatus !== 'APPROVED' || !profile.nickname) {
      throw new ForbiddenException('Your verification photo must be approved first');
    }
    if ((await this.repository.countActivePhotos(userId)) >= MAX_PHOTOS) {
      throw new ConflictException(`You can have up to ${MAX_PHOTOS} photos: delete one first`);
    }
    const image = await this.prepareUpload(userId, data, now);
    const ref = newRef();
    // The hash is the clean image's; the stored file carries the watermark.
    const storageKey = await this.storage.write(
      await watermark(image.data, watermarkText(profile.nickname, ref)),
    );
    try {
      const photo = await this.repository.createPhoto({
        ref,
        ownerId: userId,
        storageKey,
        width: image.width,
        height: image.height,
        hash: image.hash,
        watermarked: true,
        createdAt: now,
      });
      return this.myPhotoView(photo);
    } catch (error) {
      await this.storage.remove(storageKey);
      throw error;
    }
  }

  private myPhotoView(photo: SwipePhoto): MyPhotoView {
    return {
      id: photo.id,
      ref: photo.ref,
      status: photo.status,
      rejectReason: photo.rejectReason,
      likes: photo.likes,
      width: photo.width,
      height: photo.height,
      createdAt: photo.createdAt.toISOString(),
    };
  }

  async myPhotos(userId: string): Promise<MyPhotoView[]> {
    return (await this.repository.photosOf(userId)).map((photo) => this.myPhotoView(photo));
  }

  /** Deletes one of my photos and its file at once. */
  async deletePhoto(userId: string, photoId: string): Promise<void> {
    const photo = await this.repository.findPhoto(photoId);
    if (!photo || photo.ownerId !== userId) throw new NotFoundException('Photo not found');
    // Reports and removal requests keep their row, without the photo.
    await this.repository.deletePhoto(photo.id);
    await this.storage.remove(photo.storageKey);
  }

  /** A photo's file, for its owner, the team, or someone allowed to see it on a card. */
  async photoFile(viewer: AuthUser, photoId: string, now = new Date()): Promise<PhotoFile> {
    const photo = await this.repository.findPhoto(photoId);
    if (!photo) throw new NotFoundException('Photo not found');
    const isOwner = photo.ownerId === viewer.id;
    if (!isOwner && viewer.role !== 'ADMIN') {
      const profile = await this.repository.findProfile(viewer.id);
      const visible =
        photo.status === 'LIVE' &&
        !!profile &&
        profile.termsVersion === SWIPE_TERMS_VERSION &&
        !isSuspended(profile, now) &&
        !isSuspended(photo.owner.swipeProfile, now) &&
        !(await this.repository.isBlockedEitherWay(viewer.id, photo.ownerId));
      if (!visible) throw new NotFoundException('Photo not found');
    }
    return this.openFile(photo.storageKey);
  }

  async verificationFile(userId: string): Promise<PhotoFile> {
    const profile = await this.repository.findProfile(userId);
    if (!profile?.verificationKey) throw new NotFoundException('No verification photo');
    return this.openFile(profile.verificationKey);
  }

  private async openFile(key: string): Promise<PhotoFile> {
    const size = await this.storage.size(key);
    if (size === undefined) throw new NotFoundException('Photo not found');
    return { stream: this.storage.read(key), size };
  }

  // ---- Deck, votes and matches -------------------------------------------------------------------

  async deck(userId: string, now = new Date()): Promise<CardView[]> {
    const profile = await this.allowedProfile(userId, now);
    const filter: DeckFilter = {
      seeking: profile.seeking,
      birthYears: birthYearsFor(profile.ageMin, profile.ageMax, now),
      country: profile.sameCountry && profile.country ? profile.country : undefined,
    };
    // Whoever loved one of my photos comes first.
    const loved = await this.repository.deck(userId, filter, now, DECK_SIZE, true);
    const rest =
      loved.length < DECK_SIZE
        ? await this.repository.deck(userId, filter, now, DECK_SIZE + loved.length, false)
        : [];
    const lovedIds = new Set(loved.map((photo) => photo.id));
    return [...loved, ...rest.filter((photo) => !lovedIds.has(photo.id))]
      .slice(0, DECK_SIZE)
      .map((photo) => this.cardView(photo, lovedIds.has(photo.id)));
  }

  private cardView(
    photo: Pick<SwipePhoto, 'id' | 'ref' | 'width' | 'height'> & {
      owner: {
        swipeProfile: {
          nickname: string | null;
          gender: Gender | null;
          interests: string[];
          bio: string | null;
        } | null;
      };
    },
    lovesYou: boolean,
  ): CardView {
    return {
      id: photo.id,
      ref: photo.ref,
      width: photo.width,
      height: photo.height,
      nickname: photo.owner.swipeProfile?.nickname ?? '—',
      gender: photo.owner.swipeProfile?.gender ?? null,
      interests: knownInterests(photo.owner.swipeProfile?.interests),
      bio: photo.owner.swipeProfile?.bio ?? null,
      lovesYou,
    };
  }

  /**
   * A like or a skip. Liking someone who already liked one of my photos makes a match, returned
   * once (the first time).
   */
  async vote(
    userId: string,
    photoId: string,
    like: boolean,
    superLike = false,
    now = new Date(),
  ): Promise<{ match: { id: string; nickname: string } | null }> {
    await this.allowedProfile(userId, now);
    const photo = await this.repository.findPhoto(photoId);
    if (!photo || photo.status !== 'LIVE' || photo.ownerId === userId) {
      throw new NotFoundException('Photo not found');
    }
    if (await this.repository.isBlockedEitherWay(userId, photo.ownerId)) {
      throw new NotFoundException('Photo not found');
    }
    const loves = like && superLike;
    if (loves && (await this.superLikesLeft(userId, now)) <= 0) {
      throw new HttpException(
        `You can give ${SUPER_LIKES_PER_DAY} «me encanta» a day: try again tomorrow`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const recorded = await this.repository.vote(userId, photo, like, loves, now);
    if (!recorded || !like) return { match: null };
    const match = (await this.repository.hasLikedSomePhotoOf(photo.ownerId, userId))
      ? await this.repository.createMatch(userId, photo.ownerId)
      : null;
    if (match) {
      void this.notifyUser(photo.ownerId, 'match', null, now);
      return { match: { id: match.id, nickname: photo.owner.swipeProfile?.nickname ?? '—' } };
    }
    if (loves && !(await this.repository.hasMatch(userId, photo.ownerId))) {
      void this.notifyUser(photo.ownerId, 'loved', null, now);
    }
    return { match: null };
  }

  /** Undoes my last vote when it is under 10 minutes old and the two of us have no match. */
  async undoVote(userId: string, now = new Date()): Promise<{ card: CardView }> {
    await this.allowedProfile(userId, now);
    const vote = await this.repository.lastVote(userId);
    if (!vote || now.getTime() - vote.createdAt.getTime() > UNDO_WINDOW_MS) {
      throw new NotFoundException('There is no recent swipe to undo');
    }
    if (vote.photo.status !== 'LIVE') throw new NotFoundException('That photo is gone');
    if (await this.repository.hasMatch(userId, vote.ownerId)) {
      throw new ConflictException('That swipe made a match: end the match from the chat instead');
    }
    await this.repository.undoVote(userId, vote.photoId, vote.like);
    const lovesYou = await this.repository.lovesSomePhotoOf(vote.ownerId, userId);
    return { card: this.cardView(vote.photo, lovesYou) };
  }

  async matches(userId: string): Promise<MatchView[]> {
    const matches = await this.repository.matchesOf(userId);
    const partners = matches.map((match) => (match.userAId === userId ? match.userB : match.userA));
    const photos = await this.repository.firstLivePhotos(partners.map((partner) => partner.id));
    return Promise.all(
      matches.map(async (match, index): Promise<MatchView> => {
        const partner = partners[index]!;
        const readAt = match.userAId === userId ? match.readAAt : match.readBAt;
        const last = match.messages[0];
        return {
          id: match.id,
          partner: {
            nickname: partner.swipeProfile?.nickname ?? '—',
            gender: partner.swipeProfile?.gender ?? null,
            interests: knownInterests(partner.swipeProfile?.interests),
            bio: partner.swipeProfile?.bio ?? null,
            photoId: photos.get(partner.id) ?? null,
          },
          lastMessage: last
            ? { text: last.text, mine: last.senderId === userId, at: last.createdAt.toISOString() }
            : null,
          unread: await this.repository.countMessagesFrom(match.id, partner.id, readAt),
          createdAt: match.createdAt.toISOString(),
        };
      }),
    );
  }

  private async myMatch(userId: string, matchId: string) {
    const match = await this.repository.findMatch(matchId);
    if (!match || (match.userAId !== userId && match.userBId !== userId)) {
      throw new NotFoundException('Match not found');
    }
    return { match, partnerId: match.userAId === userId ? match.userBId : match.userAId };
  }

  /** The chat's messages (after `after`, or the last 100); marks them read. */
  async messages(
    userId: string,
    matchId: string,
    after: string | undefined,
    now = new Date(),
  ): Promise<MessageView[]> {
    const { match } = await this.myMatch(userId, matchId);
    const items = await this.repository.messages(match.id, after ? new Date(after) : undefined);
    await this.repository.markRead(match, userId, now);
    return items.map((message) => ({
      id: message.id,
      mine: message.senderId === userId,
      text: message.text,
      createdAt: message.createdAt.toISOString(),
    }));
  }

  async sendMessage(
    userId: string,
    matchId: string,
    text: string,
    now = new Date(),
  ): Promise<MessageView> {
    await this.allowedProfile(userId, now);
    const { match, partnerId } = await this.myMatch(userId, matchId);
    if (sharesContact(text)) {
      const counts = await this.repository.messageCounts(match.id);
      if (
        (counts.get(userId) ?? 0) < SAFE_CHAT_MESSAGES ||
        (counts.get(partnerId) ?? 0) < SAFE_CHAT_MESSAGES
      ) {
        throw new BadRequestException(
          `For your safety, phone numbers, emails, links and other apps can only be shared once you have both sent ${SAFE_CHAT_MESSAGES} messages`,
        );
      }
    }
    const message = await this.repository.addMessage(match, userId, text, now);
    const key = `${match.id}:${partnerId}`;
    if (now.getTime() - (this.messagePushedAt.get(key) ?? 0) > MESSAGE_PUSH_GAP_MS) {
      this.messagePushedAt.set(key, now.getTime());
      if (this.messagePushedAt.size > 5000) this.messagePushedAt.clear();
      void this.push.notify(partnerId, 'message');
    }
    return {
      id: message.id,
      mine: true,
      text: message.text,
      createdAt: message.createdAt.toISOString(),
    };
  }

  /** Ends a match: the chat is deleted for both. */
  async unmatch(userId: string, matchId: string): Promise<void> {
    const { match } = await this.myMatch(userId, matchId);
    await this.repository.deleteMatch(match.id);
  }

  /** Blocks the other person of a match: the match ends and neither sees the other again. */
  async blockMatch(userId: string, matchId: string): Promise<void> {
    const { partnerId } = await this.myMatch(userId, matchId);
    await this.repository.block(userId, partnerId);
  }

  // ---- Reports and removal requests --------------------------------------------------------------

  async report(userId: string, input: ReportInput, now = new Date()): Promise<void> {
    await this.allowedProfile(userId, now);
    if (
      (await this.repository.countReportsSince(userId, new Date(now.getTime() - DAY_MS))) >=
      REPORTS_PER_DAY
    ) {
      throw new HttpException('Too many reports today', HttpStatus.TOO_MANY_REQUESTS);
    }

    let reportedId: string;
    let photoId: string | null = null;
    let transcript: { from: 'reporter' | 'reported'; text: string; at: string }[] = [];

    if (input.photoId) {
      const photo = await this.repository.findPhoto(input.photoId);
      if (!photo || photo.ownerId === userId || photo.status === 'REJECTED') {
        throw new NotFoundException('Photo not found');
      }
      reportedId = photo.ownerId;
      photoId = photo.id;
      if (photo.status === 'LIVE' && HIDE_AT_ONCE.includes(input.reason)) {
        await this.repository.updatePhoto(photo.id, { status: 'HIDDEN' });
      }
      // The reporter doesn't see it again.
      await this.repository.vote(userId, photo, false);
    } else {
      const { match, partnerId } = await this.myMatch(userId, input.matchId as string);
      reportedId = partnerId;
      transcript = (await this.repository.lastMessages(match.id, TRANSCRIPT_LINES)).map(
        (message) => ({
          from: message.senderId === userId ? 'reporter' : 'reported',
          text: message.text,
          at: message.createdAt.toISOString(),
        }),
      );
      await this.repository.block(userId, partnerId);
    }

    const report = await this.repository.createReport({
      reporterId: userId,
      reportedId,
      photoId,
      reason: input.reason,
      details: input.details || null,
      transcript,
      createdAt: now,
    });
    if (input.reason === 'MINOR') this.alert('minor-report', report.id);
  }

  /** A removal request from anyone. A photo it names by reference is hidden at once. */
  async takedown(input: TakedownInput, now = new Date()): Promise<{ id: string }> {
    // The honeypot: pretend it worked.
    if (input.website) return { id: '00000000-0000-0000-0000-000000000000' };
    const ref = input.photoRef ? normalizeRef(input.photoRef) : '';
    const photo = ref.length >= 6 ? await this.repository.findPhotoByRef(ref) : null;
    if (photo && (photo.status === 'LIVE' || photo.status === 'PENDING')) {
      await this.repository.updatePhoto(photo.id, { status: 'HIDDEN' });
    }
    const request = await this.repository.createTakedown({
      email: input.email,
      photoRef: input.photoRef || null,
      photoId: photo?.id ?? null,
      reason: input.reason,
      details: input.details,
      locale: toDbLocale(input.locale),
      createdAt: now,
    });
    this.alert('takedown', request.id);
    this.sendMail(
      takedownEmail(input.email, input.locale, 'received', request.id, null, this.config.siteUrl),
    );
    return { id: request.id };
  }

  private alert(kind: 'minor-report' | 'takedown', id: string): void {
    if (!this.config.leadsNotifyTo) return;
    this.sendMail(swipeAlertEmail(this.config.leadsNotifyTo, kind, id, this.config.siteUrl));
  }

  private sendMail(message: Parameters<MailService['send']>[0]): void {
    this.mail.send(message).catch((error: unknown) => {
      this.logger.error(`Swipe email not sent: ${String(error)}`);
    });
  }

  // ---- Admin -------------------------------------------------------------------------------------

  overview(now = new Date()) {
    return this.repository.overview(now);
  }

  async pendingVerifications() {
    return (await this.repository.pendingVerifications()).map((profile) => ({
      userId: profile.userId,
      nickname: profile.nickname,
      name: profile.user.name,
      email: profile.user.email,
      memberSince: profile.user.createdAt.toISOString(),
      sentAt: profile.verificationSentAt?.toISOString() ?? null,
    }));
  }

  async decideVerification(
    actor: AuthUser,
    userId: string,
    input: VerificationDecision,
  ): Promise<void> {
    const profile = await this.repository.findProfile(userId);
    if (!profile || profile.verificationStatus !== 'PENDING') {
      throw new NotFoundException('No verification waiting for review');
    }
    const user = await this.repository.findUser(userId);
    if (input.approve) {
      await this.repository.updateProfile(userId, {
        verificationStatus: 'APPROVED',
        verificationNote: input.note || null,
        verifiedAt: new Date(),
      });
    } else {
      await this.repository.updateProfile(userId, {
        verificationStatus: 'REJECTED',
        verificationNote: input.note || null,
        verificationKey: null,
      });
      await this.storage.remove(profile.verificationKey);
    }
    void this.notifyUser(
      userId,
      input.approve ? 'verification-approved' : 'verification-rejected',
      input.note || null,
    );
    await this.activity.record(actor, {
      action: input.approve ? 'swipe.verification_approved' : 'swipe.verification_rejected',
      targetId: userId,
      targetLabel: profile.nickname ?? user?.email ?? userId,
    });
  }

  async photos(status: 'PENDING' | 'LIVE' | 'REJECTED' | 'HIDDEN') {
    const photos = await this.repository.photosByStatus(status);
    const counts = await this.repository.reportCounts([...new Set(photos.map((p) => p.ownerId))]);
    return photos.map((photo) => ({
      id: photo.id,
      ref: photo.ref,
      status: photo.status,
      rejectReason: photo.rejectReason,
      likes: photo.likes,
      width: photo.width,
      height: photo.height,
      createdAt: photo.createdAt.toISOString(),
      reviewedAt: photo.reviewedAt?.toISOString() ?? null,
      reviewedBy: photo.reviewedBy,
      owner: {
        id: photo.owner.id,
        name: photo.owner.name,
        email: photo.owner.email,
        memberSince: photo.owner.createdAt.toISOString(),
        nickname: photo.owner.swipeProfile?.nickname ?? null,
        verifiedAt: photo.owner.swipeProfile?.verifiedAt?.toISOString() ?? null,
        hasVerificationPhoto: !!photo.owner.swipeProfile?.verificationKey,
        reports: counts.get(photo.owner.id) ?? 0,
      },
    }));
  }

  private async reviewablePhoto(photoId: string) {
    const photo = await this.repository.findPhoto(photoId);
    if (!photo) throw new NotFoundException('Photo not found');
    return photo;
  }

  async approvePhoto(actor: AuthUser, photoId: string, now = new Date()): Promise<void> {
    const photo = await this.reviewablePhoto(photoId);
    if (photo.status !== 'PENDING' && photo.status !== 'HIDDEN') {
      throw new ConflictException('Only pending or hidden photos can be published');
    }
    await this.repository.updatePhoto(photo.id, {
      status: 'LIVE',
      rejectReason: null,
      reviewedById: actor.id,
      reviewedAt: now,
    });
    // Only a first publication is news; one that comes back after a report isn't mailed.
    if (photo.status === 'PENDING') void this.notifyUser(photo.ownerId, 'photo-live', null, now);
    await this.activity.record(actor, {
      action: 'swipe.photo_approved',
      targetId: photo.id,
      targetLabel: photo.ref,
    });
  }

  /** Rejects or removes a photo for good: its file is deleted, and with `block` its image too. */
  async rejectPhoto(
    actor: AuthUser,
    photoId: string,
    reason: string,
    block: boolean,
    blockReason: ReportReason = 'OTHER',
    now = new Date(),
  ): Promise<void> {
    const photo = await this.reviewablePhoto(photoId);
    if (block) await this.repository.blockHash(photo.hash, blockReason);
    await this.repository.updatePhoto(photo.id, {
      status: 'REJECTED',
      rejectReason: reason,
      reviewedById: actor.id,
      reviewedAt: now,
    });
    await this.storage.remove(photo.storageKey);
    // The owner is told why (EU Digital Services Act, statement of reasons).
    if (photo.status !== 'REJECTED') {
      void this.notifyUser(photo.ownerId, 'photo-rejected', reason, now);
    }
    await this.activity.record(actor, {
      action: 'swipe.photo_rejected',
      targetId: photo.id,
      targetLabel: photo.ref,
      details: { reason, blocked: block },
    });
  }

  /** Takes a live photo down for now (it can be published again). */
  async hidePhoto(actor: AuthUser, photoId: string, now = new Date()): Promise<void> {
    const photo = await this.reviewablePhoto(photoId);
    if (photo.status !== 'LIVE') throw new ConflictException('Only live photos can be hidden');
    await this.repository.updatePhoto(photo.id, {
      status: 'HIDDEN',
      reviewedById: actor.id,
      reviewedAt: now,
    });
    await this.activity.record(actor, {
      action: 'swipe.photo_hidden',
      targetId: photo.id,
      targetLabel: photo.ref,
    });
  }

  async reports(status: 'OPEN' | 'DISMISSED' | 'ACTIONED') {
    const reports = await this.repository.reports(status);
    const counts = await this.repository.reportCounts([
      ...new Set(reports.map((r) => r.reportedId)),
    ]);
    return reports.map((report) => ({
      id: report.id,
      reason: report.reason,
      details: report.details,
      transcript: report.transcript,
      status: report.status,
      createdAt: report.createdAt.toISOString(),
      reviewedAt: report.reviewedAt?.toISOString() ?? null,
      reviewedBy: report.reviewedBy,
      photo: report.photo,
      reporter: {
        id: report.reporter.id,
        name: report.reporter.name,
        email: report.reporter.email,
        nickname: report.reporter.swipeProfile?.nickname ?? null,
      },
      reported: {
        id: report.reported.id,
        name: report.reported.name,
        email: report.reported.email,
        nickname: report.reported.swipeProfile?.nickname ?? null,
        suspended: isSuspended(report.reported.swipeProfile),
        reports: counts.get(report.reported.id) ?? 0,
      },
    }));
  }

  private async openReport(reportId: string) {
    const report = await this.repository.findReport(reportId);
    if (!report || report.status !== 'OPEN') throw new NotFoundException('No open report');
    return report;
  }

  /** Nothing wrong: a photo it hid goes back up, unless something else still holds it. */
  async dismissReport(actor: AuthUser, reportId: string, now = new Date()): Promise<void> {
    const report = await this.openReport(reportId);
    await this.repository.closeReport(report.id, 'DISMISSED', actor.id, now);
    const photo = report.photo;
    if (
      photo?.status === 'HIDDEN' &&
      (await this.repository.countOpenReportsOn(photo.id)) === 0 &&
      (await this.repository.countOpenTakedownsOn(photo.id)) === 0
    ) {
      await this.repository.updatePhoto(photo.id, { status: 'LIVE' });
    }
    const reported = await this.repository.findUser(report.reportedId);
    await this.activity.record(actor, {
      action: 'swipe.report_dismissed',
      targetId: report.reportedId,
      targetLabel: reported?.email ?? report.reportedId,
    });
  }

  async actOnReport(
    actor: AuthUser,
    reportId: string,
    input: ReportActionInput,
    now = new Date(),
  ): Promise<void> {
    const report = await this.openReport(reportId);
    if (input.removePhoto && report.photo) {
      await this.rejectPhoto(
        actor,
        report.photo.id,
        `Report: ${report.reason}`,
        input.blockImage,
        report.reason,
        now,
      );
    }
    if (input.suspend) {
      await this.suspend(
        actor,
        report.reportedId,
        { duration: input.suspend, reason: `Report: ${report.reason}` },
        now,
      );
    }
    await this.repository.closeReport(report.id, 'ACTIONED', actor.id, now);
    const reported = await this.repository.findUser(report.reportedId);
    await this.activity.record(actor, {
      action: 'swipe.report_actioned',
      targetId: report.reportedId,
      targetLabel: reported?.email ?? report.reportedId,
      details: { removePhoto: input.removePhoto, suspend: input.suspend },
    });
  }

  async takedowns(status: 'OPEN' | 'REMOVED' | 'CLOSED') {
    return (await this.repository.takedowns(status)).map((request) => ({
      id: request.id,
      email: request.email,
      photoRef: request.photoRef,
      reason: request.reason,
      details: request.details,
      locale: toApiLocale(request.locale),
      status: request.status,
      response: request.response,
      createdAt: request.createdAt.toISOString(),
      reviewedAt: request.reviewedAt?.toISOString() ?? null,
      reviewedBy: request.reviewedBy,
      photo: request.photo
        ? {
            id: request.photo.id,
            ref: request.photo.ref,
            status: request.photo.status,
            owner: {
              id: request.photo.owner.id,
              name: request.photo.owner.name,
              email: request.photo.owner.email,
              nickname: request.photo.owner.swipeProfile?.nickname ?? null,
            },
          }
        : null,
    }));
  }

  async decideTakedown(
    actor: AuthUser,
    takedownId: string,
    input: TakedownDecision,
    now = new Date(),
  ): Promise<void> {
    const request = await this.repository.findTakedown(takedownId);
    if (!request || request.status !== 'OPEN')
      throw new NotFoundException('No open removal request');
    const photo = request.photo;
    if (input.remove && photo) {
      await this.rejectPhoto(
        actor,
        photo.id,
        `Removal request: ${request.reason}`,
        true,
        request.reason,
        now,
      );
    } else if (
      !input.remove &&
      photo?.status === 'HIDDEN' &&
      (await this.repository.countOpenReportsOn(photo.id)) === 0 &&
      (await this.repository.countOpenTakedownsOn(photo.id, request.id)) === 0
    ) {
      await this.repository.updatePhoto(photo.id, { status: 'LIVE' });
    }
    const status = input.remove ? 'REMOVED' : 'CLOSED';
    await this.repository.closeTakedown(request.id, status, input.response || null, actor.id, now);
    await this.activity.record(actor, {
      action: input.remove ? 'swipe.takedown_removed' : 'swipe.takedown_closed',
      targetId: request.id,
      targetLabel: request.photoRef ?? request.id.slice(0, 8),
    });
    this.sendMail(
      takedownEmail(
        request.email,
        toApiLocale(request.locale),
        input.remove ? 'removed' : 'closed',
        request.id,
        input.response || null,
        this.config.siteUrl,
      ),
    );
  }

  async suspend(
    actor: AuthUser,
    userId: string,
    input: SuspendUserInput,
    now = new Date(),
  ): Promise<void> {
    const profile = await this.repository.findProfile(userId);
    if (!profile) throw new NotFoundException('Not a Swipe member');
    await this.repository.updateProfile(userId, {
      suspendedAt: now,
      suspendedUntil: suspensionEnd(input.duration, now),
      suspensionReason: input.reason,
    });
    const user = await this.repository.findUser(userId);
    await this.activity.record(actor, {
      action: 'swipe.suspended',
      targetId: userId,
      targetLabel: user?.email ?? userId,
      details: { duration: input.duration, reason: input.reason },
    });
  }

  async unsuspend(actor: AuthUser, userId: string, now = new Date()): Promise<void> {
    const profile = await this.repository.findProfile(userId);
    if (!profile || !isSuspended(profile, now)) throw new NotFoundException('Not suspended');
    await this.repository.updateProfile(userId, {
      suspendedAt: null,
      suspendedUntil: null,
      suspensionReason: null,
    });
    const user = await this.repository.findUser(userId);
    await this.activity.record(actor, {
      action: 'swipe.unsuspended',
      targetId: userId,
      targetLabel: user?.email ?? userId,
    });
  }

  async suspensions(now = new Date()) {
    return (await this.repository.suspendedProfiles(now)).map((profile) => ({
      user: profile.user,
      nickname: profile.nickname,
      suspendedAt: profile.suspendedAt?.toISOString() ?? null,
      until: profile.suspendedUntil?.toISOString() ?? null,
      reason: profile.suspensionReason,
    }));
  }
}
