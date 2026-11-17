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
import { CruisingSafetyService } from '../src/modules/cruising/cruising-safety.service.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/** The 18+ apps' members are NEOQLICK accounts (architecture 4.18); the admins are CODEQLICK ones. */
const realmOf = (role: Role): 'CODEQLICK' | 'NEOQLICK' =>
  role === Role.ADMIN ? 'CODEQLICK' : 'NEOQLICK';

const tag = randomUUID().slice(0, 8);
const password = 'cruising-safety-password-1';

type Person = { id: string; email: string; nick: string; auth: { Authorization: string } };

/** Cruising phase 5 (architecture 4.15): "Check on me" (decision 95) and sexual health (94). */
describe('Cruising safety and health (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let safety: CruisingSafetyService;
  let version: string;
  let admin: Person;
  const sent: MailMessage[] = [];
  let made = 0;

  const server = () => app.getHttpServer();

  async function person(name: string, role: Role = Role.CLIENT): Promise<Person> {
    made += 1;
    const email = `e2e-cruising-safety-${name.toLowerCase()}-${made}-${tag}@codeqlick.test`;
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await prisma.user.create({
      data: { email, name, role, realm: realmOf(role), passwordHash, locale: 'ES' },
    });
    const token = await app
      .get(JwtService)
      .signAsync({ sub: user.id, email, name, role, rlm: realmOf(role) });
    const nick = `saf_${tag.slice(0, 6)}_${made}`;
    return { id: user.id, email, nick, auth: { Authorization: `Bearer ${token}` } };
  }

  async function member(name: string): Promise<Person> {
    const who = await person(name);
    await prisma.cruisingProfile.create({
      data: {
        userId: who.id,
        birthYear: 1990,
        termsVersion: version,
        acceptedAt: new Date(),
        nickname: who.nick,
      },
    });
    return who;
  }

  /** The token of the last link to the contact page in an email. */
  function linkToken(message: MailMessage, which: 'invite' | 'stop'): string {
    const tokens = [...message.text.matchAll(/safety-contact\?token=([^\s]+)/g)].map((match) =>
      decodeURIComponent(match[1]!),
    );
    const token = tokens.find((each) => each.startsWith('stop.') === (which === 'stop'));
    if (!token) throw new Error(`No ${which} link in the email`);
    return token;
  }

  const invite = (who: Person, email: string, displayName = 'Luis') =>
    request(server())
      .post('/v1/cruising/trusted-contacts')
      .set(who.auth)
      .send({ email, displayName });

  const respond = (token: string, accept: boolean) =>
    request(server()).post('/v1/cruising/trusted-contacts/respond').send({ token, accept });

  /** A member with one contact who accepted. */
  async function withContact(name: string, contactEmail: string): Promise<Person> {
    const who = await member(name);
    await invite(who, contactEmail).expect(201);
    const token = linkToken(sent.at(-1)!, 'invite');
    await respond(token, true).expect(204);
    sent.length = 0;
    return who;
  }

  async function liveSpot(): Promise<{ id: string; name: string }> {
    const name = `Safety spot ${tag} ${made}`;
    const row = await prisma.cruisingSpot.create({
      data: {
        slug: `safety-spot-${tag}-${made}`,
        name,
        type: 'BEACH',
        lat: 36.5,
        lng: -4.9,
        countryCode: 'ES',
        city: `Safety ${tag}`,
        citySlug: `safety-${tag}`,
        description: 'A beach for the safety tests.',
        status: 'LIVE',
      },
    });
    return { id: row.id, name };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    safety = app.get(CruisingSafetyService);
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
      await prisma.cruisingHealthCenter.deleteMany({ where: { name: { contains: tag } } });
      await prisma.cruisingSpot.deleteMany({ where: { name: { contains: tag } } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@codeqlick.test` } } });
    }
    await app?.close();
  });

  describe('trusted contacts', () => {
    it('invites up to 2, masked, with a double opt-in email in the member language', async () => {
      const ana = await member('Ana');
      const res = await invite(ana, `First.Friend-${tag}@example.com`).expect(201);
      expect(res.body).toMatchObject({ displayName: 'Luis', status: 'PENDING' });
      expect(res.body.email).toBe('f***@example.com');
      const email = sent[0]!;
      expect(email.to).toBe(`first.friend-${tag}@example.com`);
      expect(email.subject).toBe('Luis te pide recibir sus alertas de seguridad de Codeqlick');
      expect(email.text).not.toMatch(/cruising/i);
      expect(email.text).not.toContain(ana.nick);

      await invite(ana, `first.friend-${tag}@example.com`).expect(409);
      await invite(ana, `second-${tag}@example.com`).expect(201);
      await invite(ana, `third-${tag}@example.com`).expect(409);
      await invite(ana, ana.email).expect(400);

      const list = await request(server())
        .get('/v1/cruising/trusted-contacts')
        .set(ana.auth)
        .expect(200);
      expect(list.body.items).toHaveLength(2);
      expect(JSON.stringify(list.body)).not.toContain('friend-');
    });

    it('accepts once with the invitation, refuses, and stops with any stop link', async () => {
      const bea = await member('Bea');
      await invite(bea, `accepting-${tag}@example.com`).expect(201);
      const acceptToken = linkToken(sent[0]!, 'invite');
      const stopToken = linkToken(sent[0]!, 'stop');
      await respond(acceptToken, true).expect(204);
      // Single use.
      await respond(acceptToken, false).expect(404);
      await invite(bea, `refusing-${tag}@example.com`).expect(201);
      await respond(linkToken(sent[1]!, 'invite'), false).expect(204);

      let list = await request(server()).get('/v1/cruising/trusted-contacts').set(bea.auth);
      expect(list.body.items.map((each: { status: string }) => each.status)).toEqual([
        'ACCEPTED',
        'REFUSED',
      ]);
      // Whoever refused stays (never asked again) and no longer counts toward the 2.
      const refused = list.body.items[1].id as string;
      await request(server())
        .delete(`/v1/cruising/trusted-contacts/${refused}`)
        .set(bea.auth)
        .expect(409);
      await invite(bea, `refusing-${tag}@example.com`).expect(409);
      await invite(bea, `another-${tag}@example.com`).expect(201);

      await respond(stopToken, true).expect(400);
      await respond(stopToken, false).expect(204);
      await respond(`${stopToken.slice(0, -3)}abc`, false).expect(404);
      list = await request(server()).get('/v1/cruising/trusted-contacts').set(bea.auth);
      expect(list.body.items[0].status).toBe('REFUSED');
    });

    it('needs entry and a session', async () => {
      const outsider = await person('Outsider');
      const refused = await request(server())
        .get('/v1/cruising/trusted-contacts')
        .set(outsider.auth);
      expect(refused.status).toBe(403);
      const anonymous = await request(server()).get('/v1/cruising/timer');
      expect(anonymous.status).toBe(401);
    });
  });

  describe('the "Check on me" timer', () => {
    it('starts, extends and ends within the limits', async () => {
      const cai = await member('Cai');
      const start = (body: object) =>
        request(server()).post('/v1/cruising/timer').set(cai.auth).send(body);
      // No contact who accepted yet.
      await start({ minutes: 60 }).expect(409);
      await invite(cai, `cai-friend-${tag}@example.com`).expect(201);
      await respond(linkToken(sent.at(-1)!, 'invite'), true).expect(204);

      await start({ minutes: 29 }).expect(400);
      await start({ minutes: 361 }).expect(400);
      await start({ minutes: 60, message: 'x'.repeat(201) }).expect(400);
      await start({ minutes: 60, message: 'write me at me@example.com' }).expect(400);
      await start({ minutes: 60, shareSpot: true }).expect(400);

      const before = Date.now();
      const timer = await start({ minutes: 60, message: 'At the beach' }).expect(201);
      expect(timer.body).toMatchObject({ message: 'At the beach', shareSpot: false, spot: null });
      expect(new Date(timer.body.endsAt).getTime()).toBeGreaterThanOrEqual(before + 3_599_000);

      const extended = await request(server())
        .post('/v1/cruising/timer/extend')
        .set(cai.auth)
        .send({ minutes: 30 })
        .expect(200);
      expect(new Date(extended.body.endsAt).getTime()).toBe(
        new Date(timer.body.endsAt).getTime() + 30 * 60_000,
      );
      await request(server())
        .post('/v1/cruising/timer/extend')
        .set(cai.auth)
        .send({ minutes: 300 })
        .expect(400);

      // A second start replaces the first: only one runs.
      await start({ minutes: 45 }).expect(201);
      expect(await prisma.cruisingTimer.count({ where: { userId: cai.id, endedAt: null } })).toBe(
        1,
      );

      await request(server()).delete('/v1/cruising/timer').set(cai.auth).expect(204);
      const now = await request(server()).get('/v1/cruising/timer').set(cai.auth).expect(200);
      expect(now.body).toBeNull();
      await request(server())
        .post('/v1/cruising/timer/extend')
        .set(cai.auth)
        .send({ minutes: 30 })
        .expect(404);
    });

    it('warns 10 minutes before and fires once, to accepted contacts only', async () => {
      const dan = await withContact('Dan', `dan-accepted-${tag}@example.com`);
      await invite(dan, `dan-pending-${tag}@example.com`).expect(201);
      sent.length = 0;
      const started = await request(server())
        .post('/v1/cruising/timer')
        .set(dan.auth)
        .send({ minutes: 30, message: 'Meeting someone' })
        .expect(201);
      const endsAt = new Date(started.body.endsAt);

      await safety.checkTimers(new Date(endsAt.getTime() - 15 * 60_000));
      expect(sent).toHaveLength(0);
      await safety.checkTimers(new Date(endsAt.getTime() - 9 * 60_000));
      await safety.checkTimers(new Date(endsAt.getTime() - 8 * 60_000));
      expect(sent.map((each) => each.to)).toEqual([dan.email]);
      expect(sent[0]!.subject).toBe(
        'Tu temporizador de seguridad termina en 10 minutos — Cruising',
      );

      sent.length = 0;
      await safety.checkTimers(new Date(endsAt.getTime() + 60_000));
      await safety.checkTimers(new Date(endsAt.getTime() + 120_000));
      expect(sent.map((each) => each.to)).toEqual([`dan-accepted-${tag}@example.com`]);
      const alert = sent[0]!;
      expect(alert.subject).toBe(
        'Alerta de seguridad de Codeqlick: Luis no ha confirmado que está bien',
      );
      expect(alert.text).toContain('Meeting someone');
      expect(alert.text).not.toContain('openstreetmap');
      expect(alert.text).not.toContain(dan.nick);
      expect(alert.text).not.toMatch(/cruising/i);
      const row = await prisma.cruisingTimer.findFirstOrThrow({ where: { userId: dan.id } });
      expect(row.firedAt).not.toBeNull();
      expect(row.warnedAt).not.toBeNull();

      // Fired: nothing runs any more, and ending it now changes nothing.
      const now = await request(server()).get('/v1/cruising/timer').set(dan.auth);
      expect(now.body).toBeNull();
    });

    it('names the spot with a map link only when shared, and never emails a stopped contact', async () => {
      const eva = await withContact('Eva', `eva-accepted-${tag}@example.com`);
      const spot = await liveSpot();
      const started = await request(server())
        .post('/v1/cruising/timer')
        .set(eva.auth)
        .send({ minutes: 30, shareSpot: true, spotId: spot.id })
        .expect(201);
      expect(started.body.spot).toMatchObject({ id: spot.id, name: spot.name });
      await safety.checkTimers(new Date(new Date(started.body.endsAt).getTime() + 60_000));
      const alert = sent.find((each) => each.to === `eva-accepted-${tag}@example.com`)!;
      expect(alert.text).toContain(spot.name);
      expect(alert.text).toContain('https://www.openstreetmap.org/?mlat=36.5&mlon=-4.9');

      // The contact stops with the link in that alert: the next timer emails nobody.
      await respond(linkToken(alert, 'stop'), false).expect(204);
      sent.length = 0;
      await prisma.cruisingTimer.create({
        data: { userId: eva.id, endsAt: new Date(Date.now() - 60_000) },
      });
      await safety.checkTimers(new Date());
      expect(sent.filter((each) => each.to.startsWith('eva-'))).toHaveLength(0);
    });

    it('deletes timers 7 days after they end', async () => {
      const fay = await member('Fay');
      const old = new Date(Date.now() - 8 * 24 * 60 * 60_000);
      await prisma.cruisingTimer.create({
        data: { userId: fay.id, endsAt: old, endedAt: old, createdAt: old },
      });
      await prisma.cruisingTimer.create({
        data: { userId: fay.id, endsAt: new Date(), endedAt: new Date() },
      });
      await safety.hourly(new Date());
      expect(await prisma.cruisingTimer.count({ where: { userId: fay.id } })).toBe(1);
    });
  });

  describe('sexual health', () => {
    it('is off by default and needs its own consent', async () => {
      const gus = await member('Gus');
      const get = await request(server()).get('/v1/cruising/health').set(gus.auth).expect(200);
      expect(get.body).toEqual({
        enabled: false,
        prepStatus: null,
        lastTestedMonth: null,
        visible: false,
        reminderMonths: null,
      });
      const body = { enabled: true, prepStatus: 'ON_PREP', lastTestedMonth: '2026-10' };
      await request(server()).put('/v1/cruising/health').set(gus.auth).send(body).expect(400);
      await request(server())
        .put('/v1/cruising/health')
        .set(gus.auth)
        .send({ ...body, consent: true, lastTestedMonth: '2099-01' })
        .expect(400);
      const saved = await request(server())
        .put('/v1/cruising/health')
        .set(gus.auth)
        .send({ ...body, consent: true, reminderMonths: 6 })
        .expect(200);
      expect(saved.body).toEqual({
        enabled: true,
        prepStatus: 'ON_PREP',
        lastTestedMonth: '2026-10',
        visible: false,
        reminderMonths: 6,
      });
    });

    it('shows it on the profile to members only when visible, and off deletes it', async () => {
      const hal = await member('Hal');
      const ivy = await member('Ivy');
      const save = (body: object) =>
        request(server()).put('/v1/cruising/health').set(hal.auth).send(body).expect(200);
      const profile = () =>
        request(server()).get(`/v1/cruising/members/${hal.nick}`).set(ivy.auth).expect(200);

      await save({
        enabled: true,
        consent: true,
        prepStatus: 'ON_PREP',
        lastTestedMonth: '2026-09',
      });
      expect((await profile()).body.health).toBeNull();
      await save({
        enabled: true,
        prepStatus: 'ON_PREP',
        lastTestedMonth: '2026-09',
        visible: true,
      });
      expect((await profile()).body.health).toEqual({
        prepStatus: 'ON_PREP',
        lastTestedMonth: '2026-09',
      });

      await save({ enabled: false });
      expect((await profile()).body.health).toBeNull();
      const row = await prisma.cruisingProfile.findUniqueOrThrow({ where: { userId: hal.id } });
      expect(row).toMatchObject({
        healthConsentAt: null,
        prepStatus: null,
        lastTestedMonth: null,
        healthVisible: false,
        reminderMonths: null,
      });
      // Turning it on again asks for consent again.
      await request(server())
        .put('/v1/cruising/health')
        .set(hal.auth)
        .send({ enabled: true, prepStatus: 'NOT_ON_PREP' })
        .expect(400);
    });

    it('reminds once per due date', async () => {
      const jo = await member('Jo');
      await request(server())
        .put('/v1/cruising/health')
        .set(jo.auth)
        .send({ enabled: true, consent: true, lastTestedMonth: '2026-05', reminderMonths: 3 })
        .expect(200);
      await safety.sendHealthReminders(new Date('2026-11-16T12:00:00Z'));
      await safety.sendHealthReminders(new Date('2026-11-16T13:00:00Z'));
      const mine = sent.filter((each) => each.to === jo.email);
      expect(mine).toHaveLength(1);
      expect(mine[0]!.subject).toBe('Es hora de tu revisión — Cruising');
    });
  });

  describe('testing centres', () => {
    const center = (name: string, over: object = {}) => ({
      name: `${name} ${tag}`,
      address: 'Calle Mayor 1',
      lat: 52.1 + made / 1000,
      lng: 13.4,
      countryCode: 'DE',
      city: `Berlin ${tag}`,
      url: 'https://example.com/checkpoint',
      free: true,
      anonymous: true,
      ...over,
    });

    it('lets only the team manage them, and anyone list them', async () => {
      const kim = await member('Kim');
      await request(server())
        .post('/v1/admin/cruising/health-centers')
        .set(kim.auth)
        .send(center('Nope'))
        .expect(403);
      await request(server()).get('/v1/admin/cruising/health-centers').set(kim.auth).expect(403);

      made += 1;
      const created = await request(server())
        .post('/v1/admin/cruising/health-centers')
        .set(admin.auth)
        .send(center('Checkpoint'))
        .expect(201);
      const id = created.body.id as string;
      await request(server())
        .patch(`/v1/admin/cruising/health-centers/${id}`)
        .set(admin.auth)
        .send({ rapid: true, phone: '+49 30 123' })
        .expect(204);

      const citySlug = `berlin-${tag}`;
      const list = await request(server())
        .get(`/v1/cruising/health-centers?countryCode=de&citySlug=${citySlug}`)
        .expect(200);
      expect(list.body.items).toEqual([
        expect.objectContaining({
          id,
          name: `Checkpoint ${tag}`,
          citySlug,
          free: true,
          anonymous: true,
          rapid: true,
          phone: '+49 30 123',
        }),
      ]);
      const box = await request(server())
        .get('/v1/cruising/health-centers?bbox=13.3,52,13.5,52.3')
        .expect(200);
      expect(box.body.items.map((each: { id: string }) => each.id)).toContain(id);
      const places = await request(server()).get('/v1/cruising/health-centers/places').expect(200);
      const germany = places.body.countries.find(
        (each: { countryCode: string }) => each.countryCode === 'DE',
      );
      expect(germany.cities).toContainEqual({ city: `Berlin ${tag}`, citySlug, count: 1 });

      await request(server())
        .delete(`/v1/admin/cruising/health-centers/${id}`)
        .set(admin.auth)
        .expect(204);
      await request(server())
        .delete(`/v1/admin/cruising/health-centers/${id}`)
        .set(admin.auth)
        .expect(404);
    });

    it('imports a CSV like the spots: dry run, invalid rows and duplicates skipped', async () => {
      const content = [
        'name;address;lat;lng;countryCode;city;free;rapid',
        `Fast Test ${tag};Rua 1;38,7223;-9,1393;PT;Lisboa ${tag};sí;yes`,
        `Same Place ${tag};Rua 1;38,7223;-9,1393;PT;Lisboa ${tag};no;no`,
        `Bad Row ${tag};Rua 2;100;-9;PT;Lisboa ${tag};;`,
        `Flag ${tag};Rua 3;38,8;-9,2;PT;Lisboa ${tag};maybe;`,
      ].join('\n');
      const send = (who: Person, dryRun: boolean) =>
        request(server())
          .post('/v1/admin/cruising/health-centers/import')
          .set(who.auth)
          .send({ format: 'csv', content, dryRun });

      await send(await member('Lou'), true).expect(403);
      const dry = await send(admin, true).expect(200);
      expect(dry.body.created).toBe(0);
      expect(dry.body.items).toEqual([
        { row: 2, name: `Fast Test ${tag}`, city: `Lisboa ${tag}`, countryCode: 'PT' },
      ]);
      expect(dry.body.skipped.map((each: { row: number }) => each.row)).toEqual([3, 4, 5]);
      expect(dry.body.skipped[0].reason).toBe('Duplicate of row 2 (within 50 m)');

      const real = await send(admin, false).expect(200);
      expect(real.body.created).toBe(1);
      const again = await send(admin, false).expect(200);
      expect(again.body.created).toBe(0);
      expect(again.body.skipped[0].reason).toBe(`Duplicate of "Fast Test ${tag}" (within 50 m)`);
      const row = await prisma.cruisingHealthCenter.findFirstOrThrow({
        where: { name: `Fast Test ${tag}` },
      });
      expect(row).toMatchObject({ free: true, rapid: true, anonymous: false, countryCode: 'PT' });
    });
  });

  it('exports contacts (masked) and timers, and deletes them with the account', async () => {
    const max = await withContact('Max', `max-friend-${tag}@example.com`);
    await request(server())
      .post('/v1/cruising/timer')
      .set(max.auth)
      .send({ minutes: 30, message: 'Out tonight' })
      .expect(201);
    const exported = await request(server()).get('/v1/auth/me/export').set(max.auth).expect(200);
    expect(exported.body.cruising.trustedContacts).toEqual([
      expect.objectContaining({
        email: 'm***@example.com',
        displayName: 'Luis',
        status: 'ACCEPTED',
      }),
    ]);
    expect(exported.body.cruising.timers).toEqual([
      expect.objectContaining({ message: 'Out tonight' }),
    ]);
    await prisma.user.delete({ where: { id: max.id } });
    expect(await prisma.cruisingTrustedContact.count({ where: { userId: max.id } })).toBe(0);
    expect(await prisma.cruisingTimer.count({ where: { userId: max.id } })).toBe(0);
  });
});
