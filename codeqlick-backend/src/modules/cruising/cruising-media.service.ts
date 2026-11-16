import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { open, readFile } from 'node:fs/promises';
import type { ReadStream } from 'node:fs';
import { toApiLocale } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { CruisingMedia, CruisingProfile } from '../../generated/prisma/client.js';
import { ActivityService } from '../activity/activity.service.js';
import { MailService } from '../mail/mail.service.js';
import { isBlockedImage, processImage, watermark } from '../swipe/swipe-image.js';
import { newRef } from '../swipe/swipe.service.js';
import { detectImageType } from '../media/image-type.js';
import { cruisingNoticeEmail, type CruisingNotice } from './cruising-emails.js';
import { CruisingFfmpeg } from './cruising-ffmpeg.js';
import { CruisingMediaRepository, type AdminMediaQueue } from './cruising-media.repository.js';
import {
  canSeeMedia,
  coverOf,
  cruisingWatermark,
  detectVideoType,
  hasRoom,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
  MAX_VIDEOS,
  parseRange,
  posterTime,
  reorder,
  UPLOADS_PER_DAY,
  useDailyAllowance,
  VERIFICATIONS_PER_DAY,
  videoLengthAllowed,
  type ByteRange,
  type MediaAlbum,
  type MediaFailure,
  type MediaKind,
  type MediaStatus,
} from './cruising-media.rules.js';
import { CruisingMediaStorage } from './cruising-media.storage.js';
import { isSuspended } from './cruising.rules.js';
import { CruisingRepository } from './cruising.repository.js';
import type { MediaPatch, VerificationDecision } from './cruising.schemas.js';

/** The orphan cleanup: first run a minute after start, then every 6 hours. */
const CLEANUP_FIRST_MS = 60_000;
const CLEANUP_EVERY_MS = 6 * 60 * 60 * 1000;
/** A file nothing points to is deleted once it is this old (an upload may still be saving it). */
const ORPHAN_AGE_MS = 60 * 60 * 1000;
/** An upload left in the work folder (not waiting for the transcoder) is deleted after this. */
const STALE_UPLOAD_MS = 2 * 60 * 60 * 1000;

/** A file multer received (diskStorage). */
export interface ReceivedFile {
  path: string;
  size: number;
}

export interface VerificationState {
  status: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  note: string | null;
}

export interface MyMediaView {
  id: string;
  ref: string;
  kind: MediaKind;
  /** Phase 6: the public profile or the private album. */
  album: MediaAlbum;
  status: MediaStatus;
  /** The effective cover: the chosen photo, else the first LIVE photo. */
  cover: boolean;
  position: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  failure: string | null;
  createdAt: string;
}

export interface MemberMediaView {
  id: string;
  ref: string;
  kind: MediaKind;
  /** PRIVATE items reach only the members the owner shared the album with. */
  album: MediaAlbum;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  cover: boolean;
}

/** A file to stream: the whole of it, or a range. */
export interface MediaFile {
  stream: ReadStream;
  contentType: 'image/webp' | 'video/mp4';
  size: number;
  /** Set for a 206. */
  range: ByteRange | null;
}

export type MediaFileResult = MediaFile | { unsatisfiable: true; size: number };

/** The badge's state as `/me` and the media list show it. */
export function verificationState(
  profile: Pick<CruisingProfile, 'verificationStatus' | 'verificationNote'> | null,
): VerificationState {
  return {
    status: profile?.verificationStatus ?? 'NONE',
    note: profile?.verificationNote ?? null,
  };
}

/**
 * Cruising's profile photos and videos and the verification of the person (architecture 4.15,
 * phase 4, decision 87): verified members upload; items are LIVE as soon as they are processed and
 * wait in the team's "New media" queue; files are private and stream only to who may see them.
 */
@Injectable()
export class CruisingMediaService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CruisingMediaService.name);
  private timers: NodeJS.Timeout[] = [];
  /** Videos waiting for the transcoder: one runs at a time. */
  private readonly queue: string[] = [];
  private draining: Promise<void> | null = null;

  constructor(
    private readonly media: CruisingMediaRepository,
    private readonly repository: CruisingRepository,
    private readonly storage: CruisingMediaStorage,
    private readonly ffmpeg: CruisingFfmpeg,
    private readonly activity: ActivityService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.isTest) return;
    void this.resumeQueue();
    const first = setTimeout(() => {
      void this.cleanupFiles();
      this.timers.push(setInterval(() => void this.cleanupFiles(), CLEANUP_EVERY_MS).unref());
    }, CLEANUP_FIRST_MS).unref();
    this.timers.push(first);
  }

  onApplicationShutdown(): void {
    for (const timer of this.timers) clearTimeout(timer);
  }

  // ---- Background --------------------------------------------------------------------------------

  /** After a restart: videos still waiting go back in the queue; those without their file fail. */
  async resumeQueue(): Promise<void> {
    try {
      for (const id of await this.media.processingIds()) {
        if (await this.storage.exists(this.storage.incomingPath(id))) this.enqueue(id);
        else await this.media.failVideo(id, 'interrupted' satisfies MediaFailure);
      }
    } catch (error) {
      this.logger.error(`Cruising video queue not resumed: ${String(error)}`);
    }
  }

  /** Deletes files no row points to (deleted items and accounts, failed saves) and stale uploads. */
  async cleanupFiles(now = new Date()): Promise<number> {
    try {
      const [files, used, incoming] = await Promise.all([
        this.storage.list(),
        this.media.storageKeys(),
        this.storage.listIncoming(),
      ]);
      const orphans = files.filter(
        (file) => !used.has(file.key) && now.getTime() - file.modifiedAt.getTime() > ORPHAN_AGE_MS,
      );
      for (const file of orphans) await this.storage.remove(file.key);
      const waiting = new Set([...this.queue, ...(await this.media.processingIds())]);
      const stale = incoming.filter(
        (file) =>
          !(file.mediaId && waiting.has(file.mediaId)) &&
          now.getTime() - file.modifiedAt.getTime() > STALE_UPLOAD_MS,
      );
      for (const file of stale) await this.storage.removePath(file.path);
      return orphans.length + stale.length;
    } catch (error) {
      this.logger.error(`Cruising file cleanup failed: ${String(error)}`);
      return 0;
    }
  }

  private enqueue(id: string): void {
    this.queue.push(id);
    if (!this.draining) {
      this.draining = this.drain().finally(() => {
        this.draining = null;
      });
    }
  }

  private async drain(): Promise<void> {
    for (let id = this.queue.shift(); id; id = this.queue.shift()) {
      await this.transcode(id);
    }
  }

  /** Resolves once the transcoding queue is empty (tests and shutdown). */
  async idle(): Promise<void> {
    while (this.draining) await this.draining;
  }

  /**
   * Transcodes a waiting video: H.264/AAC MP4 ≤ 720p ≤ 60 s without metadata, plus a watermarked
   * WebP poster whose hash is checked against the blocked images. LIVE when done, FAILED (file
   * deleted) when it can't be read.
   */
  private async transcode(id: string): Promise<void> {
    const input = this.storage.incomingPath(id);
    const output = this.storage.outputPath(id);
    let videoKey: string | undefined;
    let posterKey: string | undefined;
    try {
      const item = await this.media.findMedia(id);
      if (!item || item.status !== 'PROCESSING') return;
      let failure: MediaFailure = 'unreadable';
      try {
        await this.ffmpeg.transcode(input, output);
        const probe = await this.ffmpeg.probe(output);
        if (!probe) throw new Error('The transcoded video cannot be read');
        if (!videoLengthAllowed(probe.duration)) {
          failure = 'too-long';
          throw new Error('Longer than 60 seconds');
        }
        const frame = await this.ffmpeg.poster(output, posterTime(probe.duration));
        const poster = await processImage(frame);
        if (!poster) throw new Error('The poster frame cannot be read');
        if (isBlockedImage(poster.hash, await this.media.blockedHashes())) {
          failure = 'blocked';
          throw new Error('A removed image');
        }
        const nickname = item.owner.cruisingProfile?.nickname;
        posterKey = await this.storage.write(
          await watermark(poster.data, cruisingWatermark(nickname)),
        );
        videoKey = await this.storage.adopt(output, 'mp4');
        const done = await this.media.finishVideo(id, {
          storageKey: videoKey,
          posterKey,
          width: probe.width,
          height: probe.height,
          durationSeconds: probe.durationSeconds,
          hash: poster.hash,
        });
        // Deleted while it was being transcoded: its files go now.
        if (!done) {
          await this.storage.remove(videoKey);
          await this.storage.remove(posterKey);
        }
      } catch (error) {
        this.logger.warn(`Cruising video ${id} failed: ${String(error)}`);
        await this.storage.remove(videoKey);
        await this.storage.remove(posterKey);
        await this.media.failVideo(id, failure);
      }
    } catch (error) {
      this.logger.error(`Cruising video ${id} not processed: ${String(error)}`);
    } finally {
      await this.storage.removePath(input).catch(() => undefined);
      await this.storage.removePath(output).catch(() => undefined);
    }
  }

  // ---- Who may do what ---------------------------------------------------------------------------

  /** A member who entered with the current rules (a suspended one can still look). */
  private async entered(userId: string): Promise<CruisingProfile> {
    const profile = await this.repository.findProfile(userId);
    if (!profile || profile.termsVersion !== this.config.cruisingTermsVersion) {
      throw new ForbiddenException('Confirm your age and accept the rules first');
    }
    return profile;
  }

  private async allowed(userId: string, now: Date): Promise<CruisingProfile> {
    const profile = await this.entered(userId);
    if (isSuspended(profile, now)) throw new ForbiddenException('Your account is suspended');
    return profile;
  }

  private sendMail(message: Parameters<MailService['send']>[0]): void {
    this.mail.send(message).catch((error: unknown) => {
      this.logger.error(`Cruising email not sent: ${String(error)}`);
    });
  }

  /** The team's decisions about media and verification are always mailed (nothing in them). */
  private async notify(userId: string, notice: CruisingNotice, note: string | null = null) {
    try {
      const user = await this.repository.recipient(userId);
      if (!user) return;
      this.sendMail(
        cruisingNoticeEmail(
          user.email,
          toApiLocale(user.locale),
          notice,
          note,
          this.config.webappUrl('cruising'),
          this.config.siteUrl,
        ),
      );
    } catch (error) {
      this.logger.error(`Cruising notice not sent: ${String(error)}`);
    }
  }

  /** The first bytes of a received file, to tell what it is. */
  private async head(path: string): Promise<Buffer> {
    const handle = await open(path, 'r');
    try {
      const buffer = Buffer.alloc(64);
      const { bytesRead } = await handle.read(buffer, 0, 64, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  // ---- Verification ------------------------------------------------------------------------------

  /**
   * The verification photo: the member holding a paper with their nickname, "Cruising" and the
   * date. Once; only the team sees it, and it is deleted once reviewed. 5 a day.
   */
  async uploadVerification(
    userId: string,
    file: ReceivedFile | undefined,
    now = new Date(),
  ): Promise<{ status: 'PENDING' }> {
    try {
      const profile = await this.allowed(userId, now);
      if (!profile.nickname) throw new ConflictException('Choose your nickname first');
      if (profile.verificationStatus === 'APPROVED') {
        throw new ConflictException('You are verified already');
      }
      if (profile.verificationStatus === 'PENDING') {
        throw new ConflictException('Your verification photo is waiting for the team');
      }
      if (!file) throw new BadRequestException('Send the photo in a multipart field called "file"');
      if (file.size > MAX_PHOTO_BYTES) throw new PayloadTooLargeException('Photos up to 10 MB');
      const allowance = useDailyAllowance(
        profile.verificationTries,
        profile.verificationTriesSince,
        VERIFICATIONS_PER_DAY,
        now,
      );
      if (!allowance) {
        throw new HttpException(
          'Too many verification photos today: try again tomorrow',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      const image = await processImage(await readFile(file.path));
      if (!image) throw new BadRequestException('Only PNG, JPEG and WebP photos are accepted');
      const key = await this.storage.write(image.data);
      await this.repository.updateProfile(userId, {
        verificationStatus: 'PENDING',
        verificationKey: key,
        verificationNote: null,
        verificationSentAt: now,
        verificationTries: allowance.count,
        verificationTriesSince: allowance.since,
      });
      await this.storage.remove(profile.verificationKey);
      return { status: 'PENDING' };
    } finally {
      await this.storage.removePath(file?.path);
    }
  }

  /** My verification photo while it waits. */
  async myVerificationFile(userId: string): Promise<MediaFile> {
    const profile = await this.repository.findProfile(userId);
    const key = profile?.verificationKey;
    const size = key ? await this.storage.size(key) : undefined;
    if (!key || size === undefined) throw new NotFoundException('No verification photo');
    return { stream: this.storage.read(key), contentType: 'image/webp', size, range: null };
  }

  async pendingVerifications() {
    return (await this.media.pendingVerifications()).map((profile) => ({
      userId: profile.userId,
      nickname: profile.nickname,
      name: profile.user.name,
      email: profile.user.email,
      memberSince: profile.user.createdAt.toISOString(),
      sentAt: profile.verificationSentAt?.toISOString() ?? null,
    }));
  }

  async verificationFile(userId: string): Promise<MediaFile> {
    return this.myVerificationFile(userId);
  }

  /** Approves or rejects a verification photo; the photo is deleted either way. */
  async decideVerification(
    actor: AuthUser,
    userId: string,
    input: VerificationDecision,
    now = new Date(),
  ): Promise<void> {
    const profile = await this.repository.findProfile(userId);
    if (!profile || profile.verificationStatus !== 'PENDING') {
      throw new NotFoundException('No verification waiting for review');
    }
    await this.repository.updateProfile(userId, {
      verificationStatus: input.approve ? 'APPROVED' : 'REJECTED',
      verificationNote: input.note || null,
      verificationKey: null,
      verifiedAt: input.approve ? now : null,
    });
    await this.storage.remove(profile.verificationKey);
    await this.activity.record(actor, {
      action: input.approve ? 'cruising.verification_approved' : 'cruising.verification_rejected',
      targetId: userId,
      targetLabel: profile.nickname ?? userId,
    });
    await this.notify(
      userId,
      input.approve ? 'verification-approved' : 'verification-rejected',
      input.note || null,
    );
  }

  /** Takes the "Verified" badge away (on a report or a suspension); the member is told. */
  async withdrawVerification(actor: AuthUser, userId: string): Promise<void> {
    const profile = await this.repository.findProfile(userId);
    if (!profile || profile.verificationStatus !== 'APPROVED') {
      throw new NotFoundException('Not verified');
    }
    await this.repository.updateProfile(userId, {
      verificationStatus: 'NONE',
      verificationNote: null,
      verifiedAt: null,
    });
    await this.activity.record(actor, {
      action: 'cruising.verification_revoked',
      targetId: userId,
      targetLabel: profile.nickname ?? userId,
    });
    await this.notify(userId, 'verification-withdrawn');
  }

  // ---- My media ----------------------------------------------------------------------------------

  private myView(item: CruisingMedia, coverId: string | null): MyMediaView {
    return {
      id: item.id,
      ref: item.ref,
      kind: item.kind,
      album: item.album,
      status: item.status,
      cover: item.id === coverId,
      position: item.position,
      width: item.width,
      height: item.height,
      durationSeconds: item.durationSeconds,
      failure: item.failure,
      createdAt: item.createdAt.toISOString(),
    };
  }

  async myMedia(userId: string) {
    const profile = await this.entered(userId);
    const items = await this.media.mediaOf(userId);
    const coverId = coverOf(items);
    return {
      items: items.map((item) => this.myView(item, coverId)),
      verification: verificationState(profile),
      limits: { photos: MAX_PHOTOS, videos: MAX_VIDEOS, perDay: UPLOADS_PER_DAY },
    };
  }

  private async uniqueRef(): Promise<string> {
    for (;;) {
      const ref = newRef();
      if (!(await this.media.refTaken(ref))) return ref;
    }
  }

  /**
   * An upload (a photo or a video), with the member's explicit consent, into the public profile or
   * the private album (each with its own limits). Photos are re-encoded and LIVE at once; videos
   * wait for the transcoder (PROCESSING). The received file is always deleted or moved into the
   * queue.
   */
  async upload(
    userId: string,
    file: ReceivedFile | undefined,
    consent: string | undefined,
    now = new Date(),
    album: MediaAlbum = 'PUBLIC',
  ): Promise<MyMediaView> {
    try {
      const profile = await this.allowed(userId, now);
      // Verification is optional (owner's decision, 2026-11-16): it only gives the badge.
      if (!profile.nickname) {
        throw new ConflictException('Choose a nickname before adding photos and videos');
      }
      if (consent !== 'true') {
        throw new BadRequestException('Confirm who appears and that you want it here');
      }
      if (!file) throw new BadRequestException('Send the file in a multipart field called "file"');
      if (await this.storage.diskLow()) {
        throw new HttpException(
          'Uploads are paused for a while: try again later',
          HttpStatus.INSUFFICIENT_STORAGE,
        );
      }
      const head = await this.head(file.path);
      const isImage = ['png', 'jpg', 'webp'].includes(detectImageType(head) ?? '');
      const isVideo = !isImage && !!detectVideoType(head);
      if (!isImage && !isVideo) {
        throw new BadRequestException('Only JPEG, PNG or WebP photos and MP4, MOV or WebM videos');
      }
      const kind: MediaKind = isImage ? 'PHOTO' : 'VIDEO';
      if (kind === 'PHOTO' && file.size > MAX_PHOTO_BYTES) {
        throw new PayloadTooLargeException('Photos up to 10 MB');
      }
      await this.needRoom(userId, kind, album);
      const allowance = useDailyAllowance(
        profile.uploads,
        profile.uploadsSince,
        UPLOADS_PER_DAY,
        now,
      );
      if (!allowance) {
        throw new HttpException(
          'Too many uploads today: try again tomorrow',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      const item =
        kind === 'PHOTO'
          ? await this.savePhoto(userId, profile.nickname, file, now, album)
          : await this.queueVideo(userId, file, now, album);
      await this.repository.updateProfile(userId, {
        uploads: allowance.count,
        uploadsSince: allowance.since,
      });
      const coverId = coverOf(await this.media.mediaOf(userId));
      return this.myView(item, coverId);
    } finally {
      // A video was moved into the queue already; anything else goes.
      await this.storage.removePath(file?.path);
    }
  }

  /** 409 when the album has no room for another item of `kind`. */
  private async needRoom(userId: string, kind: MediaKind, album: MediaAlbum): Promise<void> {
    const active = await this.media.countActive(userId, album);
    if (!hasRoom(kind, active.photos, active.videos)) {
      const where = album === 'PRIVATE' ? ' in your private album' : '';
      throw new ConflictException(
        kind === 'PHOTO'
          ? `You can have up to ${MAX_PHOTOS} photos${where}: delete one first`
          : `You can have up to ${MAX_VIDEOS} videos${where}: delete one first`,
      );
    }
  }

  private async savePhoto(
    userId: string,
    nickname: string,
    file: ReceivedFile,
    now: Date,
    album: MediaAlbum,
  ): Promise<CruisingMedia> {
    const image = await processImage(await readFile(file.path));
    if (!image) throw new BadRequestException('Only PNG, JPEG and WebP photos are accepted');
    if (isBlockedImage(image.hash, await this.media.blockedHashes())) {
      throw new BadRequestException('This image was removed from Cruising and cannot be uploaded');
    }
    // The hash is the clean image's; the stored file carries the watermark.
    const storageKey = await this.storage.write(
      await watermark(image.data, cruisingWatermark(nickname)),
    );
    try {
      return await this.media.createMedia({
        ref: await this.uniqueRef(),
        ownerId: userId,
        kind: 'PHOTO',
        album,
        status: 'LIVE',
        storageKey,
        width: image.width,
        height: image.height,
        hash: image.hash,
        position: await this.media.nextPosition(userId),
        createdAt: now,
      });
    } catch (error) {
      await this.storage.remove(storageKey);
      throw error;
    }
  }

  private async queueVideo(
    userId: string,
    file: ReceivedFile,
    now: Date,
    album: MediaAlbum,
  ): Promise<CruisingMedia> {
    const probe = await this.ffmpeg.probe(file.path);
    if (!probe) throw new BadRequestException('This video cannot be read');
    if (!videoLengthAllowed(probe.duration)) {
      throw new BadRequestException('Videos can be up to 60 seconds long');
    }
    const item = await this.media.createMedia({
      ref: await this.uniqueRef(),
      ownerId: userId,
      kind: 'VIDEO',
      album,
      status: 'PROCESSING',
      durationSeconds: probe.durationSeconds,
      position: await this.media.nextPosition(userId),
      createdAt: now,
    });
    try {
      await this.storage.queueUpload(file.path, item.id);
    } catch (error) {
      await this.media.deleteMedia(item.id);
      throw error;
    }
    this.enqueue(item.id);
    return item;
  }

  private async mine(userId: string, mediaId: string): Promise<CruisingMedia> {
    const item = await this.media.findMedia(mediaId);
    if (!item || item.ownerId !== userId) throw new NotFoundException('Not found');
    return item;
  }

  /**
   * Moves an item into the other album (phase 6: no new review; the cover leaves for the private
   * album as an ordinary photo), chooses the cover photo and/or moves an item in my order.
   */
  async updateMedia(userId: string, mediaId: string, patch: MediaPatch): Promise<void> {
    await this.entered(userId);
    const item = await this.mine(userId, mediaId);
    const album = patch.album ?? item.album;
    if (patch.cover && (item.kind !== 'PHOTO' || item.status !== 'LIVE' || album !== 'PUBLIC')) {
      throw new ConflictException('Only a live photo of your profile can be the cover');
    }
    if (album !== item.album) {
      await this.needRoom(userId, item.kind, album);
      await this.media.updateMedia(item.id, {
        album,
        ...(album === 'PRIVATE' ? { cover: false } : {}),
      });
    }
    if (patch.cover) await this.media.setCover(userId, item.id);
    if (patch.position !== undefined) {
      const ids = (await this.media.mediaOf(userId)).map((other) => other.id);
      await this.media.setPositions(userId, reorder(ids, item.id, patch.position));
    }
  }

  /** Deletes one of my items; its files go at once (the cleanup catches anything left). */
  async deleteMedia(userId: string, mediaId: string): Promise<void> {
    const item = await this.mine(userId, mediaId);
    await this.media.deleteMedia(item.id);
    await this.storage.remove(item.storageKey);
    await this.storage.remove(item.posterKey);
  }

  // ---- Seeing media ------------------------------------------------------------------------------

  /**
   * A member's LIVE media, for their profile page (seen like the profile); their private album's
   * too when they shared it with me (decision 99), or when it is mine.
   */
  async memberMedia(
    viewerId: string,
    nickname: string,
    now = new Date(),
  ): Promise<{ items: MemberMediaView[] }> {
    const viewer = await this.entered(viewerId);
    if (!viewer.nickname) throw new ConflictException('Choose a nickname first');
    const target = await this.repository.findProfileByNickname(nickname);
    if (!target || isSuspended(target, now)) throw new NotFoundException('Member not found');
    if (
      target.userId !== viewerId &&
      (await this.repository.hiddenIds(viewerId)).includes(target.userId)
    ) {
      throw new NotFoundException('Member not found');
    }
    const withPrivate =
      target.userId === viewerId || (await this.media.isGranted(target.userId, viewerId));
    const items = await this.media.liveMediaOf(target.userId, withPrivate);
    const coverId = coverOf(items);
    return {
      items: items.map((item) => ({
        id: item.id,
        ref: item.ref,
        kind: item.kind,
        album: item.album,
        width: item.width,
        height: item.height,
        durationSeconds: item.durationSeconds,
        cover: item.id === coverId,
      })),
    };
  }

  /** Whether a person may see an item (`canSeeMedia`, with what it needs read from the database). */
  async visibleTo(
    viewer: { id: string; isAdmin: boolean },
    item: {
      ownerId: string;
      status: MediaStatus;
      album?: MediaAlbum;
      owner: { cruisingProfile: { suspendedAt: Date | null; suspendedUntil: Date | null } | null };
    },
    now = new Date(),
  ): Promise<boolean> {
    if (viewer.id === item.ownerId || viewer.isAdmin) return true;
    if (item.status !== 'LIVE') return false;
    // A private album's item needs the owner's grant (decision 99).
    const granted =
      item.album === 'PRIVATE' && (await this.media.isGranted(item.ownerId, viewer.id));
    if (item.album === 'PRIVATE' && !granted) return false;
    const profile = await this.repository.findProfile(viewer.id);
    return canSeeMedia({
      viewerId: viewer.id,
      viewerIsAdmin: false,
      viewerEntered: !!profile && profile.termsVersion === this.config.cruisingTermsVersion,
      viewerHasNickname: !!profile?.nickname,
      ownerId: item.ownerId,
      status: item.status,
      ownerSuspended: isSuspended(item.owner.cruisingProfile, now),
      blocked: (await this.repository.hiddenIds(viewer.id)).includes(item.ownerId),
      album: item.album,
      granted,
    });
  }

  /**
   * A media file (or a video's poster) for its owner, the team, or an entered member with a
   * nickname who can see the profile (and, for the private album, was granted it); 404 for anyone
   * else. `rangeHeader` asks for part of it.
   */
  async file(
    viewer: AuthUser,
    mediaId: string,
    which: 'file' | 'poster',
    rangeHeader: string | undefined,
    now = new Date(),
  ): Promise<MediaFileResult> {
    const item = await this.media.findMedia(mediaId);
    if (
      !item ||
      !(await this.visibleTo({ id: viewer.id, isAdmin: viewer.role === 'ADMIN' }, item, now))
    ) {
      throw new NotFoundException('Not found');
    }
    if (which === 'poster') {
      if (!item.posterKey) throw new NotFoundException('Not found');
      return this.openFile(item.posterKey, 'image/webp', rangeHeader);
    }
    if (!item.storageKey) throw new NotFoundException('Not found');
    return this.openFile(
      item.storageKey,
      item.kind === 'VIDEO' ? 'video/mp4' : 'image/webp',
      rangeHeader,
    );
  }

  private async openFile(
    key: string,
    contentType: MediaFile['contentType'],
    rangeHeader: string | undefined,
  ): Promise<MediaFileResult> {
    const size = await this.storage.size(key);
    if (size === undefined) throw new NotFoundException('Not found');
    const range = parseRange(rangeHeader, size);
    if (range === 'unsatisfiable') return { unsatisfiable: true, size };
    return { stream: this.storage.read(key, range ?? undefined), contentType, size, range };
  }

  // ---- Moderation --------------------------------------------------------------------------------

  async adminMedia(queue: AdminMediaQueue, now = new Date()) {
    return (await this.media.adminMedia(queue)).map((item) => ({
      id: item.id,
      ref: item.ref,
      kind: item.kind,
      status: item.status,
      width: item.width,
      height: item.height,
      durationSeconds: item.durationSeconds,
      failure: item.failure,
      reviewedAt: item.reviewedAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      openReports: item._count.reports,
      owner: {
        userId: item.owner.id,
        name: item.owner.name,
        email: item.owner.email,
        nickname: item.owner.cruisingProfile?.nickname ?? null,
        verified: item.owner.cruisingProfile?.verificationStatus === 'APPROVED',
        suspended: isSuspended(item.owner.cruisingProfile, now),
      },
    }));
  }

  /** Seen by a moderator: it leaves the queue; a hidden one nothing else holds goes back LIVE. */
  async markReviewed(actor: AuthUser, mediaId: string, now = new Date()): Promise<void> {
    const item = await this.media.findMedia(mediaId);
    if (!item) throw new NotFoundException('Not found');
    const restore =
      item.status === 'HIDDEN' &&
      (await this.media.countOpenReportsOnMedia(item.id)) === 0 &&
      (await this.media.countOpenTakedownsOnMedia(item.id)) === 0;
    await this.media.markReviewed(item.id, actor.id, now, restore ? 'LIVE' : undefined);
    await this.activity.record(actor, {
      action: 'cruising.media_reviewed',
      targetId: item.id,
      targetLabel: item.ref,
    });
  }

  /** A hidden item goes back LIVE when no open report or removal request holds it any more. */
  async restoreIfClear(
    mediaId: string,
    except: { reportId?: string; takedownId?: string } = {},
  ): Promise<void> {
    const item = await this.media.findMedia(mediaId);
    if (
      item?.status === 'HIDDEN' &&
      (await this.media.countOpenReportsOnMedia(item.id, except.reportId)) === 0 &&
      (await this.media.countOpenTakedownsOnMedia(item.id, except.takedownId)) === 0
    ) {
      await this.media.updateMedia(item.id, { status: 'LIVE' });
    }
  }

  /** Hides an item at once (a serious report or removal request), until the team reviews it. */
  async hide(mediaId: string): Promise<void> {
    const item = await this.media.findMedia(mediaId);
    if (item?.status === 'LIVE') await this.media.updateMedia(item.id, { status: 'HIDDEN' });
  }

  /**
   * Removes an item: deleted with its files, its image blocked (unless told not to), its open
   * reports settled, the owner told the reason; optionally their badge withdrawn. Suspending is the
   * caller's (CruisingService).
   */
  async remove(
    actor: AuthUser,
    mediaId: string,
    input: { reason: string; blockHash: boolean; withdrawVerification: boolean },
    now = new Date(),
  ): Promise<{ ownerId: string }> {
    const item = await this.media.findMedia(mediaId);
    if (!item) throw new NotFoundException('Not found');
    if (input.blockHash && item.hash) await this.media.blockHash(item.hash, input.reason);
    await this.media.closeOpenReportsOnMedia(item.id, actor.id, now);
    await this.media.deleteMedia(item.id);
    await this.storage.remove(item.storageKey);
    await this.storage.remove(item.posterKey);
    await this.activity.record(actor, {
      action: 'cruising.media_removed',
      targetId: item.id,
      targetLabel: item.ref,
      details: { reason: input.reason, blockHash: input.blockHash },
    });
    await this.notify(item.ownerId, 'media-removed', input.reason);
    if (
      input.withdrawVerification &&
      item.owner.cruisingProfile?.verificationStatus === 'APPROVED'
    ) {
      await this.withdrawVerification(actor, item.ownerId);
    }
    return { ownerId: item.ownerId };
  }
}
