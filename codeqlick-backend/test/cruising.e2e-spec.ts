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
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const tag = randomUUID().slice(0, 8);
const password = 'cruising-password-1';

type Person = { id: string; email: string; auth: { Authorization: string } };

/** Mails never carry a spot's name or its slug (names here are "<Name> <tag>"). */
const NAME = new RegExp(`(old pier|wood|reported|dangerous|takedown)[ -]${tag}`, 'i');

/** A box in the middle of the Pacific: nothing else lives there, so each run sees only its spots. */
const BOX = '-150,10,-149,11';
const at = (n: number) => ({ lat: 10.5 + n / 1000, lng: -149.5 + n / 1000 });

describe('Cruising (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let version: string;
  let admin: Person;
  let ana: Person;
  let bea: Person;
  let carla: Person;
  let dani: Person;
  let eva: Person;
  const sent: MailMessage[] = [];

  const server = () => app.getHttpServer();

  async function person(name: string, role: Role = Role.CLIENT): Promise<Person> {
    const email = `e2e-cruising-${name.toLowerCase()}-${tag}@codeqlick.test`;
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await prisma.user.create({ data: { email, name, role, passwordHash } });
    const token = await app.get(JwtService).signAsync({ sub: user.id, email, name, role });
    return { id: user.id, email, auth: { Authorization: `Bearer ${token}` } };
  }

  /** A member who has entered, set up straight in the database (entering has its own limit). */
  async function member(name: string): Promise<Person> {
    const who = await person(name);
    await prisma.cruisingProfile.create({
      data: { userId: who.id, birthYear: 1990, termsVersion: version, acceptedAt: new Date() },
    });
    return who;
  }

  const enter = (who: Person, birthDate = '1990-01-01') =>
    request(server())
      .put('/v1/cruising/me')
      .set(who.auth)
      .send({ birthDate, acceptTerms: true, consentSpecialData: true, termsVersion: version });

  const spotBody = (name: string, n: number, over: Record<string, unknown> = {}) => ({
    name: `${name} ${tag}`,
    type: 'BEACH',
    ...at(n),
    countryCode: 'ES',
    city: `Playa ${tag}`,
    description: 'A quiet place at the end of the beach.',
    ...over,
  });

  const propose = async (who: Person, name: string, n: number, over = {}) => {
    const res = await request(server())
      .post('/v1/cruising/spots')
      .set(who.auth)
      .send(spotBody(name, n, over))
      .expect(201);
    return res.body as { id: string; slug: string; status: string };
  };

  const approve = (id: string) =>
    request(server()).post(`/v1/admin/cruising/spots/${id}/approve`).set(admin.auth).expect(204);

  /**
   * A LIVE spot set up straight in the database (proposing has its own limit, 5 a day): by a new
   * member, or by `owner`. Returns the spot and who proposed it.
   */
  let seeded = 0;
  async function liveSpot(
    name: string,
    n: number,
    owner?: Person,
    status: 'LIVE' | 'PENDING' = 'LIVE',
  ) {
    seeded += 1;
    const by = owner ?? (await member(`Seed${seeded}`));
    const full = `${name} ${tag}`;
    const slug = `${full.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const row = await prisma.cruisingSpot.create({
      data: {
        slug,
        name: full,
        type: 'BEACH',
        ...at(n),
        countryCode: 'ES',
        city: `Playa ${tag}`,
        citySlug: `playa-${tag}`,
        description: 'A quiet place at the end of the beach.',
        status,
        createdById: by.id,
      },
    });
    return { id: row.id, slug: row.slug, owner: by };
  }

  const inBox = async () => {
    const res = await request(server()).get(`/v1/cruising/spots?bbox=${BOX}`).expect(200);
    return res.body as { items: { slug: string; lat: number; lng: number }[]; truncated: boolean };
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
    ana = await person('Ana');
    bea = await person('Bea');
    carla = await person('Carla');
    dani = await person('Dani');
    eva = await person('Eva');
    for (const who of [ana, bea, dani, eva]) {
      await prisma.cruisingProfile.create({
        data: { userId: who.id, birthYear: 1990, termsVersion: version, acceptedAt: new Date() },
      });
    }
  });

  beforeEach(() => {
    sent.length = 0;
  });

  afterAll(async () => {
    if (prisma) {
      // Spots stay when their proposer goes: delete this run's by name.
      await prisma.cruisingTakedown.deleteMany({ where: { email: { contains: `-${tag}@` } } });
      await prisma.cruisingSpot.deleteMany({ where: { name: { contains: tag } } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@codeqlick.test` } } });
    }
    await app?.close();
  });

  it('lets anyone browse the map, but validates the box', async () => {
    const res = await request(server()).get(`/v1/cruising/spots?bbox=${BOX}`).expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=60');
    expect(res.body).toEqual({ items: [], truncated: false });
    for (const bbox of [
      undefined,
      '',
      '1,2,3',
      '-150,10,-150,11',
      '-149,10,-150,11',
      '-150,11,-149,10',
      '-181,0,0,1',
      '0,-91,1,1',
      '0,0,1,91',
      'a,b,c,d',
    ]) {
      const url = bbox === undefined ? '/v1/cruising/spots' : `/v1/cruising/spots?bbox=${bbox}`;
      await request(server()).get(url).expect(400);
    }
    await request(server()).get(`/v1/cruising/spots?bbox=${BOX}&type=MOON`).expect(400);
    await request(server()).get('/v1/cruising/spots/no-such-spot').expect(404);
    await request(server()).get('/v1/cruising/places/ES/no-such-city-xyz').expect(404);
    await request(server()).get('/v1/cruising/places').expect(200);
    await request(server()).get('/v1/cruising/sitemap').expect(200);
  });

  it('asks for 18+, the consent and the current rules before anything else', async () => {
    await request(server()).get('/v1/cruising/me').expect(401);
    const before = await request(server()).get('/v1/cruising/me').set(carla.auth).expect(200);
    expect(before.body).toMatchObject({ onboarded: false, allowed: false, termsVersion: version });

    await request(server())
      .post('/v1/cruising/reports')
      .set(carla.auth)
      .send({ spotId: randomUUID(), reason: 'SPAM' })
      .expect(403);

    await enter(carla, '2015-05-05').expect(403);
    const old = await request(server()).put('/v1/cruising/me').set(carla.auth).send({
      birthDate: '1990-01-01',
      acceptTerms: true,
      consentSpecialData: true,
      termsVersion: '2000-01-01',
    });
    expect(old.status).toBe(409);
    await request(server())
      .put('/v1/cruising/me')
      .set(carla.auth)
      .send({ birthDate: '1990-01-01', acceptTerms: true, termsVersion: version })
      .expect(400);
    await request(server())
      .put('/v1/cruising/me')
      .set(carla.auth)
      .send({
        birthDate: '1990-01-01',
        acceptTerms: true,
        consentSpecialData: false,
        termsVersion: version,
      })
      .expect(400);
    expect(await prisma.cruisingProfile.count({ where: { userId: carla.id } })).toBe(0);

    const ok = await enter(carla, '1990-06-15').expect(200);
    expect(ok.body).toMatchObject({ onboarded: true, allowed: true, suspended: false });
    const profile = await prisma.cruisingProfile.findUnique({ where: { userId: carla.id } });
    expect(profile?.birthYear).toBe(1990);
    expect(JSON.stringify(profile)).not.toContain('06-15');

    // A new version asks again.
    await prisma.cruisingProfile.update({
      where: { userId: carla.id },
      data: { termsVersion: 'older' },
    });
    const again = await request(server()).get('/v1/cruising/me').set(carla.auth).expect(200);
    expect(again.body).toMatchObject({ onboarded: false, allowed: false });
    await request(server())
      .post('/v1/cruising/spots')
      .set(carla.auth)
      .send(spotBody('Again', 2))
      .expect(403);
    await enter(carla).expect(200);
  });

  it('switches the email alerts off and on', async () => {
    const off = await request(server())
      .patch('/v1/cruising/profile')
      .set(dani.auth)
      .send({ emailAlerts: false })
      .expect(200);
    expect(off.body.emailAlerts).toBe(false);
    await request(server())
      .patch('/v1/cruising/profile')
      .set(dani.auth)
      .send({ emailAlerts: true })
      .expect(200);
    await request(server()).patch('/v1/cruising/profile').send({ emailAlerts: true }).expect(401);
  });

  it('proposes a spot, the team approves it and it goes public', async () => {
    const spot = await propose(ana, 'Old pier', 1, { lat: 10.123456789, lng: -149.987654321 });
    expect(spot).toMatchObject({ status: 'PENDING', slug: `old-pier-${tag}` });

    // Pending: not on the map, not on its page.
    expect((await inBox()).items).toEqual([]);
    await request(server()).get(`/v1/cruising/spots/${spot.slug}`).expect(404);
    const mine = await request(server()).get('/v1/cruising/me/spots').set(ana.auth).expect(200);
    expect(mine.body.items[0]).toMatchObject({ id: spot.id, status: 'PENDING' });
    expect((await request(server()).get('/v1/cruising/me/spots').set(bea.auth)).body.items).toEqual(
      [],
    );

    // Only the team sees it, and only the team decides.
    await request(server()).get('/v1/admin/cruising/spots').set(ana.auth).expect(403);
    await request(server())
      .post(`/v1/admin/cruising/spots/${spot.id}/approve`)
      .set(ana.auth)
      .expect(403);
    await request(server()).get('/v1/admin/cruising/spots').expect(401);
    const queue = await request(server())
      .get(`/v1/admin/cruising/spots?status=PENDING&q=${tag}`)
      .set(admin.auth)
      .expect(200);
    expect(queue.body.items).toHaveLength(1);
    expect(queue.body.items[0]).toMatchObject({
      id: spot.id,
      createdBy: { userId: ana.id, email: ana.email },
      openReports: 0,
    });

    // The team corrects a field; the slug stays.
    await request(server())
      .patch(`/v1/admin/cruising/spots/${spot.id}`)
      .set(admin.auth)
      .send({ description: 'Corrected by the team.' })
      .expect(204);
    await approve(spot.id);
    await request(server())
      .post(`/v1/admin/cruising/spots/${spot.id}/approve`)
      .set(admin.auth)
      .expect(409);

    // The proposer is told, without the name of the spot.
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(ana.email);
    expect(sent[0]?.subject).toBe('Your spot is live — Cruising');
    expect(sent[0]?.text).not.toMatch(NAME);
    expect(sent[0]?.html).not.toMatch(NAME);

    // Public now, with rounded coordinates.
    const map = await inBox();
    expect(map.items.map((item) => item.slug)).toEqual([spot.slug]);
    expect(map.items[0]).toMatchObject({ lat: 10.12346, lng: -149.98765 });
    expect(map.truncated).toBe(false);
    const page = await request(server()).get(`/v1/cruising/spots/${spot.slug}`).expect(200);
    expect(page.body).toMatchObject({
      slug: spot.slug,
      type: 'BEACH',
      countryCode: 'ES',
      description: 'Corrected by the team.',
      bestTimes: null,
      ratingAvg: 0,
      ratingCount: 0,
    });
    const filtered = await request(server()).get(`/v1/cruising/spots?bbox=${BOX}&type=PARK`);
    expect(filtered.body.items).toEqual([]);
    const city = await request(server()).get(`/v1/cruising/places/es/playa-${tag}`).expect(200);
    expect(city.body).toMatchObject({ countryCode: 'ES', city: `Playa ${tag}` });
    expect(city.body.items).toHaveLength(1);
    const places = await request(server()).get('/v1/cruising/places').expect(200);
    const spain = places.body.countries.find(
      (c: { countryCode: string }) => c.countryCode === 'ES',
    );
    expect(spain.cities.some((c: { citySlug: string }) => c.citySlug === `playa-${tag}`)).toBe(
      true,
    );
    const sitemap = await request(server()).get('/v1/cruising/sitemap').expect(200);
    expect(sitemap.body.items.some((i: { slug: string }) => i.slug === spot.slug)).toBe(true);

    // A live spot cannot be changed or deleted by its proposer.
    await request(server())
      .patch(`/v1/cruising/spots/${spot.id}`)
      .set(ana.auth)
      .send({ name: 'Renamed' })
      .expect(409);
    await request(server()).delete(`/v1/cruising/spots/${spot.id}`).set(ana.auth).expect(409);

    // The team hides it again.
    await request(server())
      .post(`/v1/admin/cruising/spots/${spot.id}/hide`)
      .set(admin.auth)
      .expect(204);
    expect((await inBox()).items).toEqual([]);
    await request(server())
      .post(`/v1/admin/cruising/spots/${spot.id}/hide`)
      .set(admin.auth)
      .expect(409);
    await request(server()).get(`/v1/cruising/spots/${spot.slug}`).expect(404);
  });

  it('gives a second spot with the same name its own slug', async () => {
    const first = await propose(bea, 'Twin', 2);
    const second = await propose(eva, 'Twin', 3);
    expect(first.slug).toBe(`twin-${tag}`);
    expect(second.slug).toBe(`twin-${tag}-2`);
  });

  it('rejects with a reason, lets the proposer edit and sends it back for review', async () => {
    const spot = await propose(dani, 'Wood', 4, { type: 'FOREST' });
    await request(server())
      .post(`/v1/admin/cruising/spots/${spot.id}/reject`)
      .set(admin.auth)
      .send({ reason: 'x' })
      .expect(400);
    await request(server())
      .post(`/v1/admin/cruising/spots/${spot.id}/reject`)
      .set(admin.auth)
      .send({ reason: 'Too close to a school' })
      .expect(204);
    // Dani turned the alerts on again above; decisions are always mailed anyway.
    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).toContain('Too close to a school');
    expect(sent[0]?.text).not.toMatch(NAME);
    await request(server())
      .post(`/v1/admin/cruising/spots/${spot.id}/reject`)
      .set(admin.auth)
      .send({ reason: 'Too close to a school' })
      .expect(409);

    const mine = await request(server()).get('/v1/cruising/me/spots').set(dani.auth);
    expect(mine.body.items.find((i: { id: string }) => i.id === spot.id)).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'Too close to a school',
    });

    // Not hers: 404.
    await request(server())
      .patch(`/v1/cruising/spots/${spot.id}`)
      .set(bea.auth)
      .send({ name: 'Mine now' })
      .expect(404);
    await request(server()).delete(`/v1/cruising/spots/${spot.id}`).set(bea.auth).expect(404);

    const edited = await request(server())
      .patch(`/v1/cruising/spots/${spot.id}`)
      .set(dani.auth)
      .send({ city: `Other ${tag}`, bestTimes: 'weekday evenings' })
      .expect(200);
    expect(edited.body).toMatchObject({ id: spot.id, slug: spot.slug, status: 'PENDING' });
    const row = await prisma.cruisingSpot.findUnique({ where: { id: spot.id } });
    expect(row).toMatchObject({
      status: 'PENDING',
      rejectReason: null,
      citySlug: `other-${tag}`,
      bestTimes: 'weekday evenings',
    });
    await request(server())
      .patch(`/v1/cruising/spots/${spot.id}`)
      .set(dani.auth)
      .send({})
      .expect(400);
    await request(server()).delete(`/v1/cruising/spots/${spot.id}`).set(dani.auth).expect(204);
    expect(await prisma.cruisingSpot.count({ where: { id: spot.id } })).toBe(0);
  });

  it('validates a proposal', async () => {
    // Few cases: the schema's own tests cover the rest, and proposing is limited per minute.
    const bad = [
      { name: 'x' },
      { type: 'MOON' },
      { lat: 91 },
      { countryCode: 'ZZ' },
      { description: 'x'.repeat(1001) },
      { bestTimes: 'x'.repeat(201) },
    ];
    for (const over of bad) {
      const res = await request(server())
        .post('/v1/cruising/spots')
        .set(eva.auth)
        .send(spotBody('Bad', 9, over));
      expect({ over, status: res.status }).toEqual({ over, status: 400 });
    }
  });

  it('allows 5 proposals a day', async () => {
    const frank = await member('Frank');
    for (let n = 0; n < 5; n += 1) await propose(frank, `Many ${n}`, 20 + n);
    const sixth = await request(server())
      .post('/v1/cruising/spots')
      .set(frank.auth)
      .send(spotBody('Many 5', 30));
    expect(sixth.status).toBe(429);
  });

  it('keeps one review per member, recomputes the rating and filters contact details', async () => {
    const spot = await liveSpot('Reviewed', 5, ana);
    const review = (who: Person, body: unknown) =>
      request(server()).put(`/v1/cruising/spots/${spot.id}/review`).set(who.auth).send(body);
    const rating = async () => {
      const res = await request(server()).get(`/v1/cruising/spots/${spot.slug}`).expect(200);
      return { avg: res.body.ratingAvg, count: res.body.ratingCount };
    };

    await review(carla, { rating: 5, text: 'Great at night.' }).expect(200);
    await review(bea, { rating: 4 }).expect(200);
    expect(await rating()).toEqual({ avg: 4.5, count: 2 });

    // The same member again replaces the review.
    const replaced = await review(bea, { rating: 2, text: 'Not so good.' }).expect(200);
    expect(replaced.body).toMatchObject({
      rating: 2,
      text: 'Not so good.',
      mine: true,
      author: null,
    });
    expect(await rating()).toEqual({ avg: 3.5, count: 2 });
    expect(await prisma.cruisingReview.count({ where: { spotId: spot.id } })).toBe(2);

    await review(bea, { rating: 0 }).expect(400);
    await review(bea, { rating: 6 }).expect(400);
    await review(bea, { rating: 3, text: 'x'.repeat(1001) }).expect(400);
    for (const text of [
      'Call me on +34 612 345 678',
      'mail me bea@example.com',
      'see https://example.com',
      'find me on instagram',
    ]) {
      await review(bea, { rating: 3, text }).expect(400);
    }
    expect(await rating()).toEqual({ avg: 3.5, count: 2 });

    // Only members who entered read them; the public page shows the average and the count.
    await request(server()).get(`/v1/cruising/spots/${spot.id}/reviews`).expect(401);
    const list = await request(server())
      .get(`/v1/cruising/spots/${spot.id}/reviews?page=1&pageSize=1`)
      .set(bea.auth)
      .expect(200);
    expect(list.body).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect(list.body.items).toHaveLength(1);
    const all = await request(server())
      .get(`/v1/cruising/spots/${spot.id}/reviews`)
      .set(bea.auth)
      .expect(200);
    expect(all.body.items.filter((item: { mine: boolean }) => item.mine)).toHaveLength(1);
    expect(JSON.stringify(all.body)).not.toContain(bea.id);
    expect(JSON.stringify(all.body)).not.toContain(carla.id);

    // A review of a spot that is not live is a 404.
    const pending = await liveSpot('Not live', 6, ana, 'PENDING');
    await request(server())
      .put(`/v1/cruising/spots/${pending.id}/review`)
      .set(bea.auth)
      .send({ rating: 3 })
      .expect(404);

    await request(server())
      .delete(`/v1/cruising/spots/${spot.id}/review`)
      .set(bea.auth)
      .expect(204);
    expect(await rating()).toEqual({ avg: 5, count: 1 });
    await request(server())
      .delete(`/v1/cruising/spots/${spot.id}/review`)
      .set(bea.auth)
      .expect(404);
  });

  it('limits reviews to 10 a day, creating or editing', async () => {
    const gina = await member('Gina');
    const spots = [];
    for (let n = 0; n < 11; n += 1) spots.push(await liveSpot(`Many reviews ${n}`, 40 + n));
    // Ten reviews written today (set up in the database: the route is limited per minute too).
    await prisma.cruisingReview.createMany({
      data: spots.slice(0, 10).map((spot) => ({ spotId: spot.id, userId: gina.id, rating: 3 })),
    });
    // Editing one of today's doesn't count again; a new one does.
    await request(server())
      .put(`/v1/cruising/spots/${spots[0]?.id}/review`)
      .set(gina.auth)
      .send({ rating: 4 })
      .expect(200);
    const eleventh = await request(server())
      .put(`/v1/cruising/spots/${spots[10]?.id}/review`)
      .set(gina.auth)
      .send({ rating: 3 });
    expect(eleventh.status).toBe(429);
  });

  it('hides a spot reported as MINOR at once, emails the team and restores it when dismissed', async () => {
    const spot = await liveSpot('Reported', 7);
    await request(server())
      .post('/v1/cruising/reports')
      .set(bea.auth)
      .send({ spotId: spot.id, reason: 'WRONG_INFO' })
      .expect(400);
    await request(server())
      .post('/v1/cruising/reports')
      .set(bea.auth)
      .send({ spotId: randomUUID(), reason: 'SPAM' })
      .expect(404);

    await request(server())
      .post('/v1/cruising/reports')
      .set(bea.auth)
      .send({ spotId: spot.id, reason: 'MINOR', details: 'Children play there.' })
      .expect(204);
    expect((await inBox()).items.map((i) => i.slug)).not.toContain(spot.slug);
    await request(server()).get(`/v1/cruising/spots/${spot.slug}`).expect(404);
    const alert = sent.find((mail) => mail.subject === 'Cruising: possible minor reported');
    expect(alert?.to).toBe(app.get(AppConfigService).leadsNotifyTo);
    expect(alert?.text).not.toMatch(NAME);

    const open = await request(server())
      .get('/v1/admin/cruising/reports?status=OPEN')
      .set(admin.auth)
      .expect(200);
    const report = open.body.items.find(
      (item: { target?: { spot?: { id: string } } }) => item.target?.spot?.id === spot.id,
    );
    expect(report).toMatchObject({
      reason: 'MINOR',
      reporter: { userId: bea.id },
      reported: { userId: spot.owner.id },
    });
    await request(server()).get('/v1/admin/cruising/reports').set(bea.auth).expect(403);

    await request(server())
      .post(`/v1/admin/cruising/reports/${report.id}/dismiss`)
      .set(admin.auth)
      .expect(204);
    await request(server())
      .post(`/v1/admin/cruising/reports/${report.id}/dismiss`)
      .set(admin.auth)
      .expect(404);
    await request(server()).get(`/v1/cruising/spots/${spot.slug}`).expect(200);
  });

  it('hides a review reported as ILLEGAL and puts the rating right again', async () => {
    const spot = await liveSpot('Review reports', 8);
    const put = (who: Person, rating: number) =>
      request(server()).put(`/v1/cruising/spots/${spot.id}/review`).set(who.auth).send({ rating });
    await put(bea, 5).expect(200);
    const mine = await put(eva, 1).expect(200);
    const rating = async () =>
      (await request(server()).get(`/v1/cruising/spots/${spot.slug}`)).body.ratingAvg;
    expect(await rating()).toBe(3);

    // Not one's own review.
    await request(server())
      .post('/v1/cruising/reports')
      .set(eva.auth)
      .send({ reviewId: mine.body.id, reason: 'SPAM' })
      .expect(404);
    await request(server())
      .post('/v1/cruising/reports')
      .set(bea.auth)
      .send({ reviewId: mine.body.id, reason: 'WRONG_INFO', details: 'x' })
      .expect(400);
    await request(server())
      .post('/v1/cruising/reports')
      .set(bea.auth)
      .send({ reviewId: mine.body.id, reason: 'ILLEGAL' })
      .expect(204);
    expect(await rating()).toBe(5);
    const list = await request(server())
      .get(`/v1/cruising/spots/${spot.id}/reviews`)
      .set(bea.auth)
      .expect(200);
    expect(list.body.items.map((i: { id: string }) => i.id)).not.toContain(mine.body.id);

    const open = await request(server())
      .get('/v1/admin/cruising/reports?status=OPEN')
      .set(admin.auth)
      .expect(200);
    const report = open.body.items.find(
      (item: { target?: { review?: { id: string } } }) => item.target?.review?.id === mine.body.id,
    );
    expect(report).toBeDefined();
    await request(server())
      .post(`/v1/admin/cruising/reports/${report.id}/dismiss`)
      .set(admin.auth)
      .expect(204);
    expect(await rating()).toBe(3);
  });

  it('acts on a report: rejects the spot, suspends its proposer and lifts it', async () => {
    const hana = await member('Hana');
    const spot = await liveSpot('Dangerous', 9, hana);
    await request(server())
      .post('/v1/cruising/reports')
      .set(bea.auth)
      .send({ spotId: spot.id, reason: 'DANGER', details: 'Cliff edge.' })
      .expect(204);
    // DANGER doesn't hide it by itself.
    await request(server()).get(`/v1/cruising/spots/${spot.slug}`).expect(200);

    const open = await request(server())
      .get('/v1/admin/cruising/reports')
      .set(admin.auth)
      .expect(200);
    const report = open.body.items.find(
      (item: { target?: { spot?: { id: string } } }) => item.target?.spot?.id === spot.id,
    );
    sent.length = 0;
    await request(server())
      .post(`/v1/admin/cruising/reports/${report.id}/action`)
      .set(admin.auth)
      .send({ remove: true, suspend: '7d', reason: 'Dangerous place' })
      .expect(204);
    expect((await prisma.cruisingSpot.findUnique({ where: { id: spot.id } }))?.status).toBe(
      'REJECTED',
    );
    await request(server()).get(`/v1/cruising/spots/${spot.slug}`).expect(404);
    const done = await request(server())
      .get('/v1/admin/cruising/reports?status=ACTIONED')
      .set(admin.auth)
      .expect(200);
    expect(done.body.items.some((i: { id: string }) => i.id === report.id)).toBe(true);
    expect(sent.map((mail) => mail.subject)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('We didn'),
        'Your Cruising account is suspended — Cruising',
      ]),
    );
    for (const mail of sent) expect(mail.text).not.toMatch(NAME);

    // Suspended: browse yes, propose, review and report no.
    const me = await request(server()).get('/v1/cruising/me').set(hana.auth).expect(200);
    expect(me.body).toMatchObject({ suspended: true, allowed: false });
    expect(me.body.suspension.until).toBeTruthy();
    await request(server()).get(`/v1/cruising/spots?bbox=${BOX}`).expect(200);
    await request(server())
      .post('/v1/cruising/spots')
      .set(hana.auth)
      .send(spotBody('Suspended', 10))
      .expect(403);
    const other = await liveSpot('Other live', 11);
    await request(server())
      .put(`/v1/cruising/spots/${other.id}/review`)
      .set(hana.auth)
      .send({ rating: 3 })
      .expect(403);
    await request(server())
      .post('/v1/cruising/reports')
      .set(hana.auth)
      .send({ spotId: other.id, reason: 'SPAM' })
      .expect(403);

    const suspensions = await request(server())
      .get('/v1/admin/cruising/suspensions')
      .set(admin.auth)
      .expect(200);
    expect(
      suspensions.body.items.find((i: { userId: string }) => i.userId === hana.id),
    ).toMatchObject({
      email: hana.email,
      reason: 'Dangerous place',
    });
    await request(server())
      .delete(`/v1/admin/cruising/users/${hana.id}/suspension`)
      .set(admin.auth)
      .expect(204);
    await request(server())
      .delete(`/v1/admin/cruising/users/${hana.id}/suspension`)
      .set(admin.auth)
      .expect(404);
    expect((await request(server()).get('/v1/cruising/me').set(hana.auth)).body.allowed).toBe(true);

    // The team can also suspend directly; not a member: 404.
    await request(server())
      .post(`/v1/admin/cruising/users/${hana.id}/suspend`)
      .set(admin.auth)
      .send({ duration: 'permanent' })
      .expect(204);
    await request(server())
      .post(`/v1/admin/cruising/users/${admin.id}/suspend`)
      .set(admin.auth)
      .send({ duration: '24h' })
      .expect(404);
    await request(server())
      .delete(`/v1/admin/cruising/users/${hana.id}/suspension`)
      .set(admin.auth)
      .expect(204);
  });

  it('takes a spot down from a removal request, and the team answers', async () => {
    const spot = await liveSpot('Takedown', 12);
    const res = await request(server())
      .post('/v1/cruising/takedown')
      .send({
        email: `victim-${tag}@example.com`,
        spotLink: `https://cruising.codeqlick.com/es/spots/${spot.slug.toUpperCase()}`,
        reason: 'ILLEGAL',
        details: 'This place is private property.',
        locale: 'es',
      })
      .expect(200);
    expect(res.body.id).toBeTruthy();
    expect((await prisma.cruisingSpot.findUnique({ where: { id: spot.id } }))?.status).toBe(
      'HIDDEN',
    );
    await request(server()).get(`/v1/cruising/spots/${spot.slug}`).expect(404);
    expect(sent.map((mail) => mail.subject)).toEqual(
      expect.arrayContaining([
        'Cruising: removal request',
        'Hemos recibido tu solicitud de retirada — Cruising',
      ]),
    );
    for (const mail of sent) expect(mail.text).not.toMatch(NAME);

    const open = await request(server())
      .get('/v1/admin/cruising/takedowns?status=OPEN')
      .set(admin.auth)
      .expect(200);
    expect(open.body.items.find((i: { id: string }) => i.id === res.body.id)).toMatchObject({
      email: `victim-${tag}@example.com`,
      spot: { id: spot.id },
    });
    await request(server()).get('/v1/admin/cruising/takedowns').set(ana.auth).expect(403);

    sent.length = 0;
    await request(server())
      .post(`/v1/admin/cruising/takedowns/${res.body.id}`)
      .set(admin.auth)
      .send({ remove: true, response: 'Removed.' })
      .expect(204);
    expect((await prisma.cruisingSpot.findUnique({ where: { id: spot.id } }))?.status).toBe(
      'REJECTED',
    );
    expect(sent.map((mail) => mail.subject)).toContain('Hemos retirado el lugar — Cruising');
    await request(server())
      .post(`/v1/admin/cruising/takedowns/${res.body.id}`)
      .set(admin.auth)
      .send({ remove: true })
      .expect(404);

    // A request that is closed restores the spot.
    const second = await liveSpot('Takedown two', 13);
    const closed = await request(server())
      .post('/v1/cruising/takedown')
      .send({
        email: `victim2-${tag}@example.com`,
        spotLink: second.slug,
        reason: 'OTHER',
        details: 'I would like this removed.',
      })
      .expect(200);
    await request(server()).get(`/v1/cruising/spots/${second.slug}`).expect(404);
    await request(server())
      .post(`/v1/admin/cruising/takedowns/${closed.body.id}`)
      .set(admin.auth)
      .send({ remove: false, response: 'Nothing to remove.' })
      .expect(204);
    await request(server()).get(`/v1/cruising/spots/${second.slug}`).expect(200);
    // The honeypot pretends and stores nothing.
    const before = await prisma.cruisingTakedown.count();
    await request(server())
      .post('/v1/cruising/takedown')
      .send({ email: 'bot@example.com', reason: 'OTHER', details: 'xxxxxxxxxxxx', website: 'x' })
      .expect(200);
    expect(await prisma.cruisingTakedown.count()).toBe(before);
    await request(server())
      .post('/v1/cruising/takedown')
      .send({ email: 'nope', reason: 'OTHER', details: 'xxxxxxxxxxxx' })
      .expect(400);
  });

  it('shows the team its overview and the digest counts', async () => {
    const res = await request(server())
      .get('/v1/admin/cruising/overview')
      .set(admin.auth)
      .expect(200);
    for (const key of [
      'members',
      'pendingSpots',
      'liveSpots',
      'openReports',
      'openTakedowns',
      'reviews',
      'suspended',
    ]) {
      expect(typeof res.body[key]).toBe('number');
    }
    await request(server()).get('/v1/admin/cruising/overview').set(ana.auth).expect(403);
  });

  it('exports the Cruising data and deletes it with the account, keeping the spots', async () => {
    const ines = await person('Ines');
    await enter(ines, '1985-03-03').expect(200);
    const mine = await liveSpot('Ines spot', 14, ines);
    const target = await liveSpot('Rated by Ines', 15);
    await request(server())
      .put(`/v1/cruising/spots/${target.id}/review`)
      .set(ines.auth)
      .send({ rating: 1, text: 'Meh.' })
      .expect(200);
    await request(server())
      .put(`/v1/cruising/spots/${target.id}/review`)
      .set(bea.auth)
      .send({ rating: 5 })
      .expect(200);
    await request(server())
      .post('/v1/cruising/reports')
      .set(ines.auth)
      .send({ spotId: target.id, reason: 'SPAM' })
      .expect(204);
    const rating = async () =>
      (await request(server()).get(`/v1/cruising/spots/${target.slug}`)).body;
    expect(await rating()).toMatchObject({ ratingAvg: 3, ratingCount: 2 });

    const exported = await request(server()).get('/v1/auth/me/export').set(ines.auth).expect(200);
    expect(exported.body.cruising.profile).toMatchObject({ birthYear: 1985, emailAlerts: true });
    expect(JSON.stringify(exported.body.cruising)).not.toContain('1985-03-03');
    expect(exported.body.cruising.spotsProposed.map((s: { slug: string }) => s.slug)).toEqual([
      mine.slug,
    ]);
    expect(exported.body.cruising.reviews).toHaveLength(1);
    expect(exported.body.cruising.reviews[0]).toMatchObject({
      rating: 1,
      spot: { slug: target.slug },
    });
    expect(exported.body.cruising.reportsMade).toHaveLength(1);

    // Someone who never entered has no Cruising section.
    const none = await request(server()).get('/v1/auth/me/export').set(admin.auth).expect(200);
    expect(none.body.cruising).toBeNull();

    // Deleting the account (the password is needed).
    const login = await request(server())
      .post('/v1/auth/login')
      .send({ email: ines.email, password })
      .expect(200);
    await request(server())
      .delete('/v1/auth/me')
      .set({ Authorization: `Bearer ${login.body.accessToken}` })
      .send({ password })
      .expect(204);
    expect(await prisma.cruisingProfile.count({ where: { userId: ines.id } })).toBe(0);
    expect(await prisma.cruisingReview.count({ where: { userId: ines.id } })).toBe(0);
    expect(await prisma.cruisingReport.count({ where: { reporterId: ines.id } })).toBe(0);
    // Her spot stays, with nobody behind it; the spot she reviewed has its rating worked out again.
    const kept = await prisma.cruisingSpot.findUnique({ where: { id: mine.id } });
    expect(kept).toMatchObject({ status: 'LIVE', createdById: null });
    expect(await rating()).toMatchObject({ ratingAvg: 5, ratingCount: 1 });
  });
});
