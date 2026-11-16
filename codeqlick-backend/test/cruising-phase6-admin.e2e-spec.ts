import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AppConfigService } from '../src/config/app-config.service.js';
import { Role, type CruisingSpotStatus } from '../src/generated/prisma/client.js';
import { madridWeekStart } from '../src/modules/cruising/cruising-stats.rules.js';
import {
  CruisingStatsService,
  type CruisingStats,
  type CruisingStatsWeek,
} from '../src/modules/cruising/cruising-stats.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const tag = randomUUID().slice(0, 8);
const password = 'cruising-phase6-password-1';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** A country no other test uses, so the top lists and suggestions are only ours. */
const COUNTRY = 'AQ';

type Person = { id: string; email: string; nick: string; auth: { Authorization: string } };

function weekOf(stats: CruisingStats, start: string): CruisingStatsWeek {
  const week = stats.weeks.find((item) => item.start === start);
  expect(week).toBeDefined();
  return week!;
}

/**
 * Cruising phase 6 (architecture 4.15): the admin statistics (decision 101) and the onboarding's
 * suggestions and tour state (decision 102).
 */
describe('Cruising phase 6: statistics and onboarding (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let version: string;
  let admin: Person;
  let made = 0;
  let spots = 0;

  const server = () => app.getHttpServer();

  async function person(name: string, role: Role = Role.CLIENT): Promise<Person> {
    made += 1;
    const email = `e2e-cruising-p6-${name.toLowerCase()}-${tag}@codeqlick.test`;
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await prisma.user.create({ data: { email, name, role, passwordHash } });
    const token = await app.get(JwtService).signAsync({ sub: user.id, email, name, role });
    const nick = `${name.toLowerCase().slice(0, 6)}_${tag.slice(0, 6)}_${made}`;
    return { id: user.id, email, nick, auth: { Authorization: `Bearer ${token}` } };
  }

  async function member(
    name: string,
    over: { country?: string; createdAt?: Date } = {},
  ): Promise<Person> {
    const who = await person(name);
    await prisma.cruisingProfile.create({
      data: {
        userId: who.id,
        birthYear: 1990,
        termsVersion: version,
        acceptedAt: new Date(),
        nickname: who.nick,
        country: over.country ?? null,
        ...(over.createdAt ? { createdAt: over.createdAt } : {}),
      },
    });
    return who;
  }

  async function spot(over: {
    status?: CruisingSpotStatus;
    lat?: number;
    lng?: number;
    countryCode?: string;
    ratingAvg?: number;
    hourCheckIns?: number;
    createdById?: string;
    createdAt?: Date;
  }): Promise<{ id: string; slug: string }> {
    spots += 1;
    const name = `Phase six spot ${spots} ${tag}`;
    const row = await prisma.cruisingSpot.create({
      data: {
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name,
        type: 'PARK',
        lat: over.lat ?? -75.1 - spots / 1000,
        lng: over.lng ?? 120.1,
        countryCode: over.countryCode ?? COUNTRY,
        city: `Phase six ${tag}`,
        citySlug: `phase-six-${tag}`,
        description: 'A spot used for the phase 6 tests.',
        status: over.status ?? 'LIVE',
        ratingAvg: over.ratingAvg ?? 0,
        ratingCount: over.ratingAvg ? 3 : 0,
        hourCheckIns: over.hourCheckIns ?? 0,
        createdById: over.createdById ?? null,
        ...(over.createdAt ? { createdAt: over.createdAt } : {}),
      },
    });
    return { id: row.id, slug: row.slug };
  }

  const getStats = async (who: Person): Promise<CruisingStats> => {
    const response = await request(server()).get('/v1/admin/cruising/stats').set(who.auth);
    expect(response.status).toBe(200);
    return response.body as CruisingStats;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    version = app.get(AppConfigService).cruisingTermsVersion;
    admin = await person('Admin', Role.ADMIN);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cruisingTakedown.deleteMany({ where: { details: { contains: tag } } });
      await prisma.cruisingSpot.deleteMany({ where: { name: { contains: tag } } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@codeqlick.test` } } });
    }
    await app?.close();
  });

  // ---- Admin statistics (decision 101) -----------------------------------------------------------

  it('are only for the team', async () => {
    const someone = await member('Nosy');
    expect((await request(server()).get('/v1/admin/cruising/stats')).status).toBe(401);
    expect((await request(server()).get('/v1/admin/cruising/stats').set(someone.auth)).status).toBe(
      403,
    );
  });

  it('count 12 Madrid weeks of activity, cached 10 minutes', async () => {
    const service = app.get(CruisingStatsService);
    // A Wednesday at noon three weeks ago (Madrid), so nothing else of this run falls in its week.
    const at = new Date(Date.now() - 21 * DAY);
    const weekStart = madridWeekStart(at);
    const t = new Date(`${weekStart}T11:00:00Z`);
    t.setUTCDate(t.getUTCDate() + 2);

    service.clearCache();
    const before = await getStats(admin);
    expect(before.weeks).toHaveLength(12);
    expect(before.weeks.at(-1)!.start).toBe(madridWeekStart(new Date()));
    const base = weekOf(before, weekStart);

    // Three members entered that week; Ana and Bea did things, Carla didn't.
    const ana = await member('Ana', { createdAt: t });
    const bea = await member('Bea', { createdAt: t });
    await member('Carla', { createdAt: t });
    const place = await spot({ createdById: ana.id, createdAt: t });
    await spot({ createdById: ana.id, createdAt: t });
    await spot({ status: 'PENDING', createdById: ana.id, createdAt: t });
    await spot({ status: 'REJECTED', createdById: ana.id, createdAt: t });
    await spot({ status: 'REMOVED', createdById: ana.id, createdAt: t });
    await prisma.cruisingCheckIn.createMany({
      data: [ana, bea, ana].map((who) => ({
        userId: who.id,
        spotId: place.id,
        expiresAt: new Date(t.getTime() + HOUR),
        createdAt: t,
      })),
    });
    const [a, b] = [ana.id, bea.id].toSorted();
    const conversation = await prisma.cruisingConversation.create({
      data: { userAId: a!, userBId: b!, starterId: ana.id, createdAt: t },
    });
    await prisma.cruisingMessage.createMany({
      data: [ana, bea].map((who) => ({
        conversationId: conversation.id,
        senderId: who.id,
        text: 'Hello',
        createdAt: t,
      })),
    });
    await prisma.cruisingMedia.create({
      data: {
        ref: `P6${tag.slice(0, 6)}`.toUpperCase(),
        ownerId: bea.id,
        kind: 'PHOTO',
        status: 'LIVE',
        createdAt: t,
      },
    });
    await prisma.cruisingMeetup.create({
      data: {
        spotId: place.id,
        hostId: ana.id,
        title: 'Walk',
        startsAt: new Date(t.getTime() + DAY),
        endsAt: new Date(t.getTime() + DAY + HOUR),
        createdAt: t,
      },
    });
    // Two reports decided after 2 and 6 hours (median 4), one still open.
    await prisma.cruisingReport.createMany({
      data: [2, 6, null].map((hours) => ({
        reporterId: bea.id,
        targetType: 'SPOT' as const,
        spotId: place.id,
        reason: 'SPAM' as const,
        status: hours === null ? ('OPEN' as const) : ('DISMISSED' as const),
        reviewedAt: hours === null ? null : new Date(t.getTime() + hours * HOUR),
        createdAt: t,
      })),
    });
    await prisma.cruisingTakedown.create({
      data: {
        email: `takedown-${tag}@codeqlick.test`,
        reason: 'OTHER',
        details: `A removal request ${tag}`,
        createdAt: t,
      },
    });
    // Check-ins now at the country's spots, for the top places of the last 30 days.
    await prisma.cruisingCheckIn.create({
      data: { userId: bea.id, spotId: place.id, expiresAt: new Date(Date.now() + HOUR) },
    });

    // Cached: the same figures for 10 minutes.
    const cached = await getStats(admin);
    expect(cached.generatedAt).toBe(before.generatedAt);
    expect(weekOf(cached, weekStart)).toEqual(base);

    service.clearCache();
    const after = await getStats(admin);
    expect(after.generatedAt).not.toBe(before.generatedAt);
    const week = weekOf(after, weekStart);
    expect(week.members - base.members).toBe(3);
    expect(week.active - base.active).toBe(2);
    expect(week.spots.live - base.spots.live).toBe(2);
    expect(week.spots.pending - base.spots.pending).toBe(1);
    expect(week.spots.rejected - base.spots.rejected).toBe(2);
    expect(week.checkIns - base.checkIns).toBe(3);
    expect(week.messages - base.messages).toBe(2);
    expect(week.media - base.media).toBe(1);
    expect(week.meetups - base.meetups).toBe(1);
    expect(week.reportsOpened - base.reportsOpened).toBe(3);
    expect(week.reportsDecided - base.reportsDecided).toBe(2);
    expect(base.reportsDecided).toBe(0);
    expect(week.medianDecisionHours).toBe(4);
    expect(week.takedowns - base.takedowns).toBe(1);
    expect(week.roomMessages).toBe(0);

    // The country's two LIVE spots (the pending and rejected ones don't count), and its check-in.
    expect(after.topCountries.spots).toContainEqual({ countryCode: COUNTRY, count: 2 });
    expect(after.topCities.spots).toContainEqual({
      countryCode: COUNTRY,
      citySlug: `phase-six-${tag}`,
      city: `Phase six ${tag}`,
      count: 2,
    });
    // Only the check-in of the last 30 days: the three of three weeks ago count too (21 days).
    expect(after.topCountries.checkIns).toContainEqual({ countryCode: COUNTRY, count: 4 });
    expect(after.topCities.checkIns[0]).toBeDefined();
    // Aggregates only: no ids, emails or nicknames anywhere.
    const text = JSON.stringify(after);
    for (const who of [ana, bea]) {
      expect(text).not.toContain(who.id);
      expect(text).not.toContain(who.nick);
    }

    await prisma.cruisingSpot.deleteMany({
      where: { countryCode: COUNTRY, name: { contains: tag } },
    });
    service.clearCache();
  });

  // ---- Onboarding (decision 102) -----------------------------------------------------------------

  it('suggests the best LIVE spots of my country, up to 12', async () => {
    const newcomer = await member('Newcomer', { country: COUNTRY });
    const best = await spot({ ratingAvg: 4.8 });
    const busy = await spot({ ratingAvg: 4.2, hourCheckIns: 40 });
    const quiet = await spot({ ratingAvg: 4.2, hourCheckIns: 1 });
    for (let i = 0; i < 10; i++) await spot({});
    const pending = await spot({ status: 'PENDING', ratingAvg: 5 });
    const hidden = await spot({ status: 'HIDDEN', ratingAvg: 5 });
    const elsewhere = await spot({ countryCode: 'PT', ratingAvg: 5, lat: 12.1, lng: -140.1 });

    expect((await request(server()).get('/v1/cruising/suggestions')).status).toBe(401);
    const outsider = await person('Outsider');
    expect(
      (await request(server()).get('/v1/cruising/suggestions').set(outsider.auth)).status,
    ).toBe(403);

    const response = await request(server()).get('/v1/cruising/suggestions').set(newcomer.auth);
    expect(response.status).toBe(200);
    const ids = (response.body.items as { id: string }[]).map((item) => item.id);
    expect(ids).toHaveLength(12);
    expect(ids.slice(0, 3)).toEqual([best.id, busy.id, quiet.id]);
    for (const id of [pending.id, hidden.id, elsewhere.id]) expect(ids).not.toContain(id);
    expect(response.body.items[0]).toMatchObject({
      slug: best.slug,
      type: 'PARK',
      ratingAvg: 4.8,
    });
  });

  it('suggests near the map instead when given a box on the grid', async () => {
    const traveller = await member('Traveller', { country: COUNTRY });
    const near = await spot({ lat: -60.1, lng: 100.1, ratingAvg: 3 });
    const nearPending = await spot({ status: 'PENDING', lat: -60.2, lng: 100.2 });
    await spot({ lat: -61.1, lng: 100.1, ratingAvg: 5 });

    const inBox = await request(server())
      .get('/v1/cruising/suggestions')
      .query({ bbox: '100,-60.25,100.25,-60' })
      .set(traveller.auth);
    expect(inBox.status).toBe(200);
    expect((inBox.body.items as { id: string }[]).map((item) => item.id)).toEqual([near.id]);
    expect(nearPending.id).not.toBe(near.id);

    const offGrid = await request(server())
      .get('/v1/cruising/suggestions')
      .query({ bbox: '100.1,-60.25,100.25,-60' })
      .set(traveller.auth);
    expect(offGrid.status).toBe(400);
    const malformed = await request(server())
      .get('/v1/cruising/suggestions')
      .query({ bbox: 'nope' })
      .set(traveller.auth);
    expect(malformed.status).toBe(400);
  });

  it('marks the tour done or skipped, and reopens it', async () => {
    const newcomer = await member('Tourist');
    const me = () => request(server()).get('/v1/cruising/me').set(newcomer.auth);
    expect((await me()).body.onboardingDone).toBe(false);

    const done = await request(server())
      .patch('/v1/cruising/profile')
      .set(newcomer.auth)
      .send({ onboardingDone: true });
    expect(done.status).toBe(200);
    expect(done.body.onboardingDone).toBe(true);
    expect((await me()).body.onboardingDone).toBe(true);
    const row = await prisma.cruisingProfile.findUniqueOrThrow({ where: { userId: newcomer.id } });
    expect(row.onboardingDoneAt).toBeInstanceOf(Date);

    const reopened = await request(server())
      .patch('/v1/cruising/profile')
      .set(newcomer.auth)
      .send({ onboardingDone: false });
    expect(reopened.body.onboardingDone).toBe(false);
    expect((await me()).body.onboardingDone).toBe(false);

    expect(
      (
        await request(server())
          .patch('/v1/cruising/profile')
          .set(newcomer.auth)
          .send({ onboardingDone: 'yes' })
      ).status,
    ).toBe(400);
  });
});
