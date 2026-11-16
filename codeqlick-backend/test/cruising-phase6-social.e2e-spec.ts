import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import request from 'supertest';
import webpush from 'web-push';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AppConfigService } from '../src/config/app-config.service.js';
import { Role } from '../src/generated/prisma/client.js';
import { CruisingCommunityService } from '../src/modules/cruising/cruising-community.service.js';
import { CruisingNotificationsService } from '../src/modules/cruising/cruising-notifications.service.js';
import {
  CruisingPushService,
  type PushTarget,
} from '../src/modules/cruising/cruising-push.service.js';
import { CruisingSocialService } from '../src/modules/cruising/cruising-social.service.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const tag = randomUUID().slice(0, 8);
const password = 'cruising-phase6-password-1';
const DAY = 24 * 60 * 60 * 1000;

type Person = { id: string; email: string; nick: string; auth: { Authorization: string } };

/** Cruising phase 6 (architecture 4.15): winks, profile visits and notifications (97, 98). */
describe('Cruising phase 6: winks, visits and notifications (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let version: string;
  let admin: Person;
  const pushed: { endpoint: string; payload: { body: string; url: string } }[] = [];
  let made = 0;
  let spotCount = 0;

  const server = () => app.getHttpServer();
  const idle = async () => {
    await app.get(CruisingCommunityService).idle();
    await app.get(CruisingSocialService).idle();
  };

  async function person(name: string, role: Role = Role.CLIENT): Promise<Person> {
    made += 1;
    const email = `e2e-cruising-p6-${name.toLowerCase()}-${tag}@codeqlick.test`;
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await prisma.user.create({ data: { email, name, role, passwordHash } });
    const token = await app.get(JwtService).signAsync({ sub: user.id, email, name, role });
    const nick = `${name.toLowerCase().slice(0, 6)}_${tag.slice(0, 6)}_${made}`;
    return { id: user.id, email, nick, auth: { Authorization: `Bearer ${token}` } };
  }

  async function member(name: string, over: Record<string, unknown> = {}): Promise<Person> {
    const who = await person(name);
    await prisma.cruisingProfile.create({
      data: {
        userId: who.id,
        birthYear: 1990,
        termsVersion: version,
        acceptedAt: new Date(),
        nickname: who.nick,
        ...over,
      },
    });
    return who;
  }

  async function spot(status: 'LIVE' | 'PENDING', createdById?: string) {
    spotCount += 1;
    const name = `Phase six spot ${spotCount} ${tag}`;
    return prisma.cruisingSpot.create({
      data: {
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name,
        type: 'BEACH',
        lat: 13.6 + spotCount / 1000,
        lng: -148.4,
        countryCode: 'PT',
        city: `Phase six ${tag}`,
        citySlug: `phase-six-${tag}`,
        description: 'A beach used for the phase 6 tests.',
        status,
        createdById: createdById ?? null,
      },
    });
  }

  const subscribe = (who: Person) =>
    request(server())
      .put('/v1/cruising/push')
      .set(who.auth)
      .send({
        endpoint: `https://push.example.test/${tag}/${who.id}`,
        keys: { p256dh: `p256dh-${who.id}`, auth: `auth-${who.id}` },
      })
      .expect(204);

  const wink = (who: Person, nickname: string) =>
    request(server()).put(`/v1/cruising/winks/${nickname}`).set(who.auth);

  const inbox = async (who: Person) =>
    (await request(server()).get('/v1/cruising/notifications').set(who.auth).expect(200)).body as {
      items: { id: string; kind: string; data: Record<string, unknown>; read: boolean }[];
      unread: number;
    };

  const setVisits = (who: Person, showVisits: boolean) =>
    request(server())
      .put('/v1/cruising/visits/settings')
      .set(who.auth)
      .send({ showVisits })
      .expect(200);

  const openProfile = (who: Person, nickname: string) =>
    request(server()).get(`/v1/cruising/members/${nickname}`).set(who.auth).expect(200);

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
    vi.spyOn(app.get(MailService), 'send').mockImplementation((_message: MailMessage) =>
      Promise.resolve(),
    );
    vi.spyOn(app.get(CruisingPushService), 'send').mockImplementation(
      (target: PushTarget, payload: string) => {
        pushed.push({ endpoint: target.endpoint, payload: JSON.parse(payload) });
        return Promise.resolve({});
      },
    );
    admin = await person('Admin', Role.ADMIN);
  });

  beforeEach(() => {
    pushed.length = 0;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cruisingSpot.deleteMany({ where: { name: { contains: tag } } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@codeqlick.test` } } });
    }
    await app?.close();
  });

  // ---- Winks -------------------------------------------------------------------------------------

  it('winks once per pair a day, tells the recipient without naming anyone, and lists winks', async () => {
    const [ana, bea] = await Promise.all([member('WAna'), member('WBea')]);
    const nameless = await member('WNone', { nickname: null });
    await subscribe(bea);

    expect((await request(server()).put(`/v1/cruising/winks/${bea.nick}`)).status).toBe(401);
    expect((await wink(nameless, bea.nick)).status).toBe(409);
    expect((await wink(ana, ana.nick)).status).toBe(400);
    expect((await wink(ana, `nobody_${tag}`)).status).toBe(404);

    expect((await wink(ana, bea.nick)).status).toBe(204);
    await idle();
    expect(pushed).toHaveLength(1);
    expect(pushed[0]!.payload.body).toBe('Someone winked at you');
    expect(JSON.stringify(pushed[0])).not.toContain(ana.nick);

    // A second wink the same day changes nothing.
    expect((await wink(ana, bea.nick)).status).toBe(204);
    expect(await prisma.cruisingWink.count({ where: { senderId: ana.id } })).toBe(1);
    expect(pushed).toHaveLength(1);

    const received = await request(server()).get('/v1/cruising/winks').set(bea.auth).expect(200);
    expect(received.body.items).toEqual([
      { nickname: ana.nick, verified: false, at: expect.any(String), mutual: false },
    ]);
    const centre = await inbox(bea);
    expect(centre.unread).toBe(1);
    expect(centre.items[0]).toMatchObject({ kind: 'WINK', data: { count: 1 }, read: false });
    expect(JSON.stringify(centre)).not.toContain(ana.nick);

    // Winking back makes it mutual; the profile says I winked.
    expect((await wink(bea, ana.nick)).status).toBe(204);
    const back = await request(server()).get('/v1/cruising/winks').set(bea.auth).expect(200);
    expect(back.body.items[0].mutual).toBe(true);
    expect((await openProfile(bea, ana.nick)).body.winked).toBe(true);
    expect((await openProfile(ana, bea.nick)).body.winked).toBe(true);
  });

  it('stops at 30 winks a day and hides blocked members', async () => {
    const sender = await member('WMany');
    const others = await Promise.all(Array.from({ length: 30 }, (_, i) => member(`WTo${i}`)));
    await prisma.cruisingWink.createMany({
      data: others.map((other) => ({ senderId: sender.id, recipientId: other.id })),
    });
    const last = await member('WLast');
    expect((await wink(sender, last.nick)).status).toBe(429);

    const [cara, dani] = await Promise.all([member('WCara'), member('WDani')]);
    expect((await wink(cara, dani.nick)).status).toBe(204);
    await request(server())
      .post('/v1/cruising/blocks')
      .set(dani.auth)
      .send({ nickname: cara.nick })
      .expect(204);
    expect((await wink(cara, dani.nick)).status).toBe(404);
    const list = await request(server()).get('/v1/cruising/winks').set(dani.auth).expect(200);
    expect(list.body.items).toEqual([]);
  });

  // ---- Visits ------------------------------------------------------------------------------------

  it('records visits only between members who turned them on, and turning off deletes them', async () => {
    const [eva, fran, gil] = await Promise.all([member('VEva'), member('VFran'), member('VGil')]);

    // Off by default: nothing is recorded and nobody sees visitors.
    await openProfile(eva, fran.nick);
    expect(await prisma.cruisingProfileView.count({ where: { viewedId: fran.id } })).toBe(0);
    expect(
      (await request(server()).get('/v1/cruising/visits').set(fran.auth).expect(200)).body,
    ).toEqual({ showVisits: false, items: [] });

    await setVisits(fran, true);
    // Eva still has visits off: she isn't recorded.
    await openProfile(eva, fran.nick);
    expect(await prisma.cruisingProfileView.count({ where: { viewedId: fran.id } })).toBe(0);

    await setVisits(eva, true);
    await setVisits(gil, true);
    await openProfile(eva, fran.nick);
    await openProfile(eva, fran.nick);
    await openProfile(gil, fran.nick);
    await openProfile(fran, fran.nick);
    await openProfile(fran, eva.nick);
    const visitors = await request(server()).get('/v1/cruising/visits').set(fran.auth).expect(200);
    expect(visitors.body.showVisits).toBe(true);
    expect(visitors.body.items.map((item: { nickname: string }) => item.nickname)).toEqual([
      gil.nick,
      eva.nick,
    ]);
    // The day's summary counts the visitors, not the visits.
    const centre = await inbox(fran);
    expect(centre.items.filter((item) => item.kind === 'VISITS')).toEqual([
      expect.objectContaining({ data: { count: 2 }, read: false }),
    ]);

    // Turning it off deletes Fran's visits both ways.
    await setVisits(fran, false);
    expect(
      await prisma.cruisingProfileView.count({
        where: { OR: [{ viewerId: fran.id }, { viewedId: fran.id }] },
      }),
    ).toBe(0);
    expect(await prisma.cruisingProfileView.count({ where: { viewerId: gil.id } })).toBe(0);
    expect((await inbox(fran)).items.some((item) => item.kind === 'VISITS')).toBe(false);
  });

  // ---- Notification centre -----------------------------------------------------------------------

  it('keeps one unread notification per conversation, read when the conversation is opened', async () => {
    const [hugo, ines] = await Promise.all([member('NHugo'), member('NInes')]);
    const opened = await request(server())
      .post('/v1/cruising/conversations')
      .set(hugo.auth)
      .send({ nickname: ines.nick })
      .expect(201);
    const id = opened.body.id as string;
    for (const text of ['Hello', 'Are you there?']) {
      await request(server())
        .post(`/v1/cruising/conversations/${id}/messages`)
        .set(hugo.auth)
        .send({ text })
        .expect(201);
      await idle();
    }
    let centre = await inbox(ines);
    expect(centre.unread).toBe(1);
    expect(centre.items).toEqual([
      expect.objectContaining({ kind: 'MESSAGE', data: { conversationId: id }, read: false }),
    ]);
    expect(JSON.stringify(centre)).not.toContain('Hello');

    await request(server()).get(`/v1/cruising/conversations/${id}/messages`).set(ines.auth);
    centre = await inbox(ines);
    expect(centre.unread).toBe(0);

    // A new message after reading is a new notification.
    await request(server())
      .post(`/v1/cruising/conversations/${id}/messages`)
      .set(hugo.auth)
      .send({ text: 'Again' })
      .expect(201);
    await idle();
    expect((await inbox(ines)).unread).toBe(1);
  });

  it('tells the proposer, the savers and the attendees, and marks read', async () => {
    const [proposer, saver, host] = await Promise.all([
      member('NProp'),
      member('NSave'),
      member('NHost'),
    ]);
    const pending = await spot('PENDING', proposer.id);
    await request(server())
      .post(`/v1/admin/cruising/spots/${pending.id}/approve`)
      .set(admin.auth)
      .expect(204);
    const published = await inbox(proposer);
    expect(published.items[0]).toMatchObject({
      kind: 'SPOT_PUBLISHED',
      data: { spotId: pending.id },
      spot: { slug: pending.slug, name: pending.name },
    });

    // The saver has no device and no email alerts: the centre still hears of the meetup.
    await request(server()).put(`/v1/cruising/favorites/${pending.id}`).set(saver.auth).expect(204);
    await prisma.cruisingProfile.update({
      where: { userId: saver.id },
      data: { emailAlerts: false },
    });
    const planned = await request(server())
      .post('/v1/cruising/meetups')
      .set(host.auth)
      .send({
        spotId: pending.id,
        startsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        hours: 2,
        title: 'Sunset walk',
      })
      .expect(201);
    await idle();
    expect((await inbox(saver)).items[0]).toMatchObject({
      kind: 'MEETUP_PLANNED',
      data: { spotId: pending.id },
    });

    await request(server())
      .put(`/v1/cruising/meetups/${planned.body.id}/attendance`)
      .set(saver.auth)
      .send({})
      .expect(204);
    await request(server())
      .delete(`/v1/cruising/meetups/${planned.body.id}`)
      .set(host.auth)
      .expect(204);
    await idle();
    const centre = await inbox(saver);
    expect(centre.items[0]).toMatchObject({
      kind: 'MEETUP_CANCELLED',
      data: { meetupId: planned.body.id },
    });
    expect(centre.unread).toBe(2);

    await request(server())
      .post('/v1/cruising/notifications/read')
      .set(saver.auth)
      .send({ ids: [centre.items[0]!.id] })
      .expect(204);
    expect((await inbox(saver)).unread).toBe(1);
    await request(server())
      .post('/v1/cruising/notifications/read')
      .set(saver.auth)
      .send({})
      .expect(204);
    expect((await inbox(saver)).unread).toBe(0);
    await request(server())
      .post('/v1/cruising/notifications/read')
      .set(saver.auth)
      .send({ ids: ['not-an-id'] })
      .expect(400);

    // Someone else's ids change nothing of mine, and nothing of theirs.
    const other = await inbox(proposer);
    await request(server())
      .post('/v1/cruising/notifications/read')
      .set(saver.auth)
      .send({ ids: [other.items[0]!.id] })
      .expect(204);
    expect((await inbox(proposer)).unread).toBe(other.unread);
  });

  it('keeps 30 days and at most 200 a member', async () => {
    const jon = await member('NJon');
    const now = Date.now();
    await prisma.cruisingNotification.createMany({
      data: [
        ...Array.from({ length: 205 }, (_, i) => ({
          userId: jon.id,
          kind: 'MEDIA_REMOVED' as const,
          createdAt: new Date(now - (i + 1) * 60_000),
        })),
        { userId: jon.id, kind: 'MEDIA_REMOVED' as const, createdAt: new Date(now - 31 * DAY) },
      ],
    });
    const centre = await inbox(jon);
    expect(centre.items).toHaveLength(200);
    await app.get(CruisingNotificationsService).cleanup(new Date(now));
    expect(await prisma.cruisingNotification.count({ where: { userId: jon.id } })).toBe(200);
    expect(
      await prisma.cruisingNotification.count({
        where: { userId: jon.id, createdAt: { lt: new Date(now - 200 * 60_000) } },
      }),
    ).toBe(0);
  });

  it('needs entry', async () => {
    const outsider = await person('NOut');
    expect(
      (await request(server()).get('/v1/cruising/notifications').set(outsider.auth)).status,
    ).toBe(403);
    expect((await request(server()).get('/v1/cruising/winks').set(outsider.auth)).status).toBe(403);
    expect((await request(server()).get('/v1/cruising/visits').set(outsider.auth)).status).toBe(
      403,
    );
  });

  // ---- The account ------------------------------------------------------------------------------

  it('exports winks, visits and notifications, and deleting the account deletes them', async () => {
    const [kim, lou] = await Promise.all([member('XKim'), member('XLou')]);
    await setVisits(kim, true);
    await setVisits(lou, true);
    await wink(kim, lou.nick).expect(204);
    await wink(lou, kim.nick).expect(204);
    await openProfile(kim, lou.nick);

    const exported = await request(server()).get('/v1/auth/me/export').set(kim.auth).expect(200);
    const cruising = exported.body.cruising;
    expect(cruising.profile.showVisits).toBe(true);
    expect(cruising.winksSent).toHaveLength(1);
    expect(cruising.profilesVisited).toHaveLength(1);
    expect(cruising.notifications).toEqual([expect.objectContaining({ kind: 'WINK' })]);
    expect(JSON.stringify(cruising.winksSent)).not.toContain(lou.nick);

    await request(server()).delete('/v1/auth/me').set(kim.auth).send({ password }).expect(204);
    expect(
      await prisma.cruisingWink.count({
        where: { OR: [{ senderId: kim.id }, { recipientId: kim.id }] },
      }),
    ).toBe(0);
    expect(
      await prisma.cruisingProfileView.count({
        where: { OR: [{ viewerId: kim.id }, { viewedId: kim.id }] },
      }),
    ).toBe(0);
    expect(await prisma.cruisingNotification.count({ where: { userId: kim.id } })).toBe(0);
  });
});
