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
import {
  CruisingPushService,
  type PushTarget,
} from '../src/modules/cruising/cruising-push.service.js';
import { CruisingSocialService } from '../src/modules/cruising/cruising-social.service.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/** The 18+ apps' members are NEOQLICK accounts (architecture 4.18); the admins are CODEQLICK ones. */
const realmOf = (role: Role): 'CODEQLICK' | 'NEOQLICK' =>
  role === Role.ADMIN ? 'CODEQLICK' : 'NEOQLICK';

const tag = randomUUID().slice(0, 8);
const password = 'cruising-social-password-1';

type Person = { id: string; email: string; nick: string; auth: { Authorization: string } };

/** Cruising phase 2 (architecture 4.15): profiles, check-ins, messages, blocks and their reports. */
describe('Cruising social (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let version: string;
  let admin: Person;
  const sent: MailMessage[] = [];
  /** The notifications the push services would have received: no network in tests. */
  const pushed: { endpoint: string; payload: { body: string; url: string } }[] = [];
  let pushFails: number | null = null;
  let made = 0;
  let spotCount = 0;

  const server = () => app.getHttpServer();

  async function person(name: string, role: Role = Role.CLIENT): Promise<Person> {
    made += 1;
    const email = `e2e-cruising-social-${name.toLowerCase()}-${tag}@codeqlick.test`;
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await prisma.user.create({
      data: { email, name, role, realm: realmOf(role), passwordHash },
    });
    const token = await app
      .get(JwtService)
      .signAsync({ sub: user.id, email, name, role, rlm: realmOf(role) });
    const nick = `${name.toLowerCase().slice(0, 6)}_${tag.slice(0, 6)}_${made}`;
    return { id: user.id, email, nick, auth: { Authorization: `Bearer ${token}` } };
  }

  /** A member who entered; with a nickname unless `withNickname` is false. */
  async function member(name: string, withNickname = true): Promise<Person> {
    const who = await person(name);
    await prisma.cruisingProfile.create({
      data: { userId: who.id, birthYear: 1990, termsVersion: version, acceptedAt: new Date() },
    });
    // Set straight in the database: the profile route is tested on its own below.
    if (withNickname) {
      await prisma.cruisingProfile.update({
        where: { userId: who.id },
        data: { nickname: who.nick },
      });
    }
    return who;
  }

  async function liveSpot(): Promise<{ id: string; slug: string }> {
    spotCount += 1;
    const name = `Social spot ${spotCount} ${tag}`;
    const row = await prisma.cruisingSpot.create({
      data: {
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name,
        type: 'PARK',
        lat: 11.5 + spotCount / 1000,
        lng: -148.5,
        countryCode: 'ES',
        city: `Social ${tag}`,
        citySlug: `social-${tag}`,
        description: 'A park used for the social tests.',
        status: 'LIVE',
      },
    });
    return { id: row.id, slug: row.slug };
  }

  const open = (who: Person, nickname: string) =>
    request(server()).post('/v1/cruising/conversations').set(who.auth).send({ nickname });

  const say = (who: Person, conversationId: string, text: string) =>
    request(server())
      .post(`/v1/cruising/conversations/${conversationId}/messages`)
      .set(who.auth)
      .send({ text });

  beforeAll(async () => {
    // Notifications on, with keys made for this run.
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
        if (pushFails !== null) {
          return Promise.reject(Object.assign(new Error('gone'), { statusCode: pushFails }));
        }
        pushed.push({ endpoint: target.endpoint, payload: JSON.parse(payload) });
        return Promise.resolve({});
      },
    );
    admin = await person('Admin', Role.ADMIN);
  });

  beforeEach(() => {
    sent.length = 0;
    pushed.length = 0;
    pushFails = null;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cruisingSpot.deleteMany({ where: { name: { contains: tag } } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@codeqlick.test` } } });
    }
    await app?.close();
  });

  it("uses the account's username as the Cruising name, and shares a chosen one with the account", async () => {
    const enter = (who: Person) =>
      request(server())
        .put('/v1/cruising/me')
        .set(who.auth)
        .send({
          birthDate: '1990-01-01',
          acceptTerms: true,
          consentSpecialData: true,
          termsVersion: version,
        })
        .expect(200);
    const short = tag.slice(0, 6);

    // An account with a username enters: Cruising takes it.
    const named = await person('UNamed');
    await prisma.user.update({ where: { id: named.id }, data: { username: `named_${short}` } });
    expect((await enter(named)).body.profile).toMatchObject({ nickname: `named_${short}` });

    // Taken in Cruising by another member: the person chooses one, as before.
    const holder = await person('UHolder');
    await prisma.cruisingProfile.create({
      data: {
        userId: holder.id,
        birthYear: 1990,
        termsVersion: version,
        acceptedAt: new Date(),
        nickname: `taken_${short}`,
      },
    });
    const late = await person('ULate');
    await prisma.user.update({ where: { id: late.id }, data: { username: `taken_${short}` } });
    expect((await enter(late)).body.profile).toBeNull();

    // No username yet: the Cruising name chosen becomes the account's username too.
    const fresh = await person('UFresh');
    await enter(fresh);
    expect(
      (await request(server()).get('/v1/cruising/me').set(fresh.auth)).body.profile,
    ).toBeNull();
    await request(server())
      .patch('/v1/cruising/profile')
      .set(fresh.auth)
      .send({ nickname: `fresh_${short}` })
      .expect(200);
    const account = await prisma.user.findUniqueOrThrow({ where: { id: fresh.id } });
    expect(account.username).toBe(`fresh_${short}`);
  });

  it('sets a nickname once and shows profiles only to members with a nickname', async () => {
    const ana = await member('Ana');
    const bea = await member('Bea', false);

    const me = await request(server()).get('/v1/cruising/me').set(ana.auth);
    expect(me.status).toBe(200);
    expect(me.body.profile).toMatchObject({ nickname: ana.nick, showAge: true });

    const saved = await request(server())
      .patch('/v1/cruising/profile')
      .set(ana.auth)
      .send({ bio: 'Hello', lookingFor: ['CHAT', 'FRIENDS'], showAge: false });
    expect(saved.status).toBe(200);
    expect(saved.body.profile).toMatchObject({ bio: 'Hello', showAge: false });

    // Taken, invalid or reserved nicknames are refused.
    const taken = await request(server())
      .patch('/v1/cruising/profile')
      .set(bea.auth)
      .send({ nickname: ana.nick });
    expect(taken.status).toBe(409);
    const invalid = await request(server())
      .patch('/v1/cruising/profile')
      .set(bea.auth)
      .send({ nickname: 'No spaces!' });
    expect(invalid.status).toBe(400);
    // Nicknames can change (decision 83); the old one stays Ana's for 14 days.
    const oldNick = ana.nick;
    const newNick = `new_${tag}`;
    const rename = await request(server())
      .patch('/v1/cruising/profile')
      .set(ana.auth)
      .send({ nickname: newNick });
    expect(rename.status).toBe(200);
    expect(rename.body.profile.nickname).toBe(newNick);
    ana.nick = newNick;
    const grab = await request(server())
      .patch('/v1/cruising/profile')
      .set(bea.auth)
      .send({ nickname: oldNick });
    expect(grab.status).toBe(409);
    // No waiting: another change at once, then back to the old one.
    const third = await request(server())
      .patch('/v1/cruising/profile')
      .set(ana.auth)
      .send({ nickname: `third_${tag}` });
    expect(third.status).toBe(200);
    const back = await request(server())
      .patch('/v1/cruising/profile')
      .set(ana.auth)
      .send({ nickname: oldNick });
    expect(back.status).toBe(200);
    ana.nick = oldNick;

    // Without a nickname, profiles stay closed.
    const closed = await request(server()).get(`/v1/cruising/members/${ana.nick}`).set(bea.auth);
    expect(closed.status).toBe(409);

    const carla = await member('Carla');
    const seen = await request(server()).get(`/v1/cruising/members/${ana.nick}`).set(carla.auth);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ nickname: ana.nick, bio: 'Hello', age: null });
    expect(seen.body.lookingFor).toEqual(['CHAT', 'FRIENDS']);
    const unknown = await request(server())
      .get(`/v1/cruising/members/nobody_${tag}`)
      .set(carla.auth);
    expect(unknown.status).toBe(404);
    const anonymous = await request(server()).get(`/v1/cruising/members/${ana.nick}`);
    expect(anonymous.status).toBe(401);
  });

  it('checks in at a spot and shows who is there, hiding the anonymous, blocked and suspended', async () => {
    const spot = await liveSpot();
    const dani = await member('Dani');
    const eva = await member('Eva');
    const fran = await member('Fran');
    const gus = await member('Gus');
    const nonick = await member('Hugo', false);

    const refused = await request(server())
      .post('/v1/cruising/check-ins')
      .set(nonick.auth)
      .send({ spotId: spot.id, hours: 1, anonymous: false });
    expect(refused.status).toBe(409);

    for (const [who, anonymous] of [
      [dani, false],
      [eva, true],
      [fran, false],
    ] as const) {
      const res = await request(server())
        .post('/v1/cruising/check-ins')
        .set(who.auth)
        .send({ spotId: spot.id, hours: 2, anonymous });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ spot: { id: spot.id }, anonymous });
    }
    const mine = await request(server()).get('/v1/cruising/check-in').set(dani.auth);
    expect(mine.status).toBe(200);
    expect(mine.body.spot.id).toBe(spot.id);

    const before = await request(server())
      .get(`/v1/cruising/spots/${spot.id}/presence`)
      .set(gus.auth);
    expect(before.status).toBe(200);
    expect(before.body.count).toBe(3);
    expect(before.body.members.map((m: { nickname: string }) => m.nickname).toSorted()).toEqual(
      [dani.nick, fran.nick].toSorted(),
    );

    // Gus blocks Fran: neither sees the other any more.
    const blocked = await request(server())
      .post('/v1/cruising/blocks')
      .set(gus.auth)
      .send({ nickname: fran.nick });
    expect(blocked.status).toBe(204);
    const afterBlock = await request(server())
      .get(`/v1/cruising/spots/${spot.id}/presence`)
      .set(gus.auth);
    expect(afterBlock.body.members.map((m: { nickname: string }) => m.nickname)).toEqual([
      dani.nick,
    ]);
    const hidden = await request(server()).get(`/v1/cruising/members/${gus.nick}`).set(fran.auth);
    expect(hidden.status).toBe(404);
    const list = await request(server()).get('/v1/cruising/blocks').set(gus.auth);
    expect(list.body.items.map((b: { nickname: string }) => b.nickname)).toEqual([fran.nick]);
    const lifted = await request(server()).delete(`/v1/cruising/blocks/${fran.nick}`).set(gus.auth);
    expect(lifted.status).toBe(204);

    // A suspension ends the check-in and hides the person.
    const suspended = await request(server())
      .post(`/v1/admin/cruising/users/${dani.id}/suspend`)
      .set(admin.auth)
      .send({ duration: '24h', category: 'HARASSMENT' });
    expect(suspended.status).toBe(204);
    const afterSuspension = await request(server())
      .get(`/v1/cruising/spots/${spot.id}/presence`)
      .set(gus.auth);
    expect(afterSuspension.body.members.map((m: { nickname: string }) => m.nickname)).toEqual([
      fran.nick,
    ]);
    expect(afterSuspension.body.count).toBe(2);

    // Ending my check-in.
    const ended = await request(server()).delete('/v1/cruising/check-in').set(fran.auth);
    expect(ended.status).toBe(204);
    const none = await request(server()).get('/v1/cruising/check-in').set(fran.auth);
    expect(none.body).toBeNull();

    // The overview counts the active ones.
    const overview = await request(server()).get('/v1/admin/cruising/overview').set(admin.auth);
    expect(overview.status).toBe(200);
    expect(typeof overview.body.activeCheckIns).toBe('number');
    expect(typeof overview.body.conversations).toBe('number');
  });

  it('talks in a conversation, filters contact details at first and emails unread messages once', async () => {
    const ivan = await member('Ivan');
    const jose = await member('Jose');

    const created = await open(ivan, jose.nick);
    expect(created.status).toBe(201);
    const again = await open(ivan, jose.nick);
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(created.body.id);
    const id = created.body.id as string;

    const early = await say(ivan, id, 'Call me on 612 345 678');
    expect(early.status).toBe(400);
    const hi = await say(ivan, id, 'Hi, are you there today?');
    expect(hi.status).toBe(201);
    expect(hi.body).toMatchObject({ mine: true, text: 'Hi, are you there today?' });

    const list = await request(server()).get('/v1/cruising/conversations').set(jose.auth);
    expect(list.status).toBe(200);
    const row = list.body.items.find((item: { id: string }) => item.id === id);
    expect(row).toMatchObject({ partner: { nickname: ivan.nick } });
    expect(row.unread).toBeTruthy();

    // Unread for a while: one email, with nothing in it but "you have a message".
    await prisma.cruisingMessage.updateMany({
      where: { conversationId: id },
      data: { createdAt: new Date(Date.now() - 20 * 60_000) },
    });
    await prisma.cruisingConversation.update({
      where: { id },
      data: { lastMessageAt: new Date(Date.now() - 20 * 60_000) },
    });
    const social = app.get(CruisingSocialService);
    expect(await social.emailUnread()).toBeGreaterThanOrEqual(1);
    const mail = sent.find((message) => message.to === jose.email);
    expect(mail?.subject).toBe('You have an unread message — Cruising');
    expect(mail?.text).not.toContain('are you there');
    expect(mail?.text).not.toContain(ivan.nick);
    sent.length = 0;
    await social.emailUnread();
    expect(sent.some((message) => message.to === jose.email)).toBe(false);

    // Reading marks them read.
    const read = await request(server())
      .get(`/v1/cruising/conversations/${id}/messages`)
      .set(jose.auth);
    expect(read.status).toBe(200);
    expect(read.body.items.map((m: { text: string; mine: boolean }) => m.mine)).toEqual([false]);

    // Strangers don't see it.
    const stranger = await member('Kike');
    const peek = await request(server())
      .get(`/v1/cruising/conversations/${id}/messages`)
      .set(stranger.auth);
    expect(peek.status).toBe(404);
    const intrusions = [
      await say(stranger, id, 'Hello?'),
      await request(server()).delete(`/v1/cruising/conversations/${id}`).set(stranger.auth),
      await request(server()).post(`/v1/cruising/conversations/${id}/block`).set(stranger.auth),
      await request(server())
        .post('/v1/cruising/reports')
        .set(stranger.auth)
        .send({ conversationId: id, reason: 'SPAM' }),
    ];
    expect(intrusions.map((res) => res.status)).toEqual([404, 404, 404, 404]);

    // After 5 messages each, contact details are allowed.
    for (let n = 0; n < 4; n += 1) {
      expect((await say(ivan, id, `Message ${n} from Ivan`)).status).toBe(201);
    }
    for (let n = 0; n < 5; n += 1) {
      expect((await say(jose, id, `Message ${n} from Jose`)).status).toBe(201);
    }
    expect((await say(ivan, id, 'Now: 612 345 678')).status).toBe(201);

    // Reporting the conversation saves its last messages; leaving deletes it for both.
    const reported = await request(server())
      .post('/v1/cruising/reports')
      .set(jose.auth)
      .send({ conversationId: id, reason: 'HARASSMENT', details: 'Too insistent.' });
    expect(reported.status).toBe(204);
    const reports = await request(server())
      .get('/v1/admin/cruising/reports?status=OPEN')
      .set(admin.auth);
    const report = reports.body.items.find(
      (item: { reported?: { userId?: string } | null; reason: string }) =>
        item.reason === 'HARASSMENT' && item.reported?.userId === ivan.id,
    );
    expect(report).toBeTruthy();
    expect(JSON.stringify(report)).toContain('Message 0 from Ivan');

    const left = await request(server()).delete(`/v1/cruising/conversations/${id}`).set(jose.auth);
    expect(left.status).toBe(204);
    // The start still counts toward Ivan's 10 a day after the conversation is gone.
    expect(await prisma.cruisingConversationStart.count({ where: { userId: ivan.id } })).toBe(1);
    const gone = await request(server())
      .get(`/v1/cruising/conversations/${id}/messages`)
      .set(ivan.auth);
    expect(gone.status).toBe(404);
    // The transcript survives the conversation.
    const still = await request(server())
      .get('/v1/admin/cruising/reports?status=OPEN')
      .set(admin.auth);
    expect(JSON.stringify(still.body)).toContain('Message 0 from Ivan');
  });

  it('blocks from a conversation, reports a profile, and exports and deletes everything', async () => {
    const luis = await member('Luis');
    const mario = await member('Mario');
    const spot = await liveSpot();

    const conv = await open(luis, mario.nick);
    expect(conv.status).toBe(201);
    expect((await say(luis, conv.body.id, 'Hello Mario')).status).toBe(201);
    // The export has the messages sent (before the block below deletes the conversation).
    const early = await request(server()).get('/v1/auth/me/export').set(luis.auth);
    expect(early.status).toBe(200);
    expect(JSON.stringify(early.body.cruising.messagesSent)).toContain('Hello Mario');

    const profileReport = await request(server())
      .post('/v1/cruising/reports')
      .set(mario.auth)
      .send({ nickname: luis.nick, reason: 'SPAM' });
    expect(profileReport.status).toBe(204);

    const blocked = await request(server())
      .post(`/v1/cruising/conversations/${conv.body.id}/block`)
      .set(mario.auth);
    expect(blocked.status).toBe(204);
    const reopen = await open(luis, mario.nick);
    expect(reopen.status).toBe(404);

    const checkIn = await request(server())
      .post('/v1/cruising/check-ins')
      .set(luis.auth)
      .send({ spotId: spot.id, hours: 1, anonymous: true });
    expect(checkIn.status).toBe(201);

    const exported = await request(server()).get('/v1/auth/me/export').set(luis.auth);
    expect(exported.status).toBe(200);
    const cruising = exported.body.cruising;
    expect(cruising.profile.nickname).toBe(luis.nick);
    expect(cruising.checkIns.length).toBe(1);
    // Blocking deleted the conversation, and its messages with it.
    expect(cruising.messagesSent).toEqual([]);

    const deleted = await request(server()).delete('/v1/auth/me').set(luis.auth).send({ password });
    expect(deleted.status).toBe(204);
    expect(await prisma.cruisingCheckIn.count({ where: { userId: luis.id } })).toBe(0);
    expect(await prisma.cruisingMessage.count({ where: { senderId: luis.id } })).toBe(0);
    expect(await prisma.cruisingProfile.count({ where: { userId: luis.id } })).toBe(0);
  });

  it('shows the active spots of a box only to entered members, counted like presence', async () => {
    // The 0.25° grid cell around the social spots (lat 11.5…, lng -148.5).
    const box = '-148.75,11.25,-148.25,11.75';
    const active = await liveSpot();
    const hiddenLater = await liveSpot();
    const elsewhere = await prisma.cruisingSpot.create({
      data: {
        slug: `social-far-${tag}`,
        name: `Social far ${tag}`,
        type: 'BEACH',
        lat: 20.5,
        lng: -140.5,
        countryCode: 'ES',
        city: `Social ${tag}`,
        citySlug: `social-${tag}`,
        description: 'Outside the box.',
        status: 'LIVE',
      },
    });
    const viewer = await member('Viewer', false);
    const [anon, named, blockedByMe, blockingMe, suspended, far, hidden] = await Promise.all(
      ['Anon', 'Named', 'Mine', 'Theirs', 'Susp', 'Far', 'Hid'].map((name) => member(name)),
    );
    const checkIn = (who: Person, spotId: string, anonymous = false) =>
      request(server())
        .post('/v1/cruising/check-ins')
        .set(who.auth)
        .send({ spotId, hours: 1, anonymous })
        .expect(201);
    await checkIn(anon, active.id, true);
    await checkIn(named, active.id);
    await checkIn(blockedByMe, active.id);
    await checkIn(blockingMe, active.id);
    await checkIn(suspended, active.id);
    await checkIn(far, elsewhere.id);
    await checkIn(hidden, hiddenLater.id);

    // Blocks both ways need a nickname to name the person: set straight in the database.
    await prisma.cruisingBlock.createMany({
      data: [
        { blockerId: viewer.id, blockedId: blockedByMe.id },
        { blockerId: blockingMe.id, blockedId: viewer.id },
      ],
    });
    // Suspended without ending the check-in, so only the filter can leave them out.
    await prisma.cruisingProfile.update({
      where: { userId: suspended.id },
      data: { suspendedAt: new Date(), suspendedUntil: null },
    });
    await prisma.cruisingSpot.update({ where: { id: hiddenLater.id }, data: { status: 'HIDDEN' } });

    const res = await request(server()).get(`/v1/cruising/active?bbox=${box}`).set(viewer.auth);
    expect(res.status).toBe(200);
    const mine = (res.body.items as { spotId: string; here: number }[]).filter((item) =>
      [active.id, hiddenLater.id, elsewhere.id].includes(item.spotId),
    );
    // The anonymous one counts; the blocked (both ways) and the suspended don't.
    expect(mine).toEqual([{ spotId: active.id, here: 2 }]);

    // Someone they blocked sees the person who blocked them as absent too.
    const fromBlocked = await request(server())
      .get(`/v1/cruising/active?bbox=${box}`)
      .set(blockedByMe.auth);
    expect(
      (fromBlocked.body.items as { spotId: string; here: number }[]).find(
        (item) => item.spotId === active.id,
      ),
    ).toEqual({ spotId: active.id, here: 4 });

    // Only for entered members; the box is checked like the map's.
    await request(server()).get(`/v1/cruising/active?bbox=${box}`).expect(401);
    const outsider = await person('Outsider');
    await request(server()).get(`/v1/cruising/active?bbox=${box}`).set(outsider.auth).expect(403);
    for (const bad of ['', '1,2,3', '-148,11,-149,12', 'a,b,c,d']) {
      await request(server()).get(`/v1/cruising/active?bbox=${bad}`).set(viewer.auth).expect(400);
    }
    await request(server()).get('/v1/cruising/active').set(viewer.auth).expect(400);
  });

  // ---- Favourites and alerts (phase 3, decision 85) ----------------------------------------------

  const social = () => app.get(CruisingSocialService);

  const checkInAt = (who: Person, spotId: string, anonymous = false) =>
    request(server())
      .post('/v1/cruising/check-ins')
      .set(who.auth)
      .send({ spotId, hours: 1, anonymous })
      .expect(201);

  const subscribe = (who: Person, id: string) =>
    request(server())
      .put('/v1/cruising/push')
      .set(who.auth)
      .send({
        endpoint: `https://push.example.test/${tag}/${id}`,
        keys: { p256dh: `p256dh-${id}`, auth: `auth-${id}` },
      });

  it('saves and removes favourites: LIVE spots only, idempotent, up to 100, with "here"', async () => {
    const owner = await member('Fav', false);
    const first = await liveSpot();
    const second = await liveSpot();
    const there = await member('There');

    await request(server()).put(`/v1/cruising/favorites/${first.id}`).set(owner.auth).expect(204);
    await request(server()).put(`/v1/cruising/favorites/${first.id}`).set(owner.auth).expect(204);
    await request(server()).put(`/v1/cruising/favorites/${second.id}`).set(owner.auth).expect(204);
    expect(await prisma.cruisingFavorite.count({ where: { userId: owner.id } })).toBe(2);
    await checkInAt(there, first.id, true);
    await social().idle();

    const list = await request(server()).get('/v1/cruising/favorites').set(owner.auth);
    expect(list.status).toBe(200);
    // Newest first; the anonymous check-in counts in "here".
    expect(
      list.body.items.map((item: { spot: { id: string }; here: number }) => [
        item.spot.id,
        item.here,
      ]),
    ).toEqual([
      [second.id, 0],
      [first.id, 1],
    ]);
    expect(list.body.items[0].spot).toMatchObject({ slug: second.slug, type: 'PARK' });
    expect(typeof list.body.items[0].savedAt).toBe('string');

    // A spot leaving LIVE drops out of the list but the row stays; it can't be saved meanwhile.
    await prisma.cruisingSpot.update({ where: { id: second.id }, data: { status: 'HIDDEN' } });
    const hidden = await request(server()).get('/v1/cruising/favorites').set(owner.auth);
    expect(hidden.body.items.map((item: { spot: { id: string } }) => item.spot.id)).toEqual([
      first.id,
    ]);
    expect(await prisma.cruisingFavorite.count({ where: { userId: owner.id } })).toBe(2);
    const other = await member('Other', false);
    await request(server()).put(`/v1/cruising/favorites/${second.id}`).set(other.auth).expect(404);
    await request(server())
      .put(`/v1/cruising/favorites/${randomUUID()}`)
      .set(owner.auth)
      .expect(404);
    await request(server()).put('/v1/cruising/favorites/not-a-uuid').set(owner.auth).expect(400);

    // Removing is idempotent too.
    await request(server())
      .delete(`/v1/cruising/favorites/${first.id}`)
      .set(owner.auth)
      .expect(204);
    await request(server())
      .delete(`/v1/cruising/favorites/${first.id}`)
      .set(owner.auth)
      .expect(204);
    expect(await prisma.cruisingFavorite.count({ where: { userId: owner.id } })).toBe(1);

    // 100 at most (filled straight in the database).
    const bulk = await Promise.all(
      Array.from({ length: 99 }, (_, i) =>
        prisma.cruisingSpot.create({
          data: {
            slug: `fav-bulk-${i}-${tag}`,
            name: `Fav bulk ${i} ${tag}`,
            type: 'PARK',
            lat: 12,
            lng: -147,
            countryCode: 'ES',
            city: `Social ${tag}`,
            citySlug: `social-${tag}`,
            description: 'Filling the favourites.',
            status: 'LIVE',
          },
        }),
      ),
    );
    await prisma.cruisingFavorite.createMany({
      data: bulk.map((spot) => ({ userId: owner.id, spotId: spot.id })),
    });
    const third = await liveSpot();
    await request(server()).put(`/v1/cruising/favorites/${third.id}`).set(owner.auth).expect(409);
    // One already saved is still fine at the cap.
    await request(server())
      .put(`/v1/cruising/favorites/${bulk[0]!.id}`)
      .set(owner.auth)
      .expect(204);

    // Members only.
    await request(server()).get('/v1/cruising/favorites').expect(401);
    const outsider = await person('FavOut');
    await request(server()).get('/v1/cruising/favorites').set(outsider.auth).expect(403);
    await request(server())
      .put(`/v1/cruising/favorites/${third.id}`)
      .set(outsider.auth)
      .expect(403);

    // The export has them, and deleting the account deletes them.
    const exported = await request(server()).get('/v1/auth/me/export').set(owner.auth);
    expect(exported.body.cruising.favorites).toHaveLength(100);
    await request(server()).delete('/v1/auth/me').set(owner.auth).send({ password }).expect(204);
    expect(await prisma.cruisingFavorite.count({ where: { userId: owner.id } })).toBe(0);
  });

  it('stores push subscriptions (5 a device each), and answers 409 without VAPID keys', async () => {
    const ines = await member('Ines', false);
    const me = await request(server()).get('/v1/cruising/me').set(ines.auth);
    expect(me.body).toMatchObject({
      favoriteAlerts: true,
      favoriteEmails: false,
      pushPublicKey: process.env.VAPID_PUBLIC_KEY,
    });

    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
      expect((await subscribe(ines, id)).status).toBe(204);
    }
    const kept = await prisma.cruisingPushSubscription.findMany({
      where: { userId: ines.id },
      select: { endpoint: true },
    });
    // Up to 5: the oldest went.
    expect(kept.map((row) => row.endpoint.split('/').at(-1)).toSorted()).toEqual([
      'b',
      'c',
      'd',
      'e',
      'f',
    ]);
    // Again is fine; plain http is refused.
    expect((await subscribe(ines, 'f')).status).toBe(204);
    await request(server())
      .put('/v1/cruising/push')
      .set(ines.auth)
      .send({ endpoint: 'http://push.example.test/x', keys: { p256dh: 'p', auth: 'a' } })
      .expect(400);

    await request(server())
      .delete('/v1/cruising/push')
      .set(ines.auth)
      .send({ endpoint: `https://push.example.test/${tag}/f` })
      .expect(204);
    await request(server())
      .delete('/v1/cruising/push')
      .set(ines.auth)
      .send({ endpoint: 'https://push.example.test/unknown' })
      .expect(204);
    expect(await prisma.cruisingPushSubscription.count({ where: { userId: ines.id } })).toBe(4);

    // Not entered: 403.
    const outsider = await person('PushOut');
    expect((await subscribe(outsider, 'z')).status).toBe(403);

    // Without VAPID keys notifications are off.
    const vapid = vi.spyOn(app.get(AppConfigService), 'vapid', 'get').mockReturnValue(undefined);
    try {
      expect((await subscribe(ines, 'g')).status).toBe(409);
      const off = await request(server()).get('/v1/cruising/me').set(ines.auth);
      expect(off.body.pushPublicKey).toBeNull();
    } finally {
      vapid.mockRestore();
    }

    // The settings are saved with the profile.
    const saved = await request(server())
      .patch('/v1/cruising/profile')
      .set(ines.auth)
      .send({ favoriteAlerts: false, favoriteEmails: true });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ favoriteAlerts: false, favoriteEmails: true });
  });

  it('alerts the savers of a spot by push, never the checker, blocked or suspended', async () => {
    const spot = await liveSpot();
    const [checker, saver, blocked, blocking, suspended, quiet, outdated] = await Promise.all(
      ['AChk', 'ASaver', 'ABlkd', 'ABlkg', 'ASusp', 'AQuiet', 'AOld'].map((name) => member(name)),
    );
    for (const who of [checker, saver, blocked, blocking, suspended, quiet, outdated]) {
      await request(server()).put(`/v1/cruising/favorites/${spot.id}`).set(who.auth).expect(204);
      expect((await subscribe(who, `alert-${who.id}`)).status).toBe(204);
    }
    await prisma.cruisingBlock.createMany({
      data: [
        { blockerId: checker.id, blockedId: blocked.id },
        { blockerId: blocking.id, blockedId: checker.id },
      ],
    });
    await prisma.cruisingProfile.update({
      where: { userId: suspended.id },
      data: { suspendedAt: new Date(), suspendedUntil: null },
    });
    await prisma.cruisingProfile.update({
      where: { userId: quiet.id },
      data: { favoriteAlerts: false },
    });
    await prisma.cruisingProfile.update({
      where: { userId: outdated.id },
      data: { termsVersion: 'old-rules' },
    });
    await prisma.user.update({ where: { id: saver.id }, data: { locale: 'ES' } });

    // Anonymous check-ins alert too, and never say who.
    await checkInAt(checker, spot.id, true);
    await social().idle();
    const alerts = await prisma.cruisingAlert.findMany({ where: { spotId: spot.id } });
    expect(alerts.map((row) => [row.userId, row.channel])).toEqual([[saver.id, 'PUSH']]);
    expect(pushed).toEqual([
      {
        endpoint: `https://push.example.test/${tag}/alert-${saver.id}`,
        payload: expect.objectContaining({
          title: 'Cruising',
          body: 'Hay alguien en uno de tus lugares favoritos',
          url: '/es/favorites',
        }),
      },
    ]);
    expect(JSON.stringify(pushed)).not.toContain(checker.nick);
    expect(JSON.stringify(pushed)).not.toContain(spot.slug);
    expect(sent).toHaveLength(0);

    // Within 3 hours, another check-in at the same spot doesn't alert the saver again (the
    // blocks were the first checker's: this one alerts those two and that checker, once).
    pushed.length = 0;
    const another = await member('Again');
    await checkInAt(another, spot.id);
    await social().idle();
    expect(pushed.map((item) => item.endpoint).toSorted()).toEqual(
      [checker, blocked, blocking]
        .map((who) => `https://push.example.test/${tag}/alert-${who.id}`)
        .toSorted(),
    );
    expect(await prisma.cruisingAlert.count({ where: { userId: saver.id } })).toBe(1);

    // A device the push service says is gone is deleted.
    await prisma.cruisingAlert.deleteMany({ where: { userId: saver.id } });
    pushFails = 410;
    await checkInAt(another, spot.id);
    await social().idle();
    expect(await prisma.cruisingPushSubscription.count({ where: { userId: saver.id } })).toBe(0);
  });

  it('caps alerts at 10 a day and emails members without push once a day, if they asked', async () => {
    const [first, second, third] = [await liveSpot(), await liveSpot(), await liveSpot()];
    const capped = await member('Capped');
    const emailed = await member('Mailed');
    const noEmail = await member('NoMail');
    const checker = await member('Chk2');
    for (const who of [capped, emailed, noEmail]) {
      for (const spot of [first, second, third]) {
        await request(server()).put(`/v1/cruising/favorites/${spot.id}`).set(who.auth).expect(204);
      }
    }
    expect((await subscribe(capped, 'capped')).status).toBe(204);
    await prisma.cruisingProfile.update({
      where: { userId: emailed.id },
      data: { favoriteEmails: true },
    });
    // Ten alerts already today (about other spots).
    await prisma.cruisingAlert.createMany({
      data: Array.from({ length: 10 }, (_, i) => ({
        userId: capped.id,
        spotId: i % 2 === 0 ? second.id : third.id,
        channel: 'PUSH' as const,
        createdAt: new Date(Date.now() - (5 + i) * 3600_000),
      })),
    });

    await checkInAt(checker, first.id);
    await social().idle();
    expect(pushed).toHaveLength(0);
    expect(await prisma.cruisingAlert.count({ where: { userId: capped.id } })).toBe(10);
    // The one who asked for emails gets one, saying nothing more than that.
    expect(sent.map((mail) => mail.to)).toEqual([emailed.email]);
    expect(sent[0]!.subject).toBe("There's activity at your favourite spots — Cruising");
    expect(JSON.stringify(sent[0])).not.toContain(first.slug);
    expect(JSON.stringify(sent[0])).not.toContain(checker.nick);

    // Another favourite spot the same day: no second email.
    sent.length = 0;
    await checkInAt(checker, second.id);
    await social().idle();
    expect(sent).toHaveLength(0);
    expect(
      await prisma.cruisingAlert.count({ where: { userId: emailed.id, channel: 'EMAIL' } }),
    ).toBe(1);
    expect(await prisma.cruisingAlert.count({ where: { userId: noEmail.id } })).toBe(0);

    // Alerts older than two days go with the hourly cleanup.
    await prisma.cruisingAlert.updateMany({
      where: { userId: capped.id },
      data: { createdAt: new Date(Date.now() - 3 * 24 * 3600_000) },
    });
    await social().cleanupCheckIns();
    expect(await prisma.cruisingAlert.count({ where: { userId: capped.id } })).toBe(0);
  });

  it('pushes "new message" to the recipient at once and keeps the unread email', async () => {
    const [writer, reader] = [await member('Writer'), await member('Reader')];
    expect((await subscribe(reader, 'reader')).status).toBe(204);
    const conv = await open(writer, reader.nick);
    expect(conv.status).toBe(201);
    expect((await say(writer, conv.body.id, 'Hi there')).status).toBe(201);
    await social().idle();
    expect(pushed).toEqual([
      {
        endpoint: `https://push.example.test/${tag}/reader`,
        payload: expect.objectContaining({ body: 'New message', url: '/en/messages' }),
      },
    ]);
    expect(JSON.stringify(pushed)).not.toContain('Hi there');
    expect(JSON.stringify(pushed)).not.toContain(writer.nick);
  });

  // ---- Phase 5: busiest hours, helpful reviews and badges (decisions 89, 93) --------------------

  it('counts check-ins into the spot’s busiest hours, shown from 10 check-ins', async () => {
    const spot = await liveSpot();
    const [first, second, outsider] = [
      await member('HoursA'),
      await member('HoursB'),
      await person('HoursOut'),
    ];
    const hours = (who: Person) =>
      request(server()).get(`/v1/cruising/spots/${spot.id}/hours`).set(who.auth);

    // Only entered members see them.
    await request(server()).get(`/v1/cruising/spots/${spot.id}/hours`).expect(401);
    expect((await hours(outsider)).status).toBe(403);
    const empty = await hours(first).expect(200);
    expect(empty.body.ready).toBe(false);
    expect(empty.body.days).toHaveLength(7);
    expect(empty.body.days[0]).toHaveLength(24);

    await request(server())
      .post('/v1/cruising/check-ins')
      .set(first.auth)
      .send({ spotId: spot.id, hours: 2, anonymous: true })
      .expect(201);
    const row = await prisma.cruisingSpot.findUniqueOrThrow({ where: { id: spot.id } });
    // The spot's time zone, from its coordinates (decision 89): the Pacific, UTC-10.
    expect(row.timeZone).toBe('Etc/GMT+10');
    expect(row.hourCheckIns).toBe(1);
    expect(row.hoursDecayedAt).not.toBeNull();
    const counted = await prisma.cruisingSpotHour.findMany({ where: { spotId: spot.id } });
    // Two hours from now cover two or three local hours, each counted once; nobody is kept.
    expect(counted.length).toBeGreaterThanOrEqual(2);
    expect(counted.length).toBeLessThanOrEqual(3);
    expect(counted.every((hour) => hour.weight === 1)).toBe(true);
    expect(Object.keys(counted[0]!).sort()).toEqual(['day', 'hour', 'spotId', 'weight']);
    expect((await hours(first).expect(200)).body.ready).toBe(false);

    // The tenth check-in makes the chart show.
    await prisma.cruisingSpot.update({ where: { id: spot.id }, data: { hourCheckIns: 9 } });
    await request(server())
      .post('/v1/cruising/check-ins')
      .set(second.auth)
      .send({ spotId: spot.id, hours: 1, anonymous: false })
      .expect(201);
    const ready = await hours(first).expect(200);
    expect(ready.body.ready).toBe(true);
    expect(Math.max(...ready.body.days.flat())).toBe(100);

    // The nightly decay: × 0.98 once the last one is a day old, once.
    const busiest = await prisma.cruisingSpotHour.findFirstOrThrow({
      where: { spotId: spot.id },
      orderBy: { weight: 'desc' },
    });
    const dayAgo = new Date(Date.now() - 25 * 3600_000);
    await prisma.cruisingSpot.update({ where: { id: spot.id }, data: { hoursDecayedAt: dayAgo } });
    const social = app.get(CruisingSocialService);
    await social.cleanupCheckIns();
    await social.cleanupCheckIns();
    const after = await prisma.cruisingSpotHour.findUniqueOrThrow({
      where: { spotId_day_hour: { spotId: spot.id, day: busiest.day, hour: busiest.hour } },
    });
    expect(after.weight).toBeCloseTo(busiest.weight * 0.98);
    const moved = await prisma.cruisingSpot.findUniqueOrThrow({ where: { id: spot.id } });
    expect(moved.hoursDecayedAt!.getTime()).toBe(dayAgo.getTime() + 24 * 3600_000);
  });

  it('sorts reviews by helpful votes, counts them for the author and shows the badges', async () => {
    const spot = await liveSpot();
    const [author, newer, voter, stranger] = [
      await member('Author'),
      await member('Newer'),
      await member('Voter'),
      await member('Stranger'),
    ];
    const review = (who: Person, text: string) =>
      request(server())
        .put(`/v1/cruising/spots/${spot.id}/review`)
        .set(who.auth)
        .send({ rating: 4, text })
        .expect(200);
    const older = await review(author, 'Older and helpful');
    await prisma.cruisingReview.update({
      where: { id: older.body.id },
      data: { createdAt: new Date(Date.now() - 3600_000) },
    });
    await review(newer, 'Newer one');
    const helpful = (who: Person, id: string) =>
      request(server()).put(`/v1/cruising/reviews/${id}/helpful`).set(who.auth);
    const list = (who: Person) =>
      request(server()).get(`/v1/cruising/spots/${spot.id}/reviews`).set(who.auth).expect(200);

    // Newest first while nobody voted.
    expect((await list(voter)).body.items.map((item: { text: string }) => item.text)).toEqual([
      'Newer one',
      'Older and helpful',
    ]);

    // Not on my own review; twice is fine.
    expect((await helpful(author, older.body.id)).status).toBe(400);
    expect((await helpful(voter, older.body.id)).status).toBe(204);
    expect((await helpful(voter, older.body.id)).status).toBe(204);
    expect((await helpful(stranger, older.body.id)).status).toBe(204);
    expect((await helpful(voter, randomUUID())).status).toBe(404);

    const page = await list(voter);
    expect(page.body.items.map((item: { text: string }) => item.text)).toEqual([
      'Older and helpful',
      'Newer one',
    ]);
    expect(page.body.items[0].helpful).toEqual({ count: 2, mine: true });
    expect(page.body.items[1].helpful).toEqual({ count: 0, mine: false });
    expect((await list(author)).body.items[0].helpful).toEqual({ count: 2, mine: false });

    // The author's counters follow, in the same transaction.
    const counters = () =>
      prisma.cruisingProfile.findUniqueOrThrow({ where: { userId: author.id } });
    expect(await counters()).toMatchObject({ helpfulReceived: 2, reviewsWritten: 1 });
    await request(server())
      .delete(`/v1/cruising/reviews/${older.body.id}/helpful`)
      .set(stranger.auth)
      .expect(204);
    expect((await counters()).helpfulReceived).toBe(1);

    // A blocked author's review can't be voted on (it isn't shown either).
    await prisma.cruisingBlock.create({ data: { blockerId: author.id, blockedId: stranger.id } });
    expect((await helpful(stranger, older.body.id)).status).toBe(404);

    // Badges: next to the nickname on reviews and on the profile.
    await prisma.cruisingProfile.update({
      where: { userId: author.id },
      data: { spotsLive: 3, helpfulReceived: 10, reviewsWritten: 25 },
    });
    const badged = await list(voter);
    expect(badged.body.items[0].author).toMatchObject({
      nickname: author.nick,
      badges: ['EXPLORER', 'HELPFUL', 'LOCAL'],
    });
    expect(badged.body.items[1].author.badges).toEqual([]);
    const profile = await request(server())
      .get(`/v1/cruising/members/${author.nick}`)
      .set(voter.auth)
      .expect(200);
    expect(profile.body.badges).toEqual(['EXPLORER', 'HELPFUL', 'LOCAL']);
    expect(profile.body.contributions).toEqual({
      spotsLive: 3,
      helpfulReceived: 10,
      reviewsWritten: 25,
    });

    // The profile's tabs: the author's reviews (with their votes), not to someone blocked.
    const activity = await request(server())
      .get(`/v1/cruising/members/${author.nick}/activity`)
      .set(voter.auth)
      .expect(200);
    expect(activity.body.reviews).toEqual([
      expect.objectContaining({
        id: older.body.id,
        rating: 4,
        text: 'Older and helpful',
        helpful: 1,
        spot: expect.objectContaining({ slug: spot.slug }),
      }),
    ]);
    expect(activity.body.spots).toEqual([]);
    expect(
      (
        await request(server())
          .get(`/v1/cruising/members/${author.nick}/activity`)
          .set(stranger.auth)
      ).status,
    ).toBe(404);

    // Deleting the review takes its votes and counts with it.
    await request(server())
      .delete(`/v1/cruising/spots/${spot.id}/review`)
      .set(author.auth)
      .expect(204);
    expect(await counters()).toMatchObject({ helpfulReceived: 0, reviewsWritten: 0 });
  });

  it('counts the proposer’s LIVE spots as the team publishes and hides them', async () => {
    const proposer = await member('Proposer');
    const spot = await prisma.cruisingSpot.create({
      data: {
        slug: `proposed-${tag}-${randomUUID().slice(0, 6)}`,
        name: `Proposed ${tag}`,
        type: 'BEACH',
        lat: 12.5,
        lng: -148.5,
        countryCode: 'ES',
        city: `Social ${tag}`,
        citySlug: `social-${tag}`,
        description: 'A proposed beach.',
        status: 'PENDING',
        createdById: proposer.id,
      },
    });
    const spotsLive = async () =>
      (await prisma.cruisingProfile.findUniqueOrThrow({ where: { userId: proposer.id } }))
        .spotsLive;
    await request(server())
      .post(`/v1/admin/cruising/spots/${spot.id}/approve`)
      .set(admin.auth)
      .expect(204);
    expect(await spotsLive()).toBe(1);
    // The proposer's profile lists the LIVE spot.
    const viewer = await member('SpotSeer');
    const listed = await request(server())
      .get(`/v1/cruising/members/${proposer.nick}/activity`)
      .set(viewer.auth)
      .expect(200);
    expect(listed.body.spots).toEqual([
      expect.objectContaining({ id: spot.id, slug: spot.slug, city: `Social ${tag}` }),
    ]);
    await request(server())
      .post(`/v1/admin/cruising/spots/${spot.id}/hide`)
      .set(admin.auth)
      .expect(204);
    expect(await spotsLive()).toBe(0);
  });
});
