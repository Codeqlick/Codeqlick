import 'reflect-metadata';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AppConfigService } from '../src/config/app-config.service.js';
import { Role } from '../src/generated/prisma/client.js';
import { CruisingMediaService } from '../src/modules/cruising/cruising-media.service.js';
import { CruisingMediaStorage } from '../src/modules/cruising/cruising-media.storage.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const tag = randomUUID().slice(0, 8);
const hasFfmpeg =
  spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;

type Person = {
  id: string;
  email: string;
  nick: string;
  auth: { Authorization: string; 'X-Forwarded-For': string };
};

/** A distinct photo for each seed (blocked hashes compare what images look like). */
async function photo(seed: number): Promise<Buffer> {
  const stripes = Array.from(
    { length: 8 },
    (_, i) =>
      `<rect x="${i * 20}" y="0" width="10" height="120" fill="#${(((seed * 37 + i * 53) % 255) + 256).toString(16).slice(1)}${(seed * 11) % 10}${i}a0"/>`,
  ).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="${20 + ((seed * 13) % 90)}" fill="#fff"/>${stripes}</svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

/** Cruising phase 4 (architecture 4.15, decision 87): verification, media, access, moderation. */
describe('Cruising media (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let version: string;
  let admin: Person;
  const sent: MailMessage[] = [];
  let made = 0;

  const server = () => app.getHttpServer();

  async function person(name: string, role: Role = Role.CLIENT): Promise<Person> {
    made += 1;
    const email = `e2e-cruising-media-${name.toLowerCase()}-${tag}@codeqlick.test`;
    const user = await prisma.user.create({ data: { email, name, role, passwordHash: 'x' } });
    const token = await app.get(JwtService).signAsync({ sub: user.id, email, name, role });
    const nick = `${name.toLowerCase().slice(0, 5)}_${tag.slice(0, 6)}_${made}`;
    // Each person comes from their own address, so the rate limits don't mix them up.
    return {
      id: user.id,
      email,
      nick,
      auth: { Authorization: `Bearer ${token}`, 'X-Forwarded-For': `10.87.${made}.1` },
    };
  }

  /** An entered member: with a nickname unless told otherwise, verified when asked. */
  async function member(
    name: string,
    options: { nickname?: boolean; verified?: boolean } = {},
  ): Promise<Person> {
    const who = await person(name);
    await prisma.cruisingProfile.create({
      data: {
        userId: who.id,
        birthYear: 1990,
        termsVersion: version,
        acceptedAt: new Date(),
        nickname: options.nickname === false ? null : who.nick,
        verificationStatus: options.verified ? 'APPROVED' : 'NONE',
      },
    });
    return who;
  }

  const upload = (
    who: Person,
    file: Buffer,
    name = 'photo.jpg',
    consent: string | null = 'true',
  ) => {
    const req = request(server())
      .post('/v1/cruising/media')
      .set(who.auth)
      .attach('file', file, name);
    return consent === null ? req : req.field('consent', consent);
  };

  const fileOf = (who: Person | null, id: string, suffix = 'file') => {
    const req = request(server()).get(`/v1/cruising/media/${id}/${suffix}`);
    return who ? req.set(who.auth) : req;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    version = app.get(AppConfigService).cruisingTermsVersion;
    vi.spyOn(app.get(MailService), 'send').mockImplementation((message: MailMessage) => {
      sent.push(message);
      return Promise.resolve();
    });
    admin = await person('Admin', Role.ADMIN);
  });

  beforeEach(() => {
    sent.length = 0;
    vi.restoreAllMocks();
    // The machine running the tests may be short of disk itself: the guard is tested on its own.
    vi.spyOn(app.get(CruisingMediaStorage), 'diskLow').mockResolvedValue(false);
    vi.spyOn(app.get(MailService), 'send').mockImplementation((message: MailMessage) => {
      sent.push(message);
      return Promise.resolve();
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@codeqlick.test` } } });
      await prisma.cruisingBlockedHash.deleteMany({ where: { reason: { contains: tag } } });
    }
    await app?.get(CruisingMediaService).idle();
    await app?.close();
  });

  it('verifies a member once: the team approves, the photo goes, the badge shows', async () => {
    const ana = await member('Ana');
    const noNick = await member('Nonick', { nickname: false });

    await request(server())
      .post('/v1/cruising/verification')
      .set(noNick.auth)
      .attach('file', await photo(1), 'me.jpg')
      .expect(409);

    const sentPhoto = await request(server())
      .post('/v1/cruising/verification')
      .set(ana.auth)
      .attach('file', await photo(2), 'me.jpg');
    expect(sentPhoto.status).toBe(200);
    expect(sentPhoto.body).toEqual({ status: 'PENDING' });
    // Once: pending already.
    await request(server())
      .post('/v1/cruising/verification')
      .set(ana.auth)
      .attach('file', await photo(3), 'me.jpg')
      .expect(409);
    // Not an image.
    const bea = await member('Bea');
    await request(server())
      .post('/v1/cruising/verification')
      .set(bea.auth)
      .attach('file', Buffer.from('<svg/>'), 'x.svg')
      .expect(400);

    const me = await request(server()).get('/v1/cruising/me').set(ana.auth).expect(200);
    expect(me.body.verification).toEqual({ status: 'PENDING', note: null });
    expect(me.body.verified).toBe(false);

    const queue = await request(server())
      .get('/v1/admin/cruising/verifications')
      .set(admin.auth)
      .expect(200);
    expect(queue.body.items.map((item: { userId: string }) => item.userId)).toContain(ana.id);
    await request(server()).get('/v1/admin/cruising/verifications').set(ana.auth).expect(403);
    const image = await request(server())
      .get(`/v1/admin/cruising/verifications/${ana.id}/file`)
      .set(admin.auth)
      .expect(200);
    expect(image.headers['content-type']).toBe('image/webp');
    expect(image.headers['cache-control']).toBe('private, no-store');

    const key = (await prisma.cruisingProfile.findUniqueOrThrow({ where: { userId: ana.id } }))
      .verificationKey as string;
    const dir = app.get(AppConfigService).cruisingUploadsDir;
    await request(server())
      .post(`/v1/admin/cruising/verifications/${ana.id}`)
      .set(admin.auth)
      .send({ approve: true })
      .expect(204);
    await expect(readFile(join(dir, key))).rejects.toThrow(/ENOENT/);
    const after = await request(server()).get('/v1/cruising/me').set(ana.auth).expect(200);
    expect(after.body.verified).toBe(true);
    expect(after.body.profile.verified).toBe(true);
    expect(after.body.verification.status).toBe('APPROVED');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(ana.email);
    expect(JSON.stringify(sent[0])).not.toContain(ana.nick);
  });

  it('lets any member with a nickname upload (verification is optional), with consent, while the disk has room', async () => {
    const plain = await member('Plain');
    await upload(plain, await photo(4)).expect(202);
    const nameless = await member('Nameless', { nickname: false });
    await upload(nameless, await photo(3)).expect(409);
    const vera = await member('Vera', { verified: true });
    await upload(vera, await photo(5), 'photo.jpg', null).expect(400);
    await upload(vera, Buffer.from('%PDF-1.7 not media'), 'x.pdf').expect(400);

    vi.spyOn(app.get(CruisingMediaStorage), 'diskLow').mockResolvedValue(true);
    await upload(vera, await photo(6)).expect(507);
    vi.spyOn(app.get(CruisingMediaStorage), 'diskLow').mockResolvedValue(false);

    const res = await upload(vera, await photo(7)).expect(202);
    expect(res.body).toMatchObject({ kind: 'PHOTO', status: 'LIVE', cover: true });
    expect(res.body.ref).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    const list = await request(server()).get('/v1/cruising/media').set(vera.auth).expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.limits).toEqual({ photos: 12, videos: 4, perDay: 20 });
    expect(list.body.verification.status).toBe('APPROVED');
    // It waits in the team's "New media" queue.
    const queue = await request(server())
      .get('/v1/admin/cruising/media?queue=new')
      .set(admin.auth)
      .expect(200);
    expect(queue.body.items.map((item: { id: string }) => item.id)).toContain(res.body.id);
  });

  it('refuses a 13th photo (409) and an image removed before (400)', async () => {
    const full = await member('Full', { verified: true });
    await prisma.cruisingMedia.createMany({
      data: Array.from({ length: 12 }, (_, i) => ({
        ref: `F${tag
          .slice(0, 5)
          .toUpperCase()
          .replace(/[^A-Z2-9]/g, 'X')}${String.fromCharCode(65 + i)}${i % 10}`.slice(0, 12),
        ownerId: full.id,
        kind: 'PHOTO' as const,
        status: 'LIVE' as const,
        position: i,
      })),
    });
    const over = await upload(full, await photo(8));
    expect(over.status).toBe(409);

    const ivo = await member('Ivo', { verified: true });
    const first = await upload(ivo, await photo(9)).expect(202);
    const row = await prisma.cruisingMedia.findUniqueOrThrow({ where: { id: first.body.id } });
    await prisma.cruisingBlockedHash.create({ data: { hash: row.hash as string, reason: 'test' } });
    await upload(ivo, await photo(9)).expect(400);
    await prisma.cruisingBlockedHash.delete({ where: { hash: row.hash as string } });
  });

  it('streams a file only to its owner, the team and members who can see the profile', async () => {
    const owner = await member('Owen', { verified: true });
    const viewer = await member('Vic');
    const noNick = await member('Nina', { nickname: false });
    const blocked = await member('Blake');
    const outsider = await person('Out');
    const item = (await upload(owner, await photo(10)).expect(202)).body as { id: string };
    await prisma.cruisingBlock.create({ data: { blockerId: owner.id, blockedId: blocked.id } });

    for (const who of [owner, admin, viewer]) {
      const res = await fileOf(who, item.id).expect(200);
      expect(res.headers['content-type']).toBe('image/webp');
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(res.headers['x-robots-tag']).toContain('noindex');
    }
    for (const who of [noNick, blocked, outsider]) await fileOf(who, item.id).expect(404);
    await fileOf(null, item.id).expect(401);

    // Range requests.
    const part = await fileOf(viewer, item.id).set('Range', 'bytes=0-9').expect(206);
    expect(part.headers['content-range']).toMatch(/^bytes 0-9\/\d+$/);
    expect(part.headers['content-length']).toBe('10');
    await fileOf(viewer, item.id).set('Range', 'bytes=99999999-').expect(416);

    // The profile's gallery, for members who can see the profile.
    const gallery = await request(server())
      .get(`/v1/cruising/members/${owner.nick}/media`)
      .set(viewer.auth)
      .expect(200);
    expect(gallery.body.items).toEqual([expect.objectContaining({ id: item.id, cover: true })]);
    await request(server())
      .get(`/v1/cruising/members/${owner.nick}/media`)
      .set(blocked.auth)
      .expect(404);

    // A suspended owner's media is hidden from others.
    await prisma.cruisingProfile.update({
      where: { userId: owner.id },
      data: { suspendedAt: new Date() },
    });
    await fileOf(viewer, item.id).expect(404);
    await fileOf(owner, item.id).expect(200);
  });

  it('names members with the badge and the cover everywhere', async () => {
    const star = await member('Star', { verified: true });
    const fan = await member('Fan');
    const cover = (await upload(star, await photo(11)).expect(202)).body as { id: string };

    const profile = await request(server())
      .get(`/v1/cruising/members/${star.nick}`)
      .set(fan.auth)
      .expect(200);
    expect(profile.body).toMatchObject({ verified: true, coverId: cover.id });

    const spot = await prisma.cruisingSpot.create({
      data: {
        slug: `media-spot-${tag}`,
        name: `Media spot ${tag}`,
        type: 'PARK',
        lat: 12.5,
        lng: -149.5,
        countryCode: 'ES',
        city: `Media ${tag}`,
        citySlug: `media-${tag}`,
        description: 'A park for the media tests.',
        status: 'LIVE',
      },
    });
    try {
      await request(server())
        .put(`/v1/cruising/spots/${spot.id}/review`)
        .set(star.auth)
        .send({ rating: 4 })
        .expect(200);
      const reviews = await request(server())
        .get(`/v1/cruising/spots/${spot.id}/reviews`)
        .set(fan.auth)
        .expect(200);
      expect(reviews.body.items[0].author).toEqual({
        nickname: star.nick,
        verified: true,
        coverId: cover.id,
      });

      await request(server())
        .post('/v1/cruising/check-ins')
        .set(star.auth)
        .send({ spotId: spot.id, hours: 1, anonymous: false })
        .expect(201);
      const presence = await request(server())
        .get(`/v1/cruising/spots/${spot.id}/presence`)
        .set(fan.auth)
        .expect(200);
      expect(presence.body.members).toEqual([
        expect.objectContaining({ nickname: star.nick, verified: true, coverId: cover.id }),
      ]);

      await request(server())
        .post('/v1/cruising/conversations')
        .set(fan.auth)
        .send({ nickname: star.nick })
        .expect(201);
      const conversations = await request(server())
        .get('/v1/cruising/conversations')
        .set(fan.auth)
        .expect(200);
      expect(conversations.body.items[0].partner).toEqual({
        nickname: star.nick,
        verified: true,
        coverId: cover.id,
      });
    } finally {
      await prisma.cruisingSpot.delete({ where: { id: spot.id } });
    }
  });

  it('loses the badge when the nickname changes', async () => {
    const nora = await member('Nora', { verified: true });
    const saved = await request(server())
      .patch('/v1/cruising/profile')
      .set(nora.auth)
      .send({ nickname: `${nora.nick.slice(0, 15)}_new` })
      .expect(200);
    expect(saved.body.verified).toBe(false);
    expect(saved.body.verification.status).toBe('NONE');
    // Without the badge they can still upload: verification is optional.
    await upload(nora, await photo(12)).expect(202);
  });

  it('hides reported media at once for the serious reasons and lets the team decide', async () => {
    const owner = await member('Rita', { verified: true });
    const reporter = await member('Remy');
    const other = await member('Ozzy');
    const item = (await upload(owner, await photo(13)).expect(202)).body as { id: string };

    // DANGER doesn't apply to media; STOLEN doesn't apply to a spot.
    await request(server())
      .post('/v1/cruising/reports')
      .set(reporter.auth)
      .send({ mediaId: item.id, reason: 'DANGER' })
      .expect(400);

    await request(server())
      .post('/v1/cruising/reports')
      .set(reporter.auth)
      .send({ mediaId: item.id, reason: 'STOLEN', details: 'That is my photo' })
      .expect(204);
    await fileOf(other, item.id).expect(404);
    await fileOf(owner, item.id).expect(200);
    const hidden = await request(server())
      .get('/v1/admin/cruising/media?queue=hidden')
      .set(admin.auth)
      .expect(200);
    expect(hidden.body.items.map((row: { id: string }) => row.id)).toContain(item.id);

    const reports = await request(server())
      .get('/v1/admin/cruising/reports?status=OPEN')
      .set(admin.auth)
      .expect(200);
    const report = reports.body.items.find(
      (row: { target: { media?: { id: string } } | null }) => row.target?.media?.id === item.id,
    );
    expect(report).toMatchObject({ targetType: 'MEDIA', reason: 'STOLEN' });
    await request(server())
      .post(`/v1/admin/cruising/reports/${report.id}/dismiss`)
      .set(admin.auth)
      .expect(204);
    await fileOf(other, item.id).expect(200);

    // MINOR also emails the team at once.
    await request(server())
      .post('/v1/cruising/reports')
      .set(reporter.auth)
      .send({ mediaId: item.id, reason: 'MINOR' })
      .expect(204);
    await fileOf(other, item.id).expect(404);
    expect(sent.some((message) => message.subject.includes('possible minor'))).toBe(true);

    // The team removes it: deleted, blocked, the owner told.
    sent.length = 0;
    await request(server())
      .post(`/v1/admin/cruising/media/${item.id}/remove`)
      .set(admin.auth)
      .send({ reason: `A minor appears ${tag}` })
      .expect(204);
    expect(await prisma.cruisingMedia.findUnique({ where: { id: item.id } })).toBeNull();
    await upload(owner, await photo(13)).expect(400);
    expect(sent.map((message) => message.to)).toContain(owner.email);
    const closed = await prisma.cruisingReport.findMany({ where: { reportedId: owner.id } });
    expect(closed.every((row) => row.status !== 'OPEN')).toBe(true);
  });

  it('marks new media reviewed and takes removal requests by media reference', async () => {
    const owner = await member('Tess', { verified: true });
    const viewer = await member('Tom');
    const item = (await upload(owner, await photo(14)).expect(202)).body as {
      id: string;
      ref: string;
    };
    await request(server())
      .post(`/v1/admin/cruising/media/${item.id}/reviewed`)
      .set(admin.auth)
      .expect(204);
    const queue = await request(server())
      .get('/v1/admin/cruising/media?queue=new')
      .set(admin.auth)
      .expect(200);
    expect(queue.body.items.map((row: { id: string }) => row.id)).not.toContain(item.id);

    const takedown = await request(server())
      .post('/v1/cruising/takedown')
      .set('X-Forwarded-For', '10.87.250.1')
      .send({
        email: `someone-${tag}@codeqlick.test`,
        mediaRef: item.ref.toLowerCase(),
        reason: 'NON_CONSENSUAL',
        details: 'I am in this video and never agreed.',
        locale: 'en',
      })
      .expect(200);
    await fileOf(viewer, item.id).expect(404);
    const list = await request(server())
      .get('/v1/admin/cruising/takedowns?status=OPEN')
      .set(admin.auth)
      .expect(200);
    const row = list.body.items.find((entry: { id: string }) => entry.id === takedown.body.id);
    expect(row).toMatchObject({ mediaRef: item.ref, media: { id: item.id } });
    // Closed: it comes back.
    await request(server())
      .post(`/v1/admin/cruising/takedowns/${takedown.body.id}`)
      .set(admin.auth)
      .send({ remove: false })
      .expect(204);
    await fileOf(viewer, item.id).expect(200);
    await prisma.cruisingTakedown.deleteMany({ where: { id: takedown.body.id } });
  });

  it('withdraws a badge on request of the team', async () => {
    const wes = await member('Wes', { verified: true });
    await request(server())
      .delete(`/v1/admin/cruising/users/${wes.id}/verification`)
      .set(admin.auth)
      .expect(204);
    const me = await request(server()).get('/v1/cruising/me').set(wes.auth).expect(200);
    expect(me.body.verified).toBe(false);
    expect(sent.map((message) => message.to)).toContain(wes.email);
  });

  it.skipIf(!hasFfmpeg)(
    'transcodes a video: PROCESSING, then LIVE as MP4 with a poster and range requests',
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'cq-e2e-video-'));
      try {
        const source = join(dir, 'clip.mov');
        const made = spawnSync('ffmpeg', [
          '-hide_banner',
          '-loglevel',
          'error',
          '-f',
          'lavfi',
          '-i',
          'testsrc=duration=2:size=640x360:rate=25',
          '-f',
          'lavfi',
          '-i',
          'sine=duration=2',
          '-shortest',
          '-metadata',
          'location=+40.4168-003.7038/',
          '-y',
          source,
        ]);
        expect(made.status).toBe(0);
        const vic = await member('Vid', { verified: true });
        const viewer = await member('Val');
        const res = await upload(vic, await readFile(source), 'clip.mov').expect(202);
        expect(res.body).toMatchObject({ kind: 'VIDEO', status: 'PROCESSING' });
        await app.get(CruisingMediaService).idle();
        const row = await prisma.cruisingMedia.findUniqueOrThrow({ where: { id: res.body.id } });
        expect(row).toMatchObject({ status: 'LIVE', width: 640, height: 360, durationSeconds: 2 });

        const whole = await fileOf(viewer, row.id).expect(200);
        expect(whole.headers['content-type']).toBe('video/mp4');
        const part = await fileOf(viewer, row.id).set('Range', 'bytes=0-99').expect(206);
        expect(part.headers['content-range']).toMatch(/^bytes 0-99\/\d+$/);
        const poster = await fileOf(viewer, row.id, 'poster').expect(200);
        expect(poster.headers['content-type']).toBe('image/webp');
        // No metadata survives (no location).
        const stored = join(app.get(AppConfigService).cruisingUploadsDir, row.storageKey as string);
        const probe = spawnSync('ffprobe', ['-v', 'error', '-show_format', stored], {
          encoding: 'utf8',
        });
        expect(probe.stdout).not.toContain('location');

        // A video over 60 seconds is refused.
        const long = join(dir, 'long.mp4');
        spawnSync('ffmpeg', [
          '-hide_banner',
          '-loglevel',
          'error',
          '-f',
          'lavfi',
          '-i',
          'testsrc=duration=62:size=160x120:rate=5',
          '-y',
          long,
        ]);
        await upload(vic, await readFile(long), 'long.mp4').expect(400);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
});
