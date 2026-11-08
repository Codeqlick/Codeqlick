import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Role } from '../src/generated/prisma/client.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { SWIPE_TERMS_VERSION } from '../src/modules/swipe/swipe.schemas.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const tag = randomUUID().slice(0, 8);

type Person = { id: string; auth: { Authorization: string } };

/** A JPEG with a pattern of its own (`seed`), so each one hashes differently. */
async function jpeg(seed: number): Promise<Buffer> {
  const width = 64;
  const height = 48;
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      const v = ((x * (seed + 3)) ^ (y * (seed * 7 + 1))) & 0xff;
      pixels[i] = v;
      pixels[i + 1] = (v * seed) & 0xff;
      pixels[i + 2] = 255 - v;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Copyright: 'secret-camera' } } })
    .toBuffer();
}

describe('Swipe (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: Person;
  let ana: Person;
  let bea: Person;
  let carla: Person;
  const sent: MailMessage[] = [];

  const server = () => app.getHttpServer();

  async function person(name: string, role: Role = Role.CLIENT): Promise<Person> {
    const email = `e2e-swipe-${name.toLowerCase()}-${tag}@codeqlick.test`;
    const user = await prisma.user.create({ data: { email, name, role, passwordHash: 'x' } });
    const token = await app.get(JwtService).signAsync({ sub: user.id, email, name, role });
    return { id: user.id, auth: { Authorization: `Bearer ${token}` } };
  }

  const onboard = (who: Person, birthDate = '1990-01-01') =>
    request(server())
      .put('/v1/swipe/me')
      .set(who.auth)
      .send({ birthDate, acceptTerms: true, termsVersion: SWIPE_TERMS_VERSION });

  const upload = async (who: Person, path: string, seed: number, status: number) =>
    request(server())
      .post(path)
      .set(who.auth)
      .field('consent', 'true')
      .attach('file', await jpeg(seed), 'photo.jpg')
      .expect(status);

  /** Onboarded, with a nickname and an approved verification photo. */
  async function uploader(who: Person, nickname: string, gender: string, seed: number) {
    await onboard(who).expect(200);
    await request(server())
      .put('/v1/swipe/profile')
      .set(who.auth)
      .send({ nickname, gender, seeking: [], interests: ['flirting'] })
      .expect(200);
    await upload(who, '/v1/swipe/verification', seed, 201);
    await request(server())
      .post(`/v1/admin/swipe/verifications/${who.id}`)
      .set(admin.auth)
      .send({ approve: true })
      .expect(204);
  }

  /** Uploads a photo and publishes it; returns its id and reference. */
  async function livePhoto(who: Person, seed: number): Promise<{ id: string; ref: string }> {
    const res = await upload(who, '/v1/swipe/photos', seed, 201);
    await request(server())
      .post(`/v1/admin/swipe/photos/${res.body.id}/approve`)
      .set(admin.auth)
      .expect(204);
    return { id: res.body.id, ref: res.body.ref };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    vi.spyOn(app.get(MailService), 'send').mockImplementation(async (message) => {
      sent.push(message);
    });
    admin = await person('Admin', Role.ADMIN);
    ana = await person('Ana');
    bea = await person('Bea');
    carla = await person('Carla');
    await uploader(ana, 'Ana', 'WOMAN', 1);
    await uploader(bea, 'Bea', 'WOMAN', 2);
  });

  beforeEach(() => {
    sent.length = 0;
  });

  afterAll(async () => {
    if (prisma) {
      // Images this run blocked would refuse the next run's identical test images.
      const photos = await prisma.swipePhoto.findMany({
        where: { owner: { email: { contains: `-${tag}@codeqlick.test` } } },
        select: { hash: true },
      });
      await prisma.swipeBlockedHash.deleteMany({
        where: { hash: { in: photos.map((item) => item.hash) } },
      });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@codeqlick.test` } } });
    }
    await app?.close();
  });

  it('asks for 18+ and the current rules before anything else', async () => {
    await request(server()).get('/v1/swipe/deck').set(carla.auth).expect(409);
    await onboard(carla, '2015-05-05').expect(403);
    const old = await request(server())
      .put('/v1/swipe/me')
      .set(carla.auth)
      .send({ birthDate: '1990-01-01', acceptTerms: true, termsVersion: '2000-01-01' });
    expect(old.status).toBe(409);
    const ok = await onboard(carla).expect(200);
    expect(ok.body).toMatchObject({ onboarded: true, allowed: true, canUpload: false });
  });

  it('only lets verified people upload, and re-encodes without metadata', async () => {
    await upload(carla, '/v1/swipe/photos', 9, 403);
    // A file that isn't an image.
    await request(server())
      .put('/v1/swipe/profile')
      .set(carla.auth)
      .send({ nickname: 'Carla', gender: 'WOMAN', seeking: ['MAN'], interests: [] })
      .expect(200);
    await request(server())
      .post('/v1/swipe/verification')
      .set(carla.auth)
      .field('consent', 'true')
      .attach('file', Buffer.from('<svg/>'), 'x.svg')
      .expect(400);

    const res = await upload(ana, '/v1/swipe/photos', 3, 201);
    expect(res.body).toMatchObject({ status: 'PENDING', likes: 0 });
    expect(res.body.ref).toMatch(/^[A-Z2-9]{8}$/);

    const file = await request(server())
      .get(`/v1/swipe/photos/${res.body.id}/file`)
      .set(ana.auth)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(file.headers['content-type']).toBe('image/webp');
    expect(file.headers['cache-control']).toContain('private');
    const meta = await sharp(file.body as Buffer).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();

    // Pending: nobody else sees it.
    await request(server()).get(`/v1/swipe/photos/${res.body.id}/file`).set(bea.auth).expect(404);
    await request(server()).delete(`/v1/swipe/photos/${res.body.id}`).set(ana.auth).expect(204);
  });

  it('shows live photos, matches two people who like each other, and lets them chat', async () => {
    const anaPhoto = await livePhoto(ana, 4);
    const beaPhoto = await livePhoto(bea, 5);

    const deck = await request(server()).get('/v1/swipe/deck').set(bea.auth).expect(200);
    expect(deck.body.items.map((card: { id: string }) => card.id)).toContain(anaPhoto.id);
    expect(deck.body.items.map((card: { id: string }) => card.id)).not.toContain(beaPhoto.id);
    expect(deck.body.items[0]).not.toHaveProperty('ownerId');

    // Carla only wants men: no cards from Ana or Bea.
    const carlaDeck = await request(server()).get('/v1/swipe/deck').set(carla.auth).expect(200);
    expect(carlaDeck.body.items).toHaveLength(0);

    await request(server()).get(`/v1/swipe/photos/${anaPhoto.id}/file`).set(bea.auth).expect(200);

    const first = await request(server())
      .post('/v1/swipe/votes')
      .set(bea.auth)
      .send({ photoId: anaPhoto.id, like: true })
      .expect(200);
    expect(first.body.match).toBeNull();
    const second = await request(server())
      .post('/v1/swipe/votes')
      .set(ana.auth)
      .send({ photoId: beaPhoto.id, like: true })
      .expect(200);
    expect(second.body.match).toMatchObject({ nickname: 'Bea' });
    const matchId = second.body.match.id as string;

    // Voted: no longer in the deck.
    const after = await request(server()).get('/v1/swipe/deck').set(bea.auth).expect(200);
    expect(after.body.items.map((card: { id: string }) => card.id)).not.toContain(anaPhoto.id);

    await request(server())
      .post(`/v1/swipe/matches/${matchId}/messages`)
      .set(ana.auth)
      .send({ text: 'Hola 👋' })
      .expect(201);
    const list = await request(server()).get('/v1/swipe/matches').set(bea.auth).expect(200);
    expect(list.body.items[0]).toMatchObject({
      id: matchId,
      partner: { nickname: 'Ana', photoId: anaPhoto.id },
      lastMessage: { text: 'Hola 👋', mine: false },
      unread: 1,
    });
    const messages = await request(server())
      .get(`/v1/swipe/matches/${matchId}/messages`)
      .set(bea.auth)
      .expect(200);
    expect(messages.body.items).toEqual([
      expect.objectContaining({ text: 'Hola 👋', mine: false }),
    ]);
    const read = await request(server()).get('/v1/swipe/matches').set(bea.auth).expect(200);
    expect(read.body.items[0].unread).toBe(0);

    // Someone outside the match can't read it.
    await request(server())
      .get(`/v1/swipe/matches/${matchId}/messages`)
      .set(carla.auth)
      .expect(404);

    // Reporting from the chat blocks: the match ends.
    await request(server())
      .post('/v1/swipe/reports')
      .set(bea.auth)
      .send({ matchId, reason: 'HARASSMENT', details: 'Test' })
      .expect(204);
    const gone = await request(server()).get('/v1/swipe/matches').set(bea.auth).expect(200);
    expect(gone.body.items).toHaveLength(0);
    const reports = await request(server())
      .get('/v1/admin/swipe/reports')
      .set(admin.auth)
      .expect(200);
    const report = reports.body.items.find(
      (item: { reported: { id: string } }) => item.reported.id === ana.id,
    );
    expect(report.transcript).toEqual([
      expect.objectContaining({ from: 'reported', text: 'Hola 👋' }),
    ]);
  });

  it('hides a photo reported as a minor at once, and brings it back when dismissed', async () => {
    const dani = await person('Dani');
    await onboard(dani).expect(200);
    const live = await livePhoto(bea, 6);
    await request(server())
      .post('/v1/swipe/reports')
      .set(dani.auth)
      .send({ photoId: live.id, reason: 'MINOR' })
      .expect(204);
    expect(sent.map((mail) => mail.subject)).toContain('Swipe: possible minor reported');
    await request(server()).get(`/v1/swipe/photos/${live.id}/file`).set(ana.auth).expect(404);

    const reports = await request(server())
      .get('/v1/admin/swipe/reports')
      .set(admin.auth)
      .expect(200);
    const report = reports.body.items.find(
      (item: { photo: { id: string } | null }) => item.photo?.id === live.id,
    );
    expect(report.photo.status).toBe('HIDDEN');
    await request(server())
      .post(`/v1/admin/swipe/reports/${report.id}/dismiss`)
      .set(admin.auth)
      .expect(204);
    const photo = await prisma.swipePhoto.findUnique({ where: { id: live.id } });
    expect(photo?.status).toBe('LIVE');
  });

  it('takes a photo down from a removal request and refuses the same image again', async () => {
    const live = await livePhoto(ana, 7);
    const res = await request(server())
      .post('/v1/swipe/takedown')
      .send({
        email: `victim-${tag}@example.com`,
        photoRef: live.ref.toLowerCase(),
        reason: 'NON_CONSENSUAL',
        details: 'This is me and I never agreed to it.',
        locale: 'en',
      })
      .expect(200);
    expect(sent.map((mail) => mail.subject)).toEqual(
      expect.arrayContaining([
        'Swipe: removal request',
        'We received your removal request — Swipe',
      ]),
    );
    let photo = await prisma.swipePhoto.findUnique({ where: { id: live.id } });
    expect(photo?.status).toBe('HIDDEN');

    await request(server())
      .post(`/v1/admin/swipe/takedowns/${res.body.id}`)
      .set(admin.auth)
      .send({ remove: true, response: 'Removed.' })
      .expect(204);
    photo = await prisma.swipePhoto.findUnique({ where: { id: live.id } });
    expect(photo?.status).toBe('REJECTED');
    await request(server()).get(`/v1/swipe/photos/${live.id}/file`).set(ana.auth).expect(404);
    expect(sent.map((mail) => mail.subject)).toContain('We removed the photo — Swipe');

    // The same image, uploaded again by anyone.
    await upload(bea, '/v1/swipe/photos', 7, 400);

    // The honeypot pretends.
    await request(server())
      .post('/v1/swipe/takedown')
      .send({ email: 'bot@example.com', reason: 'OTHER', details: 'xxxxxxxxxxxx', website: 'x' })
      .expect(200);
  });

  it('suspends and lifts', async () => {
    await request(server())
      .post(`/v1/admin/swipe/users/${carla.id}/suspend`)
      .set(admin.auth)
      .send({ reason: 'Spam', duration: '24h' })
      .expect(204);
    const me = await request(server()).get('/v1/swipe/me').set(carla.auth).expect(200);
    expect(me.body).toMatchObject({ suspended: true, allowed: false });
    await request(server()).get('/v1/swipe/deck').set(carla.auth).expect(403);
    await request(server())
      .delete(`/v1/admin/swipe/users/${carla.id}/suspension`)
      .set(admin.auth)
      .expect(204);
    await request(server()).get('/v1/swipe/deck').set(carla.auth).expect(200);
  });

  it('keeps moderation for admins', async () => {
    await request(server()).get('/v1/admin/swipe/overview').set(ana.auth).expect(403);
    const overview = await request(server())
      .get('/v1/admin/swipe/overview')
      .set(admin.auth)
      .expect(200);
    expect(overview.body.uploaders).toBeGreaterThanOrEqual(2);
  });
});
