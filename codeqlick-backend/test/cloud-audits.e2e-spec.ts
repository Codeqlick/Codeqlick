import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Role } from '../src/generated/prisma/client.js';
import { CLOUD_TERMS_VERSION } from '../src/modules/cloud/cloud-plans.js';
import { CloudAuditsService } from '../src/modules/cloud/cloud-audits.service.js';
import type { AuditInputs } from '../src/modules/site-audits/site-audit-checks.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const tag = randomUUID().slice(0, 8);
const password = 'cloud-audits-password-1';
const owner = { email: `e2e-ca-owner-${tag}@codeqlick.test`, password };

/** A page with a few problems (no description, no canonical, no HSTS). */
const page: AuditInputs = {
  page: {
    url: 'https://shop.example/',
    status: 200,
    headers: { 'content-encoding': 'gzip', 'x-content-type-options': 'nosniff' },
    body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>The shop of examples</title></head><body><h1>Shop</h1></body></html>',
    bytes: 2_000,
    ttfbMs: 150,
  } as AuditInputs['page'],
  certificate: { validTo: new Date(Date.now() + 90 * 86_400_000), error: null },
  httpVersion: 'https',
  robotsTxt: null,
  sitemapFound: false,
  pageSpeed: null,
  now: new Date(),
} as AuditInputs;

describe('Codeqlick Cloud website check API (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.create({
      data: {
        email: owner.email,
        name: 'Ada',
        role: Role.CLIENT,
        passwordHash,
        registeredAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cloudTeam.deleteMany({ where: { slug: `a-${tag}` } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
  });

  it('runs a check with a token, keeps it 30 days, and says why it could not open a site', async () => {
    const server = app.getHttpServer();
    const audits = app.get(CloudAuditsService);
    const login = await request(server).post('/v1/auth/login').send(owner).expect(200);
    const session = { Authorization: `Bearer ${login.body.accessToken as string}` };
    const team = `a-${tag}`;
    await request(server)
      .post('/v1/cloud/teams')
      .set(session)
      .send({ name: 'Audits', slug: team, acceptTerms: true, termsVersion: CLOUD_TERMS_VERSION })
      .expect(201);
    const token = await request(server)
      .post('/v1/cloud/tokens')
      .set(session)
      .send({ name: 'CI', teamSlug: team, expiresInDays: 30 })
      .expect(201);
    const auth = { Authorization: `Bearer ${token.body.token as string}` };

    await request(server)
      .post('/v1/cloud/audits')
      .set(auth)
      .send({ url: 'http://10.0.0.1/', teamSlug: team })
      .expect(400);

    audits.gatherInputs = () => Promise.resolve(page);
    const report = await request(server)
      .post('/v1/cloud/audits')
      .set(auth)
      .send({ url: 'https://shop.example/', teamSlug: team, locale: 'es' })
      .expect(200);
    expect(report.body).toMatchObject({
      url: 'https://shop.example/',
      finalUrl: 'https://shop.example/',
    });
    expect(report.body.score).toBeGreaterThan(0);
    expect(report.body.score).toBeLessThan(100);
    expect(report.body.categories.map((c: { key: string }) => c.key)).toEqual([
      'speed',
      'mobile',
      'seo',
      'security',
    ]);
    const failing = report.body.categories
      .flatMap((c: { checks: Array<{ status: string; title: string }> }) => c.checks)
      .filter((c: { status: string }) => c.status === 'fail');
    expect(failing.length).toBeGreaterThan(0);
    expect(failing[0].title).toBeTruthy();

    audits.gatherInputs = () => Promise.reject(new Error('getaddrinfo ENOTFOUND nowhere.example'));
    const failed = await request(server)
      .post('/v1/cloud/audits')
      .set(auth)
      .send({ url: 'https://nowhere.example/', teamSlug: team, locale: 'en' })
      .expect(422);
    expect(failed.body.detail).toMatch(/domain/i);

    const list = await request(server).get(`/v1/cloud/teams/${team}/audits`).set(auth).expect(200);
    expect(list.body.items).toHaveLength(1);
    const again = await request(server)
      .get(`/v1/cloud/audits/${report.body.id as string}?locale=en`)
      .set(auth)
      .expect(200);
    expect(again.body.score).toBe(report.body.score);

    await prisma.cloudAudit.updateMany({
      where: { id: report.body.id as string },
      data: { createdAt: new Date(Date.now() - 31 * 86_400_000) },
    });
    await audits.cleanup();
    await request(server)
      .get(`/v1/cloud/audits/${report.body.id as string}`)
      .set(auth)
      .expect(404);
  });
});
