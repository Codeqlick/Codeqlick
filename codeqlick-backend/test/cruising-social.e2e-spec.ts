import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AppConfigService } from '../src/config/app-config.service.js';
import { Role } from '../src/generated/prisma/client.js';
import { CruisingSocialService } from '../src/modules/cruising/cruising-social.service.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

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
  let made = 0;
  let spotCount = 0;

  const server = () => app.getHttpServer();

  async function person(name: string, role: Role = Role.CLIENT): Promise<Person> {
    made += 1;
    const email = `e2e-cruising-social-${name.toLowerCase()}-${tag}@codeqlick.test`;
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await prisma.user.create({ data: { email, name, role, passwordHash } });
    const token = await app.get(JwtService).signAsync({ sub: user.id, email, name, role });
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
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cruisingSpot.deleteMany({ where: { name: { contains: tag } } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@codeqlick.test` } } });
    }
    await app?.close();
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
      .send({ duration: '24h' });
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
});
