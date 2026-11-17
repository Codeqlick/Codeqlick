import { HttpException } from '@nestjs/common';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdultEvents } from '../adult/adult-events.js';
import type { AdultVerificationService } from '../adult/adult-verification.service.js';
import type { CruisingNotificationsService } from './cruising-notifications.service.js';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { ActivityService } from '../activity/activity.service.js';
import type { MailService } from '../mail/mail.service.js';
import { dHash } from '../swipe/swipe-image.js';
import type { CruisingFfmpeg } from './cruising-ffmpeg.js';
import type { CruisingMediaRepository } from './cruising-media.repository.js';
import { CruisingMediaService } from './cruising-media.service.js';
import { CruisingMediaStorage } from './cruising-media.storage.js';
import type { CruisingRepository } from './cruising.repository.js';

const VERSION = 'v-test';
const ME = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-11-16T12:00:00Z');
const MEDIA_ID = '22222222-2222-4222-8222-222222222222';

function profile(overrides: Record<string, unknown> = {}) {
  return {
    userId: ME,
    termsVersion: VERSION,
    nickname: 'pier_fan',
    suspendedAt: null,
    suspendedUntil: null,
    verificationStatus: 'APPROVED',
    verificationKey: null,
    verificationNote: null,
    verificationTries: 0,
    verificationTriesSince: null,
    uploads: 0,
    uploadsSince: null,
    ...overrides,
  };
}

const png = (color: string) =>
  sharp({ create: { width: 64, height: 48, channels: 3, background: color } })
    .composite([
      {
        input: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="48"><rect width="32" height="48" fill="#fff"/></svg>',
        ),
        left: 0,
        top: 0,
      },
    ])
    .png()
    .toBuffer();

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'cq-cruising-media-'));
  const config = {
    isTest: true,
    cruisingTermsVersion: VERSION,
    cruisingUploadsDir: dir,
    cloudDisk: { lowBytes: 0, minBytes: 0 },
    siteUrl: 'https://codeqlick.com',
    siteUrlFor: (realm: string) =>
      realm === 'NEOQLICK' ? 'https://neoqlick.com' : 'https://codeqlick.com',
    accountUrlFor: (realm: string) =>
      realm === 'NEOQLICK' ? 'https://account.neoqlick.com' : 'https://account.codeqlick.com',
    webappUrl: () => 'https://cruising.codeqlick.com',
  };
  const storage = new CruisingMediaStorage(config as unknown as AppConfigService);
  vi.spyOn(storage, 'diskLow').mockResolvedValue(false);
  const created: Record<string, unknown>[] = [];
  const media = {
    countActive: vi.fn().mockResolvedValue({ photos: 0, videos: 0 }),
    nextPosition: vi.fn().mockResolvedValue(0),
    refTaken: vi.fn().mockResolvedValue(false),
    blockedHashes: vi.fn().mockResolvedValue([]),
    createMedia: vi.fn().mockImplementation((data: Record<string, unknown>) => {
      const row = {
        id: MEDIA_ID,
        cover: false,
        width: null,
        height: null,
        durationSeconds: null,
        failure: null,
        storageKey: null,
        posterKey: null,
        ...data,
      };
      created.push(row);
      return Promise.resolve(row);
    }),
    mediaOf: vi.fn().mockImplementation(() => Promise.resolve(created)),
    findMedia: vi.fn(),
    finishVideo: vi.fn().mockResolvedValue(true),
    failVideo: vi.fn().mockResolvedValue(undefined),
    deleteMedia: vi.fn().mockResolvedValue(undefined),
    processingIds: vi.fn().mockResolvedValue([]),
    storageKeys: vi.fn().mockResolvedValue(new Set()),
    updateMedia: vi.fn().mockResolvedValue(undefined),
    setCover: vi.fn().mockResolvedValue(undefined),
    isGranted: vi.fn().mockResolvedValue(false),
    liveMediaOf: vi.fn().mockResolvedValue([]),
  };
  const repo = {
    findProfile: vi.fn().mockResolvedValue(profile()),
    updateProfile: vi.fn().mockResolvedValue(undefined),
    recipient: vi.fn().mockResolvedValue({ email: 'me@example.com', locale: 'EN' }),
    hiddenIds: vi.fn().mockResolvedValue([]),
    findProfileByNickname: vi.fn(),
  };
  const ffmpeg = {
    probe: vi.fn().mockResolvedValue({
      duration: 12,
      durationSeconds: 12,
      width: 1280,
      height: 720,
      hasAudio: true,
    }),
    transcode: vi
      .fn()
      .mockImplementation((_input: string, output: string) =>
        writeFile(output, Buffer.from('fake mp4')),
      ),
    poster: vi.fn().mockImplementation(() => png('#335')),
  };
  const sent: unknown[] = [];
  const mail = {
    send: vi.fn().mockImplementation((m: unknown) => (sent.push(m), Promise.resolve())),
  };
  const activity = { record: vi.fn().mockResolvedValue(undefined) };
  const notifications = {
    notify: vi.fn().mockResolvedValue(undefined),
    notifyMany: vi.fn().mockResolvedValue(undefined),
  };
  // The account's one verification of the 18+ apps (architecture 4.16).
  const verification = {
    upload: vi.fn().mockResolvedValue({ status: 'PENDING' }),
    view: vi.fn().mockResolvedValue({ status: 'NONE', note: null }),
    withdraw: vi.fn().mockResolvedValue(undefined),
  };
  const events = new AdultEvents();
  const service = new CruisingMediaService(
    media as unknown as CruisingMediaRepository,
    repo as unknown as CruisingRepository,
    storage,
    ffmpeg as unknown as CruisingFfmpeg,
    activity as unknown as ActivityService,
    mail as unknown as MailService,
    config as unknown as AppConfigService,
    notifications as unknown as CruisingNotificationsService,
    verification as unknown as AdultVerificationService,
    events,
  );
  /** A file as multer leaves it in the work folder. */
  const received = async (data: Buffer) => {
    const path = join(storage.incomingDir(), `tmp-${Math.random().toString(16).slice(2)}`);
    await writeFile(path, data);
    return { path, size: data.length };
  };
  const workFiles = () => readdir(storage.incomingDir());
  return {
    dir,
    storage,
    media,
    repo,
    ffmpeg,
    sent,
    activity,
    service,
    received,
    workFiles,
    notifications,
    verification,
    events,
  };
}

const mp4Head = Buffer.concat([
  Buffer.from([0, 0, 0, 0x20]),
  Buffer.from('ftypisom'),
  Buffer.alloc(200),
]);

async function status(promise: Promise<unknown>): Promise<number | 'ok'> {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    if (error instanceof HttpException) return error.getStatus();
    throw error;
  }
}

describe('CruisingMediaService', () => {
  let t: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    t = await setup();
  });

  afterEach(async () => {
    await t.service.idle();
    await rm(t.dir, { recursive: true, force: true });
  });

  describe('uploads', () => {
    it('refuse members without a nickname (409) and uploads without consent (400)', async () => {
      t.repo.findProfile.mockResolvedValue(profile({ nickname: null }));
      expect(
        await status(t.service.upload(ME, await t.received(await png('#a00')), 'true', NOW)),
      ).toBe(409);
      t.repo.findProfile.mockResolvedValue(profile());
      expect(
        await status(t.service.upload(ME, await t.received(await png('#a00')), undefined, NOW)),
      ).toBe(400);
      // The received files are gone either way.
      expect(await t.workFiles()).toEqual([]);
    });

    it('refuse while the disk is low (507), past the limits (409) and past 20 a day (429)', async () => {
      vi.spyOn(t.storage, 'diskLow').mockResolvedValueOnce(true);
      expect(
        await status(t.service.upload(ME, await t.received(await png('#a00')), 'true', NOW)),
      ).toBe(507);
      t.media.countActive.mockResolvedValueOnce({ photos: 12, videos: 0 });
      expect(
        await status(t.service.upload(ME, await t.received(await png('#a00')), 'true', NOW)),
      ).toBe(409);
      t.media.countActive.mockResolvedValueOnce({ photos: 0, videos: 4 });
      expect(await status(t.service.upload(ME, await t.received(mp4Head), 'true', NOW))).toBe(409);
      t.repo.findProfile.mockResolvedValue(profile({ uploads: 20, uploadsSince: NOW }));
      expect(
        await status(t.service.upload(ME, await t.received(await png('#a00')), 'true', NOW)),
      ).toBe(429);
      expect(await t.workFiles()).toEqual([]);
    });

    it('refuse what is neither a photo nor a video (400)', async () => {
      expect(
        await status(t.service.upload(ME, await t.received(Buffer.from('%PDF-1.7')), 'true', NOW)),
      ).toBe(400);
    });

    it('publish a photo at once, re-encoded and watermarked, counting the day', async () => {
      const view = await t.service.upload(ME, await t.received(await png('#a00')), 'true', NOW);
      expect(view).toMatchObject({ kind: 'PHOTO', status: 'LIVE', cover: true, width: 64 });
      expect(view.ref).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
      const stored = await readdir(t.dir);
      expect(stored.filter((name) => name.endsWith('.webp'))).toHaveLength(1);
      expect(t.repo.updateProfile).toHaveBeenCalledWith(ME, { uploads: 1, uploadsSince: NOW });
    });

    it('go into the private album with its own limits (decision 99)', async () => {
      const view = await t.service.upload(
        ME,
        await t.received(await png('#a00')),
        'true',
        NOW,
        'PRIVATE',
      );
      expect(view).toMatchObject({ album: 'PRIVATE', cover: false });
      expect(t.media.countActive).toHaveBeenCalledWith(ME, 'PRIVATE');
      t.media.countActive.mockResolvedValueOnce({ photos: 12, videos: 0 });
      expect(
        await status(
          t.service.upload(ME, await t.received(await png('#a00')), 'true', NOW, 'PRIVATE'),
        ),
      ).toBe(409);
    });

    it('refuse an image removed before (blocked hash)', async () => {
      const image = await png('#0a0');
      const webp = await sharp(image).webp({ quality: 82 }).toBuffer();
      t.media.blockedHashes.mockResolvedValue([await dHash(webp)]);
      expect(await status(t.service.upload(ME, await t.received(image), 'true', NOW))).toBe(400);
      expect((await readdir(t.dir)).filter((name) => name.endsWith('.webp'))).toEqual([]);
    });
  });

  describe('videos', () => {
    it('refuse one over 60 seconds', async () => {
      t.ffmpeg.probe.mockResolvedValueOnce({
        duration: 75,
        durationSeconds: 75,
        width: 640,
        height: 480,
        hasAudio: false,
      });
      expect(await status(t.service.upload(ME, await t.received(mp4Head), 'true', NOW))).toBe(400);
      expect(t.media.createMedia).not.toHaveBeenCalled();
    });

    it('wait PROCESSING, then go LIVE with the MP4 and a watermarked poster', async () => {
      t.media.findMedia.mockResolvedValue({
        id: MEDIA_ID,
        status: 'PROCESSING',
        owner: { cruisingProfile: { nickname: 'pier_fan' } },
      });
      const view = await t.service.upload(ME, await t.received(mp4Head), 'true', NOW);
      expect(view).toMatchObject({ kind: 'VIDEO', status: 'PROCESSING', durationSeconds: 12 });
      await t.service.idle();
      expect(t.ffmpeg.transcode).toHaveBeenCalledTimes(1);
      expect(t.media.finishVideo).toHaveBeenCalledWith(
        MEDIA_ID,
        expect.objectContaining({
          storageKey: expect.stringMatching(/\.mp4$/),
          posterKey: expect.stringMatching(/\.webp$/),
          width: 1280,
          height: 720,
        }),
      );
      const stored = await readdir(t.dir);
      expect(stored.filter((name) => /\.(mp4|webp)$/.test(name))).toHaveLength(2);
      // The upload and the work output are gone.
      expect(await t.workFiles()).toEqual([]);
    });

    it('fail (unreadable) when ffmpeg fails, keeping no file', async () => {
      t.ffmpeg.transcode.mockRejectedValueOnce(new Error('broken'));
      t.media.findMedia.mockResolvedValue({
        id: MEDIA_ID,
        status: 'PROCESSING',
        owner: { cruisingProfile: { nickname: 'pier_fan' } },
      });
      await t.service.upload(ME, await t.received(mp4Head), 'true', NOW);
      await t.service.idle();
      expect(t.media.failVideo).toHaveBeenCalledWith(MEDIA_ID, 'unreadable');
      expect(t.media.finishVideo).not.toHaveBeenCalled();
      expect((await readdir(t.dir)).filter((name) => name.includes('.'))).toEqual([]);
      expect(await t.workFiles()).toEqual([]);
    });

    it('fail (blocked) when the poster looks like a removed image', async () => {
      const frame = await png('#335');
      t.media.blockedHashes.mockResolvedValue([
        await dHash(await sharp(frame).webp({ quality: 82 }).toBuffer()),
      ]);
      t.media.findMedia.mockResolvedValue({
        id: MEDIA_ID,
        status: 'PROCESSING',
        owner: { cruisingProfile: { nickname: 'pier_fan' } },
      });
      await t.service.upload(ME, await t.received(mp4Head), 'true', NOW);
      await t.service.idle();
      expect(t.media.failVideo).toHaveBeenCalledWith(MEDIA_ID, 'blocked');
    });
  });

  describe('verification (one per account, architecture 4.16)', () => {
    it('hands the photo to the shared verification and deletes the received file', async () => {
      const file = await t.received(await png('#00a'));
      expect(await t.service.uploadVerification(ME, file, NOW)).toEqual({ status: 'PENDING' });
      expect(t.verification.upload).toHaveBeenCalledWith(ME, 'CRUISING', expect.any(Buffer), NOW);
      expect(await t.workFiles()).toEqual([]);
    });

    it('writes a decision in the notification centre of Cruising members only', async () => {
      t.service.onApplicationBootstrap();
      t.events.verification.next({ userId: ME, status: 'APPROVED' });
      await new Promise((resolve) => setImmediate(resolve));
      expect(t.notifications.notify).toHaveBeenCalledWith(ME, 'VERIFICATION_DECIDED', {
        status: 'APPROVED',
      });
      t.notifications.notify.mockClear();
      t.repo.findProfile.mockResolvedValue(null);
      t.events.verification.next({ userId: 'someone-else', status: 'REJECTED' });
      await new Promise((resolve) => setImmediate(resolve));
      expect(t.notifications.notify).not.toHaveBeenCalled();
      t.service.onApplicationShutdown();
    });
  });

  it('cleans up files nothing points to once they are an hour old', async () => {
    const kept = await t.storage.write(Buffer.from('kept'));
    const orphan = await t.storage.write(Buffer.from('orphan'), 'mp4');
    t.media.storageKeys.mockResolvedValue(new Set([kept]));
    expect(await t.service.cleanupFiles(new Date(Date.now() + 2 * 60 * 60 * 1000))).toBe(1);
    expect(await t.storage.size(kept)).toBe(4);
    expect(await t.storage.size(orphan)).toBeUndefined();
  });

  describe('the private album (decision 99)', () => {
    const owner = { cruisingProfile: { suspendedAt: null, suspendedUntil: null } };
    const item = (album: 'PUBLIC' | 'PRIVATE') => ({
      id: MEDIA_ID,
      ownerId: 'owner',
      kind: 'PHOTO' as const,
      album,
      status: 'LIVE' as const,
      cover: true,
      owner,
    });

    it('moves an item into the other album when it has room; the cover stays public', async () => {
      t.media.findMedia.mockResolvedValue({ ...item('PUBLIC'), ownerId: ME });
      await t.service.updateMedia(ME, MEDIA_ID, { album: 'PRIVATE' });
      expect(t.media.updateMedia).toHaveBeenCalledWith(MEDIA_ID, {
        album: 'PRIVATE',
        cover: false,
      });
      await expect(
        t.service.updateMedia(ME, MEDIA_ID, { album: 'PRIVATE', cover: true }),
      ).rejects.toMatchObject({ status: 409 });
      t.media.countActive.mockResolvedValueOnce({ photos: 12, videos: 0 });
      expect(await status(t.service.updateMedia(ME, MEDIA_ID, { album: 'PRIVATE' }))).toBe(409);
    });

    it('lets only grantees, the owner and the team see a private item', async () => {
      const viewer = { id: ME, isAdmin: false };
      expect(await t.service.visibleTo(viewer, item('PRIVATE'), NOW)).toBe(false);
      expect(await t.service.visibleTo(viewer, item('PUBLIC'), NOW)).toBe(true);
      t.media.isGranted.mockResolvedValueOnce(true);
      expect(await t.service.visibleTo(viewer, item('PRIVATE'), NOW)).toBe(true);
      expect(t.media.isGranted).toHaveBeenCalledWith('owner', ME);
      t.media.isGranted.mockResolvedValueOnce(true);
      t.repo.hiddenIds.mockResolvedValueOnce(['owner']);
      expect(await t.service.visibleTo(viewer, item('PRIVATE'), NOW)).toBe(false);
      expect(await t.service.visibleTo({ id: 'admin', isAdmin: true }, item('PRIVATE'), NOW)).toBe(
        true,
      );
    });

    it('lists a member’s private items only for grantees', async () => {
      t.repo.findProfileByNickname.mockResolvedValue({
        userId: 'owner',
        nickname: 'beach_guy',
        suspendedAt: null,
        suspendedUntil: null,
      });
      await t.service.memberMedia(ME, 'beach_guy', NOW);
      expect(t.media.liveMediaOf).toHaveBeenLastCalledWith('owner', false);
      t.media.isGranted.mockResolvedValueOnce(true);
      await t.service.memberMedia(ME, 'beach_guy', NOW);
      expect(t.media.liveMediaOf).toHaveBeenLastCalledWith('owner', true);
    });
  });
});
