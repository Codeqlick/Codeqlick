import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { madridWeekStart } from '../src/common/stats-weeks.js';
import { AppConfigService } from '../src/config/app-config.service.js';
import { Role } from '../src/generated/prisma/client.js';
import type { AdminOverview, OverviewWeek } from '../src/modules/stats/admin-overview.rules.js';
import { AdminOverviewService } from '../src/modules/stats/admin-overview.service.js';
import { CLIENT_WHERE } from '../src/modules/users/account-kind.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const tag = randomUUID().slice(0, 8);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const email = (name: string) => `e2e-overview-${name}-${tag}@codeqlick.test`;

type Person = { id: string; auth: { Authorization: string } };

function weekOf(overview: AdminOverview, start: string): OverviewWeek {
  const week = overview.weeks.find((item) => item.start === start);
  expect(week).toBeDefined();
  return week!;
}

/** The admin overview (architecture 4.17, decision 122): aggregates of the whole platform. */
describe('Admin overview (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let service: AdminOverviewService;
  let admin: Person;
  let made = 0;

  const server = () => app.getHttpServer();

  async function person(
    name: string,
    over: { role?: Role; createdAt?: Date; registeredAt?: Date | null } = {},
  ): Promise<Person> {
    made += 1;
    const role = over.role ?? Role.CLIENT;
    const user = await prisma.user.create({
      data: {
        email: email(`${name.toLowerCase()}-${made}`),
        name,
        role,
        passwordHash: 'not-a-real-hash',
        // Signed up by themselves unless said otherwise (a client prepared by the team has none).
        registeredAt: over.registeredAt === undefined ? new Date() : over.registeredAt,
        ...(over.createdAt ? { createdAt: over.createdAt } : {}),
      },
    });
    const token = await app
      .get(JwtService)
      .signAsync({ sub: user.id, email: user.email, name, role });
    return { id: user.id, auth: { Authorization: `Bearer ${token}` } };
  }

  async function session(userId: string, createdAt: Date) {
    await prisma.session.create({
      data: {
        userId,
        tokenHash: createHash('sha256').update(randomUUID()).digest('hex'),
        familyId: randomUUID(),
        expiresAt: new Date(Date.now() + 30 * DAY),
        createdAt,
      },
    });
  }

  const get = async (): Promise<AdminOverview> => {
    const response = await request(server()).get('/v1/admin/overview').set(admin.auth);
    expect(response.status).toBe(200);
    return response.body as AdminOverview;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    service = app.get(AdminOverviewService);
    admin = await person('Admin', { role: Role.ADMIN });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.sitePurchase.deleteMany({ where: { stripeSessionId: { contains: tag } } });
      await prisma.lead.deleteMany({ where: { email: { contains: `-${tag}@codeqlick.test` } } });
      await prisma.newsletterSubscriber.deleteMany({
        where: { email: { contains: `-${tag}@codeqlick.test` } },
      });
      await prisma.errorGroup.deleteMany({ where: { message: { contains: tag } } });
      await prisma.cloudTeam.deleteMany({ where: { slug: { contains: tag } } });
      await prisma.supportTicket.deleteMany({ where: { title: { contains: tag } } });
      await prisma.clientProject.deleteMany({ where: { name: { contains: tag } } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@codeqlick.test` } } });
    }
    await app?.close();
  });

  it('is only for the team', async () => {
    const someone = await person('Nosy');
    expect((await request(server()).get('/v1/admin/overview')).status).toBe(401);
    expect((await request(server()).get('/v1/admin/overview').set(someone.auth)).status).toBe(403);
  });

  it('answers 12 Madrid weeks and the totals, without listing anyone', async () => {
    service.clearCache();
    const overview = await get();
    expect(overview.weeks).toHaveLength(12);
    expect(overview.weeks.at(-1)!.start).toBe(madridWeekStart(new Date()));
    for (const week of overview.weeks) {
      expect(Object.keys(week).toSorted()).toEqual(
        [
          'accounts',
          'apps',
          'deployments',
          'leads',
          'newsletter',
          'purchases',
          'siteChecks',
          'start',
          'support',
        ].toSorted(),
      );
    }
    expect(Object.keys(overview).toSorted()).toEqual(
      ['activity', 'generatedAt', 'health', 'people', 'revenue', 'weeks'].toSorted(),
    );
    expect(overview.revenue.currency).toBe('eur');
    expect(Object.keys(overview.health.moderation)).toEqual(['cruising', 'swipe', 'videochat']);
    // Nothing that names a person.
    expect(JSON.stringify(overview)).not.toMatch(/@|email|name/i);
  });

  it('counts people, money, activity and health on seeded data, cached 10 minutes', async () => {
    // A Wednesday at noon three weeks ago (Madrid), so nothing else of this run falls in its week.
    const weekStart = madridWeekStart(new Date(Date.now() - 21 * DAY));
    const t = new Date(`${weekStart}T11:00:00Z`);
    t.setUTCDate(t.getUTCDate() + 2);

    service.clearCache();
    const before = await get();
    const base = weekOf(before, weekStart);

    // People: three accounts that week (one a client the team prepared), one admin (not counted).
    const ana = await person('Ana', { createdAt: t });
    const bea = await person('Bea', { createdAt: t });
    const client = await person('Client', { createdAt: t, registeredAt: null });
    await person('Teammate', { role: Role.ADMIN, createdAt: t });
    await session(ana.id, t);
    await session(ana.id, new Date(t.getTime() + HOUR));
    await session(bea.id, t);
    await prisma.cruisingProfile.create({
      data: {
        userId: ana.id,
        birthYear: 1990,
        termsVersion: app.get(AppConfigService).cruisingTermsVersion,
        acceptedAt: t,
        createdAt: t,
      },
    });

    // Revenue: two PRO teams (one not priced yet), a paid maintenance plan and an included one.
    const team = async (slug: string, status: string | null, amount: number | null) =>
      prisma.cloudTeam.create({
        data: {
          slug: `${slug}-${tag}`,
          name: slug,
          plan: status ? 'PRO' : 'FREE',
          subscriptionStatus: status,
          subscriptionAmountCents: amount,
        },
      });
    const proTeam = await team('pro', 'active', 900);
    await team('unpriced', 'past_due', null);
    await team('ended', 'canceled', 900);
    await prisma.cloudMember.create({
      data: {
        teamId: proTeam.id,
        userId: bea.id,
        role: 'OWNER',
        termsVersion: 'test',
        termsAcceptedAt: t,
        createdAt: t,
      },
    });
    await prisma.clientProject.createMany({
      data: [
        {
          clientId: client.id,
          name: `Paid plan ${tag}`,
          maintenanceStatus: 'ACTIVE',
          maintenanceSubscriptionId: `sub_${tag}`,
          maintenanceAmountCents: 1900,
        },
        {
          clientId: client.id,
          name: `Included plan ${tag}`,
          maintenanceIncludedReason: 'Incluido en el proyecto a medida',
          maintenanceIncludedAt: t,
        },
      ],
    });
    const lead = await prisma.lead.create({
      data: { name: 'Buyer', email: email('lead'), message: 'Hello', createdAt: t },
    });
    await prisma.sitePurchase.createMany({
      data: [
        {
          leadId: lead.id,
          stripeSessionId: `cs_paid_${tag}`,
          amountCents: 39_930,
          currency: 'eur',
          status: 'PAID',
          paidAt: t,
        },
        {
          leadId: lead.id,
          stripeSessionId: `cs_expired_${tag}`,
          amountCents: 39_930,
          currency: 'eur',
          status: 'EXPIRED',
          createdAt: t,
        },
      ],
    });

    // Activity: a request opened and resolved that week, a confirmed sign-up.
    await prisma.supportTicket.create({
      data: {
        clientId: client.id,
        type: 'QUESTION',
        title: `Overview ${tag}`,
        status: 'RESOLVED',
        resolvedAt: t,
        createdAt: t,
      },
    });
    await prisma.newsletterSubscriber.create({
      data: {
        email: email('reader'),
        locale: 'EN',
        status: 'ACTIVE',
        unsubscribeToken: randomUUID(),
        confirmedAt: t,
      },
    });

    // Health: an open error and an open CSP report group.
    await prisma.errorGroup.createMany({
      data: [
        {
          fingerprint: createHash('sha256').update(`api${tag}`).digest('hex'),
          source: 'API',
          message: `Boom ${tag}`,
        },
        {
          fingerprint: createHash('sha256').update(`csp${tag}`).digest('hex'),
          source: 'CSP',
          message: `script-src blocked ${tag}`,
        },
      ],
    });

    // Cached: the same answer until the 10 minutes pass.
    const cached = await get();
    expect(cached.generatedAt).toBe(before.generatedAt);
    expect(weekOf(cached, weekStart)).toEqual(base);

    service.clearCache();
    const after = await get();
    const week = weekOf(after, weekStart);
    expect(week.accounts.new - base.accounts.new).toBe(3);
    expect(week.accounts.active - base.accounts.active).toBe(2);
    expect(week.apps.cruising - base.apps.cruising).toBe(1);
    expect(week.apps.cloud - base.apps.cloud).toBe(1);
    expect(week.apps.portal - base.apps.portal).toBe(1);
    expect(week.purchases.count - base.purchases.count).toBe(1);
    expect(week.purchases.amountCents - base.purchases.amountCents).toBe(39_930);
    expect(week.leads - base.leads).toBe(1);
    expect(week.support.opened - base.support.opened).toBe(1);
    expect(week.support.closed - base.support.closed).toBe(1);
    expect(week.newsletter - base.newsletter).toBe(1);

    const people = after.people;
    // Ana, Bea, the client, Nosy (from the first test) are people; the admins aren't.
    expect(people.accounts - before.people.accounts).toBe(3);
    expect(people.apps.cruising - before.people.apps.cruising).toBe(1);
    expect(people.apps.cloud - before.people.apps.cloud).toBe(1);
    expect(people.apps.portal - before.people.apps.portal).toBe(1);

    const revenue = after.revenue;
    expect(revenue.cloudPro.active - before.revenue.cloudPro.active).toBe(2);
    expect(revenue.cloudPro.unpriced - before.revenue.cloudPro.unpriced).toBe(1);
    expect(revenue.cloudPro.mrrCents - before.revenue.cloudPro.mrrCents).toBe(900);
    expect(revenue.maintenance.paid - before.revenue.maintenance.paid).toBe(1);
    expect(revenue.maintenance.included - before.revenue.maintenance.included).toBe(1);
    expect(revenue.maintenance.mrrCents - before.revenue.maintenance.mrrCents).toBe(1900);
    expect(revenue.mrrCents).toBe(revenue.cloudPro.mrrCents + revenue.maintenance.mrrCents);

    expect(after.activity.newsletterActive - before.activity.newsletterActive).toBe(1);
    expect(after.health.errors.open - before.health.errors.open).toBe(1);
    expect(after.health.errors.cspOpen - before.health.errors.cspOpen).toBe(1);
  });

  it("counts portal clients by the dashboard's own rule (decision 29)", async () => {
    service.clearCache();
    const overview = await get();
    // Codeqlick's own accounts; Neoqlick's are counted apart (architecture 4.18).
    const clients = await prisma.user.count({
      where: { AND: [CLIENT_WHERE, { isActive: true }], realm: 'CODEQLICK' },
    });
    expect(overview.people.apps.portal).toBe(clients);
    const people = await prisma.user.count({ where: { role: Role.CLIENT, realm: 'CODEQLICK' } });
    expect(overview.people.accounts).toBe(people);
    const neoqlick = await prisma.user.count({ where: { role: Role.CLIENT, realm: 'NEOQLICK' } });
    expect(overview.people.neoqlickAccounts).toBe(neoqlick);
  });
});
