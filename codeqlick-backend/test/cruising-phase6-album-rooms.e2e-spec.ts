import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import sharp from 'sharp';
import request from 'supertest';
import webpush from 'web-push';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AppConfigService } from '../src/config/app-config.service.js';
import { Role } from '../src/generated/prisma/client.js';
import { CruisingAlbumService } from '../src/modules/cruising/cruising-album.service.js';
import { CruisingCommunityService } from '../src/modules/cruising/cruising-community.service.js';
import { CruisingMediaService } from '../src/modules/cruising/cruising-media.service.js';
import { CruisingMediaStorage } from '../src/modules/cruising/cruising-media.storage.js';
import {
  CruisingPushService,
  type PushTarget,
} from '../src/modules/cruising/cruising-push.service.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const tag = randomUUID().slice(0, 8);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

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
      `<rect x="${i * 20}" y="0" width="10" height="120" fill="#${(((seed * 41 + i * 59) % 255) + 256).toString(16).slice(1)}${(seed * 7) % 10}${i}b0"/>`,
  ).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="${20 + ((seed * 17) % 90)}" fill="#fff"/>${stripes}</svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

/** Cruising phase 6 (architecture 4.15): the private album and the city rooms (decisions 99, 100). */
describe('Cruising phase 6: private album and city rooms (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let version: string;
  let admin: Person;
  const pushed: { endpoint: string; payload: { body: string; url: string } }[] = [];
  let made = 0;
  let spotCount = 0;
  const country = 'IS';
  const citySlug = `rooms-${tag}`;
  const room = `/v1/cruising/rooms/${country.toLowerCase()}/${citySlug}/messages`;

  const server = () => app.getHttpServer();

  async function person(name: string, role: Role = Role.CLIENT): Promise<Person> {
    made += 1;
    const email = `e2e-cruising-p6b-${name.toLowerCase()}-${tag}@codeqlick.test`;
    // Old enough to post in rooms unless a test makes it new.
    const user = await prisma.user.create({
      data: { email, name, role, passwordHash: 'x', createdAt: new Date(Date.now() - 3 * DAY) },
    });
    const token = await app.get(JwtService).signAsync({ sub: user.id, email, name, role });
    const nick = `${name.toLowerCase().slice(0, 5)}_${tag.slice(0, 6)}_${made}`;
    return {
      id: user.id,
      email,
      nick,
      auth: { Authorization: `Bearer ${token}`, 'X-Forwarded-For': `10.96.${made}.1` },
    };
  }

  async function member(name: string, withNickname = true): Promise<Person> {
    const who = await person(name);
    await prisma.cruisingProfile.create({
      data: {
        userId: who.id,
        birthYear: 1990,
        termsVersion: version,
        acceptedAt: new Date(),
        country,
        nickname: withNickname ? who.nick : null,
      },
    });
    return who;
  }

  async function liveSpot(slug = citySlug, status: 'LIVE' | 'PENDING' = 'LIVE') {
    spotCount += 1;
    const name = `Phase six spot ${spotCount} ${tag}`;
    return prisma.cruisingSpot.create({
      data: {
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name,
        type: 'BEACH',
        lat: 64.1 + spotCount / 1000,
        lng: -21.9,
        countryCode: country,
        city: `Rooms ${tag}`,
        citySlug: slug,
        description: 'A beach used for the phase 6 tests.',
        status,
      },
    });
  }

  const upload = (who: Person, file: Buffer, album?: 'PUBLIC' | 'PRIVATE') => {
    const req = request(server())
      .post('/v1/cruising/media')
      .set(who.auth)
      .attach('file', file, 'photo.jpg')
      .field('consent', 'true');
    return album ? req.field('album', album) : req;
  };

  const fileOf = (who: Person, id: string) =>
    request(server()).get(`/v1/cruising/media/${id}/file`).set(who.auth);

  const talk = async (a: Person, b: Person) => {
    const res = await request(server())
      .post('/v1/cruising/conversations')
      .set(a.auth)
      .send({ nickname: b.nick });
    expect([200, 201]).toContain(res.status);
    return res.body.id as string;
  };

  const share = (owner: Person, grantee: Person) =>
    request(server()).put(`/v1/cruising/album-grants/${grantee.nick}`).set(owner.auth);

  const post = (who: Person, text: string) =>
    request(server()).post(room).set(who.auth).send({ text });

  beforeAll(async () => {
    const keys = webpush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    version = app.get(AppConfigService).cruisingTermsVersion;
    admin = await person('Admin', Role.ADMIN);
    await liveSpot();
  });

  beforeEach(() => {
    pushed.length = 0;
    vi.restoreAllMocks();
    vi.spyOn(app.get(CruisingMediaStorage), 'diskLow').mockResolvedValue(false);
    vi.spyOn(app.get(MailService), 'send').mockImplementation((_message: MailMessage) =>
      Promise.resolve(),
    );
    vi.spyOn(app.get(CruisingPushService), 'send').mockImplementation(
      (target: PushTarget, payload: string) => {
        pushed.push({ endpoint: target.endpoint, payload: JSON.parse(payload) });
        return Promise.resolve({});
      },
    );
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cruisingSpot.deleteMany({ where: { name: { contains: tag } } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@codeqlick.test` } } });
    }
    await app?.get(CruisingMediaService).idle();
    await app?.close();
  });

  // ---- Private album -----------------------------------------------------------------------------

  describe('private album (decision 99)', () => {
    it('keeps private items to the owner, the team and grantees, and revokes on request', async () => {
      const owner = await member('Owner');
      const friend = await member('Friend');
      const stranger = await member('Strangr');
      await request(server())
        .put('/v1/cruising/push')
        .set(friend.auth)
        .send({
          endpoint: `https://push.example.test/${tag}/${friend.id}`,
          keys: { p256dh: `p256dh-${friend.id}`, auth: `auth-${friend.id}` },
        })
        .expect(204);

      const pub = await upload(owner, await photo(1));
      expect(pub.status).toBe(202);
      expect(pub.body.album).toBe('PUBLIC');
      const priv = await upload(owner, await photo(2), 'PRIVATE');
      expect(priv.status).toBe(202);
      expect(priv.body).toMatchObject({ album: 'PRIVATE', cover: false });

      // Nobody else sees the private one yet.
      expect((await fileOf(owner, priv.body.id)).status).toBe(200);
      expect((await fileOf(admin, priv.body.id)).status).toBe(200);
      expect((await fileOf(friend, priv.body.id)).status).toBe(404);
      expect((await fileOf(friend, pub.body.id)).status).toBe(200);
      const before = await request(server())
        .get(`/v1/cruising/members/${owner.nick}/media`)
        .set(friend.auth);
      expect(before.body.items.map((item: { id: string }) => item.id)).toEqual([pub.body.id]);

      // Sharing needs a conversation.
      expect((await share(owner, friend)).status).toBe(404);
      await talk(friend, owner);
      expect((await share(owner, friend)).status).toBe(204);
      await app.get(CruisingAlbumService).settled();
      expect(pushed).toHaveLength(1);
      expect(pushed[0]?.payload.body).toBe('Someone shared their private album with you');
      // Sharing again tells nobody.
      expect((await share(owner, friend)).status).toBe(204);
      await app.get(CruisingAlbumService).settled();
      expect(pushed).toHaveLength(1);

      expect((await fileOf(friend, priv.body.id)).status).toBe(200);
      expect((await fileOf(stranger, priv.body.id)).status).toBe(404);
      const after = await request(server())
        .get(`/v1/cruising/members/${owner.nick}/media`)
        .set(friend.auth);
      expect(after.body.items.map((item: { album: string }) => item.album).sort()).toEqual([
        'PRIVATE',
        'PUBLIC',
      ]);
      const strangerView = await request(server())
        .get(`/v1/cruising/members/${owner.nick}/media`)
        .set(stranger.auth);
      expect(strangerView.body.items).toHaveLength(1);

      const ownerGrants = await request(server())
        .get('/v1/cruising/album-grants')
        .set(owner.auth)
        .expect(200);
      expect(ownerGrants.body.given).toEqual([{ nickname: friend.nick, at: expect.any(String) }]);
      expect(ownerGrants.body.received).toEqual([]);
      const friendGrants = await request(server())
        .get('/v1/cruising/album-grants')
        .set(friend.auth);
      expect(friendGrants.body.received).toEqual([
        { nickname: owner.nick, at: expect.any(String) },
      ]);

      // A grantee may report a private item they can see.
      await request(server())
        .post('/v1/cruising/reports')
        .set(friend.auth)
        .send({ mediaId: priv.body.id, reason: 'SPAM' })
        .expect(204);

      // A suspended owner's private items are gone even for the grantee.
      await prisma.cruisingProfile.update({
        where: { userId: owner.id },
        data: { suspendedAt: new Date() },
      });
      expect((await fileOf(friend, priv.body.id)).status).toBe(404);
      await prisma.cruisingProfile.update({
        where: { userId: owner.id },
        data: { suspendedAt: null },
      });

      await request(server())
        .delete(`/v1/cruising/album-grants/${friend.nick}`)
        .set(owner.auth)
        .expect(204);
      expect((await fileOf(friend, priv.body.id)).status).toBe(404);
      // Revoking twice is fine.
      await request(server())
        .delete(`/v1/cruising/album-grants/${friend.nick}`)
        .set(owner.auth)
        .expect(204);
    });

    it('revokes both ways on a block or when the conversation is left', async () => {
      const a = await member('Alpha');
      const b = await member('Bravo');
      const conversation = await talk(a, b);
      await share(a, b).expect(204);
      await share(b, a).expect(204);
      expect(
        await prisma.cruisingAlbumGrant.count({ where: { ownerId: { in: [a.id, b.id] } } }),
      ).toBe(2);
      await request(server())
        .delete(`/v1/cruising/conversations/${conversation}`)
        .set(b.auth)
        .expect(204);
      expect(
        await prisma.cruisingAlbumGrant.count({ where: { ownerId: { in: [a.id, b.id] } } }),
      ).toBe(0);

      await talk(a, b);
      await share(a, b).expect(204);
      await share(b, a).expect(204);
      await request(server()).post('/v1/cruising/blocks').set(b.auth).send({ nickname: a.nick });
      expect(
        await prisma.cruisingAlbumGrant.count({ where: { ownerId: { in: [a.id, b.id] } } }),
      ).toBe(0);
      // Blocked: no new grant.
      expect((await share(a, b)).status).toBe(404);
    });

    it('limits each album to 12 photos, and moves items between albums', async () => {
      const owner = await member('Limits');
      await prisma.cruisingMedia.createMany({
        data: Array.from({ length: 12 }, (_, i) => ({
          ref: `${tag.slice(0, 6)}x${i}`,
          ownerId: owner.id,
          kind: 'PHOTO' as const,
          album: 'PRIVATE' as const,
          status: 'LIVE' as const,
          position: i,
        })),
      });
      expect((await upload(owner, await photo(20), 'PRIVATE')).status).toBe(409);
      const pub = await upload(owner, await photo(21));
      expect(pub.status).toBe(202);
      // The private album is full: no move into it.
      expect(
        (
          await request(server())
            .patch(`/v1/cruising/media/${pub.body.id}`)
            .set(owner.auth)
            .send({ album: 'PRIVATE' })
        ).status,
      ).toBe(409);
      const one = await prisma.cruisingMedia.findFirstOrThrow({
        where: { ownerId: owner.id, album: 'PRIVATE' },
      });
      await request(server())
        .patch(`/v1/cruising/media/${one.id}`)
        .set(owner.auth)
        .send({ album: 'PUBLIC' })
        .expect(204);
      await request(server())
        .patch(`/v1/cruising/media/${pub.body.id}`)
        .set(owner.auth)
        .send({ album: 'PRIVATE' })
        .expect(204);
      const mine = await request(server()).get('/v1/cruising/media').set(owner.auth);
      const moved = mine.body.items.find((item: { id: string }) => item.id === pub.body.id);
      expect(moved).toMatchObject({ album: 'PRIVATE', cover: false });
      // A private photo can't be the cover.
      expect(
        (
          await request(server())
            .patch(`/v1/cruising/media/${pub.body.id}`)
            .set(owner.auth)
            .send({ cover: true })
        ).status,
      ).toBe(409);
    });
  });

  // ---- City rooms --------------------------------------------------------------------------------

  describe('city rooms (decision 100)', () => {
    it('posts and reads in a city with LIVE spots only', async () => {
      const a = await member('Rooma');
      const b = await member('Roomb');
      expect((await request(server()).get(room)).status).toBe(401);
      const posted = await post(a, '  Anyone at the beach tonight?  ');
      expect(posted.status).toBe(201);
      expect(posted.body).toMatchObject({
        nickname: a.nick,
        text: 'Anyone at the beach tonight?',
        mine: true,
        verified: false,
      });
      const read = await request(server()).get(room).set(b.auth).expect(200);
      expect(read.body.posting).toEqual({ allowed: true, reason: null, until: null });
      const seen = read.body.items.find((item: { id: string }) => item.id === posted.body.id);
      expect(seen).toMatchObject({ mine: false, nickname: a.nick });
      const later = await request(server())
        .get(room)
        .query({ after: posted.body.at })
        .set(b.auth)
        .expect(200);
      expect(later.body.items.some((item: { id: string }) => item.id === posted.body.id)).toBe(
        false,
      );

      await liveSpot(`pending-${tag}`, 'PENDING');
      expect(
        (await request(server()).get(`/v1/cruising/rooms/is/pending-${tag}/messages`).set(a.auth))
          .status,
      ).toBe(404);
      expect((await post(a, 'x'.repeat(501))).status).toBe(400);
      expect((await post(a, '   ')).status).toBe(400);

      const outsider = await person('Outsider');
      expect((await request(server()).get(room).set(outsider.auth)).status).toBe(403);
    });

    it('needs a nickname, an account over 24 hours, no mute and no suspension', async () => {
      const nameless = await member('Noname', false);
      expect((await post(nameless, 'Hi')).status).toBe(409);
      const fresh = await member('Fresh');
      await prisma.user.update({ where: { id: fresh.id }, data: { createdAt: new Date() } });
      expect((await post(fresh, 'Hi')).status).toBe(403);
      const state = await request(server()).get(room).set(fresh.auth);
      expect(state.body.posting).toMatchObject({ allowed: false, reason: 'new-account' });

      const loud = await member('Loud');
      await request(server())
        .post(`/v1/admin/cruising/users/${loud.id}/room-mute`)
        .set(loud.auth)
        .send({ duration: '24h' })
        .expect(403);
      await request(server())
        .post(`/v1/admin/cruising/users/${loud.id}/room-mute`)
        .set(admin.auth)
        .send({ duration: '7d' })
        .expect(204);
      expect((await post(loud, 'Hi')).status).toBe(403);
      expect((await request(server()).get(room).set(loud.auth)).body.posting.reason).toBe('muted');
      await request(server())
        .post(`/v1/admin/cruising/users/${loud.id}/room-mute`)
        .set(admin.auth)
        .send({ duration: 'permanent' })
        .expect(204);
      const muted = await prisma.cruisingProfile.findUniqueOrThrow({ where: { userId: loud.id } });
      expect(muted.roomMutedUntil?.getUTCFullYear()).toBe(9999);
      await request(server())
        .delete(`/v1/admin/cruising/users/${loud.id}/room-mute`)
        .set(admin.auth)
        .expect(204);
      expect((await post(loud, 'Back again')).status).toBe(201);

      const banned = await member('Banned');
      await prisma.cruisingProfile.update({
        where: { userId: banned.id },
        data: { suspendedAt: new Date() },
      });
      expect((await post(banned, 'Hi')).status).toBe(403);
    });

    it('refuses contact details and links from the first message', async () => {
      const a = await member('Contact');
      expect((await post(a, 'text me 612 345 678')).status).toBe(400);
      expect((await post(a, 'I am on telegram')).status).toBe(400);
      expect((await post(a, 'pics at example.de/me')).status).toBe(400);
      expect((await post(a, 'https://example.org')).status).toBe(400);
      expect(await prisma.cruisingRoomMessage.count({ where: { userId: a.id } })).toBe(0);
    });

    it('allows 10 messages a minute and 200 a day', async () => {
      const a = await member('Rate');
      await prisma.cruisingRoomMessage.createMany({
        data: Array.from({ length: 10 }, (_, i) => ({
          countryCode: country,
          citySlug,
          userId: a.id,
          text: `message ${i}`,
        })),
      });
      expect((await post(a, 'one more')).status).toBe(429);
      await prisma.cruisingRoomMessage.updateMany({
        where: { userId: a.id },
        data: { createdAt: new Date(Date.now() - 2 * HOUR) },
      });
      expect((await post(a, 'one more')).status).toBe(201);
      await prisma.cruisingRoomMessage.createMany({
        data: Array.from({ length: 190 }, (_, i) => ({
          countryCode: country,
          citySlug,
          userId: a.id,
          text: `old ${i}`,
          createdAt: new Date(Date.now() - 3 * HOUR),
        })),
      });
      expect((await post(a, 'and another')).status).toBe(429);
      await prisma.cruisingRoomMessage.deleteMany({ where: { userId: a.id } });
    });

    it('hides blocked people’s messages from each other', async () => {
      const a = await member('Blocka');
      const b = await member('Blockb');
      const fromA = await post(a, 'Hello from A');
      const fromB = await post(b, 'Hello from B');
      await request(server()).post('/v1/cruising/blocks').set(a.auth).send({ nickname: b.nick });
      const ids = async (who: Person) =>
        (await request(server()).get(room).set(who.auth)).body.items.map(
          (item: { id: string }) => item.id,
        );
      expect(await ids(a)).not.toContain(fromB.body.id);
      expect(await ids(b)).not.toContain(fromA.body.id);
      const c = await member('Blockc');
      expect(await ids(c)).toEqual(expect.arrayContaining([fromA.body.id, fromB.body.id]));
    });

    it('hides a reported message at once for HARASSMENT and lets the team act', async () => {
      const author = await member('Author');
      const reporter = await member('Reporter');
      const message = await post(author, 'You are all idiots');
      expect(
        (
          await request(server())
            .post('/v1/cruising/reports')
            .set(reporter.auth)
            .send({ roomMessageId: message.body.id, reason: 'STOLEN' })
        ).status,
      ).toBe(400);
      await request(server())
        .post('/v1/cruising/reports')
        .set(reporter.auth)
        .send({ roomMessageId: message.body.id, reason: 'HARASSMENT' })
        .expect(204);
      const read = await request(server()).get(room).set(reporter.auth);
      expect(read.body.items.some((item: { id: string }) => item.id === message.body.id)).toBe(
        false,
      );

      const reports = await request(server())
        .get('/v1/admin/cruising/reports')
        .set(admin.auth)
        .query({ status: 'OPEN' });
      const report = reports.body.items.find(
        (item: { target: { type: string; roomMessage?: { id: string } } | null }) =>
          item.target?.type === 'ROOM_MESSAGE' && item.target.roomMessage?.id === message.body.id,
      );
      expect(report.transcript).toEqual([
        { from: 'reported', text: 'You are all idiots', at: message.body.at },
      ]);
      expect(report.target.roomMessage).toMatchObject({
        countryCode: country,
        citySlug,
        hidden: true,
      });
      expect(report.reported).toMatchObject({ userId: author.id, roomMutedUntil: null });

      // Dismissed: back up.
      await request(server())
        .post(`/v1/admin/cruising/reports/${report.id}/dismiss`)
        .set(admin.auth)
        .expect(204);
      const back = await request(server()).get(room).set(reporter.auth);
      expect(back.body.items.some((item: { id: string }) => item.id === message.body.id)).toBe(
        true,
      );

      // A SPAM report doesn't hide it; removing it deletes it and keeps the text in the report.
      await request(server())
        .post('/v1/cruising/reports')
        .set(reporter.auth)
        .send({ roomMessageId: message.body.id, reason: 'SPAM' })
        .expect(204);
      expect(
        (await prisma.cruisingRoomMessage.findUniqueOrThrow({ where: { id: message.body.id } }))
          .hidden,
      ).toBe(false);
      const spam = await prisma.cruisingReport.findFirstOrThrow({
        where: { roomMessageId: message.body.id, status: 'OPEN' },
      });
      await request(server())
        .post(`/v1/admin/cruising/reports/${spam.id}/action`)
        .set(admin.auth)
        .send({ remove: true })
        .expect(204);
      expect(await prisma.cruisingRoomMessage.count({ where: { id: message.body.id } })).toBe(0);
      const kept = await prisma.cruisingReport.findUniqueOrThrow({ where: { id: spam.id } });
      expect(kept.roomMessageId).toBeNull();
      expect(kept.transcript).toEqual([
        { from: 'reported', text: 'You are all idiots', at: message.body.at },
      ]);

      // The team deletes any message directly.
      const other = await post(author, 'Another one');
      await request(server())
        .delete(`/v1/admin/cruising/room-messages/${other.body.id}`)
        .set(admin.auth)
        .expect(204);
      await request(server())
        .delete(`/v1/admin/cruising/room-messages/${other.body.id}`)
        .set(admin.auth)
        .expect(404);
    });

    it('lists my rooms: favourites’ cities, trips’ cities and my country’s busiest', async () => {
      const a = await member('Lister');
      const spot = await prisma.cruisingSpot.findFirstOrThrow({
        where: { citySlug, status: 'LIVE' },
      });
      await request(server()).put(`/v1/cruising/favorites/${spot.id}`).set(a.auth);
      await post(a, 'Busy here');
      const list = await request(server()).get('/v1/cruising/rooms').set(a.auth).expect(200);
      const mine = list.body.items.find((item: { citySlug: string }) => item.citySlug === citySlug);
      expect(mine).toMatchObject({ countryCode: country, city: `Rooms ${tag}` });
      expect(mine.count24h).toBeGreaterThan(0);
      expect(typeof mine.lastAt).toBe('string');
      // A pending city has no room.
      expect(
        list.body.items.some((item: { citySlug: string }) => item.citySlug === `pending-${tag}`),
      ).toBe(false);
    });

    it('purges messages after 7 days in the hourly cleanup', async () => {
      const a = await member('Purge');
      const old = await prisma.cruisingRoomMessage.create({
        data: {
          countryCode: country,
          citySlug,
          userId: a.id,
          text: 'old news',
          createdAt: new Date(Date.now() - 8 * DAY),
        },
      });
      const fresh = await post(a, 'fresh news');
      await app.get(CruisingCommunityService).cleanup();
      expect(await prisma.cruisingRoomMessage.count({ where: { id: old.id } })).toBe(0);
      expect(await prisma.cruisingRoomMessage.count({ where: { id: fresh.body.id } })).toBe(1);
    });

    it('exports the room messages and album grants, and deletes them with the account', async () => {
      const a = await member('Export');
      const b = await member('Exportb');
      await post(a, 'Exported words');
      await talk(a, b);
      await share(a, b).expect(204);
      const data = await request(server()).get('/v1/auth/me/export').set(a.auth);
      expect(data.status).toBe(200);
      expect(data.body.cruising.roomMessages).toEqual([
        expect.objectContaining({ text: 'Exported words', countryCode: country, citySlug }),
      ]);
      expect(data.body.cruising.albumSharedWith).toEqual([
        { nickname: b.nick, createdAt: expect.any(String) },
      ]);
      await prisma.user.delete({ where: { id: a.id } });
      expect(await prisma.cruisingRoomMessage.count({ where: { userId: a.id } })).toBe(0);
      expect(await prisma.cruisingAlbumGrant.count({ where: { ownerId: a.id } })).toBe(0);
    });
  });
});
