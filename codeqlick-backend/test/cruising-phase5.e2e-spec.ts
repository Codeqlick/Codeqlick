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
import {
  CruisingPushService,
  type PushTarget,
} from '../src/modules/cruising/cruising-push.service.js';
import { CruisingSocialService } from '../src/modules/cruising/cruising-social.service.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const tag = randomUUID().slice(0, 8);
const password = 'cruising-phase5-password-1';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

type Person = { id: string; email: string; nick: string; auth: { Authorization: string } };

const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

const meetupBody = (spotId: string, over: Record<string, unknown> = {}) => ({
  spotId,
  startsAt: new Date(Date.now() + 2 * HOUR).toISOString(),
  hours: 2,
  title: 'Sunset walk',
  ...over,
});

/** Cruising phase 5 (architecture 4.15): meetups, trips and safety alerts (decisions 88, 90, 91). */
describe('Cruising phase 5 (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let version: string;
  let admin: Person;
  const sent: MailMessage[] = [];
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
    const email = `e2e-cruising-p5-${name.toLowerCase()}-${tag}@codeqlick.test`;
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await prisma.user.create({ data: { email, name, role, passwordHash } });
    const token = await app.get(JwtService).signAsync({ sub: user.id, email, name, role });
    const nick = `${name.toLowerCase().slice(0, 6)}_${tag.slice(0, 6)}_${made}`;
    return { id: user.id, email, nick, auth: { Authorization: `Bearer ${token}` } };
  }

  async function member(name: string, withNickname = true): Promise<Person> {
    const who = await person(name);
    await prisma.cruisingProfile.create({
      data: {
        userId: who.id,
        birthYear: 1990,
        termsVersion: version,
        acceptedAt: new Date(),
        ...(withNickname ? { nickname: who.nick } : {}),
      },
    });
    return who;
  }

  async function liveSpot(): Promise<{ id: string; slug: string }> {
    spotCount += 1;
    const name = `Phase five spot ${spotCount} ${tag}`;
    const row = await prisma.cruisingSpot.create({
      data: {
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name,
        type: 'BEACH',
        lat: 12.6 + spotCount / 1000,
        lng: -147.4,
        countryCode: 'PT',
        city: `Phase ${tag}`,
        citySlug: `phase-${tag}`,
        description: 'A beach used for the phase 5 tests.',
        status: 'LIVE',
      },
    });
    return { id: row.id, slug: row.slug };
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

  const plan = (who: Person, body: Record<string, unknown>) =>
    request(server()).post('/v1/cruising/meetups').set(who.auth).send(body);

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
    vi.spyOn(app.get(MailService), 'send').mockImplementation((message: MailMessage) => {
      sent.push(message);
      return Promise.resolve();
    });
    vi.spyOn(app.get(CruisingPushService), 'send').mockImplementation(
      (target: PushTarget, payload: string) => {
        pushed.push({ endpoint: target.endpoint, payload: JSON.parse(payload) });
        return Promise.resolve({});
      },
    );
    admin = await person('Admin', Role.ADMIN);
  });

  beforeEach(() => {
    sent.length = 0;
    pushed.length = 0;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cruisingSpot.deleteMany({ where: { name: { contains: tag } } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@codeqlick.test` } } });
    }
    await app?.close();
  });

  // ---- Meetups -----------------------------------------------------------------------------------

  it('plans meetups within the limits', async () => {
    const spot = await liveSpot();
    const host = await member('Host');
    const nameless = await member('Nameless', false);

    expect((await request(server()).get('/v1/cruising/meetups')).status).toBe(401);
    expect((await plan(nameless, meetupBody(spot.id))).status).toBe(409);
    const soon = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    expect((await plan(host, meetupBody(spot.id, { startsAt: soon }))).status).toBe(400);
    const far = new Date(Date.now() + 31 * DAY).toISOString();
    expect((await plan(host, meetupBody(spot.id, { startsAt: far }))).status).toBe(400);
    expect((await plan(host, meetupBody(spot.id, { hours: 5 }))).status).toBe(400);
    expect((await plan(host, meetupBody(spot.id, { capacity: 1 }))).status).toBe(400);
    expect(
      (await plan(host, meetupBody(spot.id, { description: 'write me at me@example.com' }))).status,
    ).toBe(400);

    const first = await plan(host, meetupBody(spot.id, { capacity: 2 }));
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      title: 'Sunset walk',
      capacity: 2,
      going: 0,
      mine: true,
      host: { nickname: host.nick, verified: false },
      spot: { id: spot.id, slug: spot.slug },
    });
    expect(new Date(first.body.endsAt).getTime() - new Date(first.body.startsAt).getTime()).toBe(
      2 * HOUR,
    );
    expect((await plan(host, meetupBody(spot.id))).status).toBe(201);
    expect((await plan(host, meetupBody(spot.id))).status).toBe(201);
    expect((await plan(host, meetupBody(spot.id))).status).toBe(429);
  });

  it('counts attendees, names the non-anonymous, fills up and hides blocked people', async () => {
    const spot = await liveSpot();
    const [host, ana, bea, carla, blocker] = await Promise.all(
      ['MHost', 'MAna', 'MBea', 'MCarla', 'MBlock'].map((name) => member(name)),
    );
    const created = await plan(host, meetupBody(spot.id, { capacity: 2 }));
    const id = created.body.id as string;

    expect(
      (await request(server()).put(`/v1/cruising/meetups/${id}/attendance`).set(host.auth).send({}))
        .status,
    ).toBe(409);
    await request(server())
      .put(`/v1/cruising/meetups/${id}/attendance`)
      .set(ana.auth)
      .send({ anonymous: false })
      .expect(204);
    await request(server())
      .put(`/v1/cruising/meetups/${id}/attendance`)
      .set(bea.auth)
      .send({ anonymous: true })
      .expect(204);
    // Full: a third person is refused; changing one's own flag is fine.
    expect(
      (
        await request(server())
          .put(`/v1/cruising/meetups/${id}/attendance`)
          .set(carla.auth)
          .send({})
      ).status,
    ).toBe(409);
    await request(server())
      .put(`/v1/cruising/meetups/${id}/attendance`)
      .set(bea.auth)
      .send({ anonymous: true })
      .expect(204);

    const list = await request(server())
      .get('/v1/cruising/meetups')
      .query({ spotId: spot.id })
      .set(carla.auth);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({
      going: 2,
      full: true,
      mine: false,
      attending: null,
      attendees: [{ nickname: ana.nick, verified: false }],
    });
    expect(JSON.stringify(list.body)).not.toContain(bea.nick);

    // The city page lists the city's meetups.
    const city = await request(server())
      .get('/v1/cruising/meetups')
      .query({ countryCode: 'PT', citySlug: `phase-${tag}` })
      .set(carla.auth);
    expect(city.body.items.map((item: { id: string }) => item.id)).toContain(id);

    // Blocks hide both ways: the host's meetups disappear for someone they blocked, and someone
    // who blocked an attendee doesn't see them going.
    await request(server())
      .post('/v1/cruising/blocks')
      .set(blocker.auth)
      .send({ nickname: ana.nick });
    const seen = await request(server())
      .get('/v1/cruising/meetups')
      .query({ spotId: spot.id })
      .set(blocker.auth);
    expect(seen.body.items[0].going).toBe(1);
    expect(JSON.stringify(seen.body)).not.toContain(ana.nick);
    await request(server())
      .post('/v1/cruising/blocks')
      .set(host.auth)
      .send({ nickname: carla.nick });
    const hidden = await request(server())
      .get('/v1/cruising/meetups')
      .query({ spotId: spot.id })
      .set(carla.auth);
    expect(hidden.body.items).toHaveLength(0);
    expect(
      (
        await request(server())
          .put(`/v1/cruising/meetups/${id}/attendance`)
          .set(carla.auth)
          .send({})
      ).status,
    ).toBe(404);

    // Leaving frees the place.
    await request(server())
      .delete(`/v1/cruising/meetups/${id}/attendance`)
      .set(ana.auth)
      .expect(204);
    expect(await prisma.cruisingMeetupAttendee.count({ where: { meetupId: id } })).toBe(1);
  });

  it('alerts the savers of the spot, never the host, blocked or suspended', async () => {
    const spot = await liveSpot();
    const [host, saver, blocked, suspended] = await Promise.all(
      ['AHost', 'ASaver', 'ABlkd', 'ASusp'].map((name) => member(name)),
    );
    for (const who of [host, saver, blocked, suspended]) {
      await request(server()).put(`/v1/cruising/favorites/${spot.id}`).set(who.auth).expect(204);
      await subscribe(who);
    }
    await prisma.cruisingBlock.create({ data: { blockerId: blocked.id, blockedId: host.id } });
    await prisma.cruisingProfile.update({
      where: { userId: suspended.id },
      data: { suspendedAt: new Date(), suspendedUntil: null },
    });

    expect((await plan(host, meetupBody(spot.id))).status).toBe(201);
    await idle();
    expect(pushed).toEqual([
      {
        endpoint: `https://push.example.test/${tag}/${saver.id}`,
        payload: expect.objectContaining({
          body: 'A meetup was planned at one of your favourite spots',
          url: '/en/meetups',
        }),
      },
    ]);
    expect(JSON.stringify(pushed)).not.toContain(spot.slug);
    expect(await prisma.cruisingAlert.count({ where: { spotId: spot.id } })).toBe(1);

    // /meetups lists the meetups at my favourites.
    const mine = await request(server()).get('/v1/cruising/meetups').set(saver.auth);
    expect(mine.body.items.some((item: { spot: { id: string } }) => item.spot.id === spot.id)).toBe(
      true,
    );
  });

  it('lets the host cancel and tells the attendees without naming it', async () => {
    const spot = await liveSpot();
    const [host, pushy, mailed, stranger] = await Promise.all(
      ['CHost', 'CPush', 'CMail', 'CStr'].map((name) => member(name)),
    );
    await subscribe(pushy);
    const id = (await plan(host, meetupBody(spot.id))).body.id as string;
    for (const who of [pushy, mailed]) {
      await request(server())
        .put(`/v1/cruising/meetups/${id}/attendance`)
        .set(who.auth)
        .send({})
        .expect(204);
    }
    expect(
      (await request(server()).delete(`/v1/cruising/meetups/${id}`).set(stranger.auth)).status,
    ).toBe(404);
    await request(server()).delete(`/v1/cruising/meetups/${id}`).set(host.auth).expect(204);
    await idle();
    expect(pushed.map((item) => [item.endpoint, item.payload.body])).toEqual([
      [`https://push.example.test/${tag}/${pushy.id}`, 'A meetup you joined was cancelled'],
    ]);
    expect(sent.map((message) => message.to)).toEqual([mailed.email]);
    expect(sent[0]?.subject).toBe('A meetup was cancelled — Cruising');
    expect(JSON.stringify(sent)).not.toContain('Sunset walk');
    expect(JSON.stringify(sent)).not.toContain(spot.slug);
    const after = await request(server())
      .get('/v1/cruising/meetups')
      .query({ spotId: spot.id })
      .set(pushy.auth);
    expect(after.body.items).toHaveLength(0);
  });

  it('hides a meetup reported for something serious until the team reviews it', async () => {
    const spot = await liveSpot();
    const [host, reporter] = await Promise.all(['RHost', 'RRep'].map((name) => member(name)));
    const id = (await plan(host, meetupBody(spot.id))).body.id as string;
    await request(server())
      .post('/v1/cruising/reports')
      .set(reporter.auth)
      .send({ meetupId: id, reason: 'ILLEGAL' })
      .expect(204);
    const list = await request(server())
      .get('/v1/cruising/meetups')
      .query({ spotId: spot.id })
      .set(reporter.auth);
    expect(list.body.items).toHaveLength(0);

    const reports = await request(server())
      .get('/v1/admin/cruising/reports')
      .set(admin.auth)
      .query({ status: 'OPEN' });
    const report = reports.body.items.find(
      (item: { target: { type: string; meetup?: { id: string } } | null }) =>
        item.target?.type === 'MEETUP' && item.target.meetup?.id === id,
    );
    expect(report).toBeDefined();
    expect(report.reported.userId).toBe(host.id);
    await request(server())
      .post(`/v1/admin/cruising/reports/${report.id}/dismiss`)
      .set(admin.auth)
      .expect(204);
    const back = await request(server())
      .get('/v1/cruising/meetups')
      .query({ spotId: spot.id })
      .set(reporter.auth);
    expect(back.body.items).toHaveLength(1);
  });

  // ---- Trips -------------------------------------------------------------------------------------

  it('announces trips within the limits and lists visitors to the city', async () => {
    await liveSpot();
    const [traveller, local, blocked, suspended, privateOne] = await Promise.all(
      ['TTrav', 'TLocal', 'TBlkd', 'TSusp', 'TPriv'].map((name) => member(name)),
    );
    const trip = (who: Person, from: string, to: string, listed = true) =>
      request(server())
        .post('/v1/cruising/trips')
        .set(who.auth)
        .send({ countryCode: 'PT', citySlug: `phase-${tag}`, from, to, listed });

    expect((await trip(traveller, day(-1), day(2))).status).toBe(400);
    expect((await trip(traveller, day(61), day(62))).status).toBe(400);
    expect((await trip(traveller, day(1), day(20))).status).toBe(400);
    expect(
      (
        await request(server())
          .post('/v1/cruising/trips')
          .set(traveller.auth)
          .send({ countryCode: 'PT', citySlug: 'nowhere-at-all', from: day(1), to: day(2) })
      ).status,
    ).toBe(404);
    const announced = await trip(traveller, day(3), day(5));
    expect(announced.status).toBe(201);
    expect(announced.body).toMatchObject({ from: day(3), to: day(5), listed: true });
    await trip(traveller, day(10), day(11)).expect(201);
    await trip(traveller, day(20), day(21)).expect(201);
    expect((await trip(traveller, day(30), day(31))).status).toBe(409);

    for (const who of [blocked, suspended]) await trip(who, day(2), day(4)).expect(201);
    await trip(privateOne, day(2), day(4), false).expect(201);
    await prisma.cruisingBlock.create({ data: { blockerId: local.id, blockedId: blocked.id } });
    await prisma.cruisingProfile.update({
      where: { userId: suspended.id },
      data: { suspendedAt: new Date(), suspendedUntil: null },
    });

    const path = `/v1/cruising/places/pt/phase-${tag}/visitors`;
    const outsider = await person('TOut');
    expect((await request(server()).get(path).set(outsider.auth)).status).toBe(403);
    const visitors = await request(server()).get(path).set(local.auth);
    expect(visitors.status).toBe(200);
    expect(visitors.body.items.map((item: { nickname: string }) => item.nickname)).toEqual([
      traveller.nick,
      traveller.nick,
      traveller.nick,
    ]);
    expect(visitors.body.items[0]).toEqual({
      nickname: traveller.nick,
      verified: false,
      from: day(3),
      to: day(5),
    });

    // From "Visiting soon", a conversation opens with the existing start.
    const opened = await request(server())
      .post('/v1/cruising/conversations')
      .set(local.auth)
      .send({ nickname: traveller.nick });
    expect(opened.status).toBe(201);

    // My trips carry the city's spots and meetups; deleting is mine only.
    const mine = await request(server()).get('/v1/cruising/trips').set(traveller.auth);
    expect(mine.body.items).toHaveLength(3);
    expect(mine.body.items[0].spots.length).toBeGreaterThan(0);
    const tripId = mine.body.items[0].id as string;
    expect(
      (await request(server()).delete(`/v1/cruising/trips/${tripId}`).set(local.auth)).status,
    ).toBe(404);
    await request(server()).delete(`/v1/cruising/trips/${tripId}`).set(traveller.auth).expect(204);

    // The day after a trip ends, it is deleted.
    await prisma.cruisingTrip.updateMany({
      where: { userId: privateOne.id },
      data: { startsOn: new Date(day(-3)), endsOn: new Date(day(-1)) },
    });
    await app.get(CruisingCommunityService).cleanup();
    expect(await prisma.cruisingTrip.count({ where: { userId: privateOne.id } })).toBe(0);
  });

  // ---- Safety alerts -----------------------------------------------------------------------------

  it('posts safety alerts that confirmations extend, "gone" ends, and never name the poster', async () => {
    const spot = await liveSpot();
    const [poster, saver, a, b, c] = await Promise.all(
      ['SPost', 'SSave', 'SA', 'SB', 'SC'].map((name) => member(name)),
    );
    await request(server()).put(`/v1/cruising/favorites/${spot.id}`).set(saver.auth).expect(204);
    await subscribe(saver);
    const nameless = await member('SNoNick', false);

    const posted = await request(server())
      .post(`/v1/cruising/spots/${spot.id}/alerts`)
      .set(nameless.auth)
      .send({ kind: 'THEFT', note: 'Bags taken from the dunes' });
    expect(posted.status).toBe(201);
    expect(posted.body).toMatchObject({ kind: 'THEFT', mine: true, confirmations: 0 });
    const id = posted.body.id as string;
    const expires = new Date(posted.body.expiresAt).getTime();
    expect(expires - new Date(posted.body.createdAt).getTime()).toBe(6 * HOUR);
    await idle();
    expect(pushed.map((item) => item.payload.body)).toEqual([
      'Safety alert at one of your favourite spots',
    ]);

    expect(
      (
        await request(server())
          .post(`/v1/cruising/spots/${spot.id}/alerts`)
          .set(poster.auth)
          .send({ kind: 'OTHER', note: 'call +34 600 111 222' })
      ).status,
    ).toBe(400);

    // Others see it, without anything about who posted it.
    const seen = await request(server()).get(`/v1/cruising/spots/${spot.id}/alerts`).set(a.auth);
    expect(seen.body.items).toEqual([
      expect.objectContaining({ id, kind: 'THEFT', mine: false, myVote: null }),
    ]);
    expect(JSON.stringify(seen.body)).not.toContain(nameless.id);
    expect(JSON.stringify(seen.body)).not.toContain(nameless.nick);

    // The poster can't vote; a confirmation adds 3 hours; once per member.
    expect(
      (await request(server()).post(`/v1/cruising/alerts/${id}/confirm`).set(nameless.auth)).status,
    ).toBe(409);
    await request(server()).post(`/v1/cruising/alerts/${id}/confirm`).set(a.auth).expect(204);
    expect(
      (await request(server()).post(`/v1/cruising/alerts/${id}/gone`).set(a.auth)).status,
    ).toBe(409);
    const row = await prisma.cruisingSafetyAlert.findUniqueOrThrow({ where: { id } });
    expect(row.expiresAt.getTime()).toBe(expires + 3 * HOUR);

    // Three "gone" end it.
    await request(server()).post(`/v1/cruising/alerts/${id}/gone`).set(b.auth).expect(204);
    await request(server()).post(`/v1/cruising/alerts/${id}/gone`).set(c.auth).expect(204);
    await request(server()).post(`/v1/cruising/alerts/${id}/gone`).set(saver.auth).expect(204);
    const ended = await request(server()).get(`/v1/cruising/spots/${spot.id}/alerts`).set(a.auth);
    expect(ended.body.items).toHaveLength(0);

    // 5 a day.
    for (let i = 0; i < 5; i += 1) {
      await request(server())
        .post(`/v1/cruising/spots/${spot.id}/alerts`)
        .set(poster.auth)
        .send({ kind: 'POLICE' })
        .expect(201);
    }
    expect(
      (
        await request(server())
          .post(`/v1/cruising/spots/${spot.id}/alerts`)
          .set(poster.auth)
          .send({ kind: 'POLICE' })
      ).status,
    ).toBe(429);
  });

  it('marks the map on the grid for entered members only, and hides a reported alert', async () => {
    const spot = await liveSpot();
    const [poster, viewer] = await Promise.all(['GPost', 'GView'].map((name) => member(name)));
    const outsider = await person('GOut');
    const alert = await request(server())
      .post(`/v1/cruising/spots/${spot.id}/alerts`)
      .set(poster.auth)
      .send({ kind: 'SURVEILLANCE' })
      .expect(201);
    const bbox = '-147.5,12.5,-147.25,12.75';
    expect((await request(server()).get('/v1/cruising/alerts').query({ bbox })).status).toBe(401);
    expect(
      (await request(server()).get('/v1/cruising/alerts').query({ bbox }).set(outsider.auth))
        .status,
    ).toBe(403);
    expect(
      (await request(server()).get('/v1/cruising/alerts').query({ bbox: 'nope' }).set(viewer.auth))
        .status,
    ).toBe(400);
    const box = await request(server()).get('/v1/cruising/alerts').query({ bbox }).set(viewer.auth);
    expect(box.status).toBe(200);
    expect(box.body.items).toContainEqual({ spotId: spot.id, alerts: 1 });
    expect(JSON.stringify(box.body)).not.toContain(poster.nick);

    await request(server())
      .post('/v1/cruising/reports')
      .set(viewer.auth)
      .send({ alertId: alert.body.id, reason: 'MINOR' })
      .expect(204);
    const after = await request(server())
      .get('/v1/cruising/alerts')
      .query({ bbox })
      .set(viewer.auth);
    expect(after.body.items.some((item: { spotId: string }) => item.spotId === spot.id)).toBe(
      false,
    );
    const reports = await request(server())
      .get('/v1/admin/cruising/reports')
      .set(admin.auth)
      .query({ status: 'OPEN' });
    const report = reports.body.items.find(
      (item: { target: { type: string; alert?: { id: string } } | null }) =>
        item.target?.type === 'ALERT' && item.target.alert?.id === alert.body.id,
    );
    expect(report.reported.userId).toBe(poster.id);
    await request(server())
      .post(`/v1/admin/cruising/reports/${report.id}/action`)
      .set(admin.auth)
      .send({ remove: true })
      .expect(204);
    expect(await prisma.cruisingSafetyAlert.count({ where: { id: alert.body.id } })).toBe(0);
  });
});
