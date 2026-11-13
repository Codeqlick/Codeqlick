import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AppConfigService } from '../src/config/app-config.service.js';
import { Role } from '../src/generated/prisma/client.js';
import { CLOUD_TERMS_VERSION } from '../src/modules/cloud/cloud-plans.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'cloud-analytics-password-1';
const owner = { email: `e2e-ca-owner-${tag}@codeqlick.test`, password };
const terms = { acceptTerms: true, termsVersion: CLOUD_TERMS_VERSION };
const BROWSER =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

describe('Codeqlick Cloud analytics and key-value store (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let root: string;
  let auth: { Authorization: string };
  let projectId: string;
  const slug = `ap-${tag}`;
  const site = `https://${slug}.cloud.test`;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'cq-cloud-analytics-'));
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    vi.spyOn(app.get(AppConfigService), 'cloudHosting', 'get').mockReturnValue({
      domain: 'cloud.test',
      root,
    });
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
    const server = app.getHttpServer();
    const login = await request(server).post('/v1/auth/login').send(owner).expect(200);
    auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
    await request(server)
      .post('/v1/cloud/teams')
      .set(auth)
      .send({ name: 'Analytics', slug: `a-${tag}`, ...terms })
      .expect(201);
    projectId = (
      await request(server)
        .post(`/v1/cloud/teams/a-${tag}/projects`)
        .set(auth)
        .send({ name: 'Site', slug })
        .expect(201)
    ).body.id as string;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cloudTeam.deleteMany({ where: { slug: `a-${tag}` } });
      await prisma.cloudProject.deleteMany({ where: { slug } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
    if (root) await rm(root, { recursive: true, force: true });
  });

  const hit = (body: object, headers: Record<string, string> = {}) =>
    request(app.getHttpServer())
      .post('/v1/cloud/analytics/event')
      .set('Content-Type', 'text/plain')
      .set('User-Agent', BROWSER)
      .set(headers)
      .send(JSON.stringify(body));

  it('serves the tracker and counts visits only for projects that switched it on', async () => {
    const server = app.getHttpServer();
    const script = await request(server).get('/v1/cloud/analytics/script.js').expect(200);
    expect(script.headers['content-type']).toMatch(/javascript/);
    expect(script.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(script.text).toContain('/cloud/analytics/event');

    // Off by default: answered, not kept.
    await hit({ u: `${site}/` }, { Origin: site }).expect(202);
    expect(await prisma.cloudAnalyticsEvent.count({ where: { projectId } })).toBe(0);

    const base = `/v1/cloud/projects/${projectId}/analytics`;
    const on = await request(server).patch(base).set(auth).send({ enabled: true }).expect(200);
    expect(on.body.enabled).toBe(true);
    expect(on.body.snippet).toContain('/cloud/analytics/script.js');

    await hit(
      { u: `${site}/?utm_source=Newsletter`, r: 'https://www.google.com/', w: 1440 },
      { Origin: site },
    ).expect(202);
    await hit({ u: `${site}/pricing`, r: `${site}/`, w: 1440 }, { Origin: site }).expect(202);
    await hit({ n: 'signup', u: `${site}/pricing`, w: 1440 }, { Origin: site }).expect(202);
    // A deployment's address counts too.
    await hit({ u: `https://${slug}--a1b2c3d4.cloud.test/` }).expect(202);
    // Dropped: another site's origin, a bot, a malformed body, another host.
    await hit({ u: `${site}/` }, { Origin: 'https://evil.example' }).expect(202);
    await hit({ u: `${site}/` }, { 'User-Agent': 'curl/8.4.0' }).expect(202);
    await hit({ u: 'not a url' }).expect(202);
    await hit({ u: 'https://unknown-project.cloud.test/' }).expect(202);
    expect(await prisma.cloudAnalyticsEvent.count({ where: { projectId } })).toBe(4);
    const kept = await prisma.cloudAnalyticsEvent.findFirst({
      where: { projectId, campaign: { not: null } },
    });
    expect(kept).toMatchObject({
      name: 'pageview',
      path: '/',
      referrer: 'google.com',
      campaign: 'newsletter',
      browser: 'Chrome',
      os: 'macOS',
      device: 'desktop',
    });
    expect(kept?.visitor).toMatch(/^[0-9a-f]{32}$/);

    const report = await request(server).get(`${base}?period=24h`).set(auth).expect(200);
    expect(report.body).toMatchObject({
      enabled: true,
      period: '24h',
      totals: { visitors: 1, pageviews: 3 },
    });
    expect(report.body.series).toHaveLength(24);
    expect(report.body.series.at(-1).pageviews).toBe(3);
    expect(report.body.pages).toContainEqual({ key: '/', visitors: 1, count: 2 });
    expect(report.body.referrers).toEqual([{ key: 'newsletter', visitors: 1, count: 1 }]);
    expect(report.body.events).toEqual([{ key: 'signup', visitors: 1, count: 1 }]);
    expect(report.body.browsers[0].key).toBe('Chrome');
    await request(server).get(`${base}?period=7d`).set(auth).expect(200);
    await request(server).get(`${base}?period=2y`).set(auth).expect(400);
    await request(server).get(base).expect(401);
  });

  it('keeps JSON values with limits, increments atomically and reads public keys', async () => {
    const server = app.getHttpServer();
    const base = `/v1/cloud/projects/${projectId}/kv`;

    await request(server).get(`${base}/missing`).set(auth).expect(404);
    const put = await request(server)
      .put(`${base}/config:theme`)
      .set(auth)
      .send({ value: { dark: true, accent: '#D9177E' } })
      .expect(200);
    expect(put.body).toMatchObject({ key: 'config:theme', value: { dark: true }, expiresAt: null });
    expect(put.body.size).toBe(JSON.stringify({ dark: true, accent: '#D9177E' }).length);
    const got = await request(server).get(`${base}/config:theme`).set(auth).expect(200);
    expect(got.body.value).toEqual({ dark: true, accent: '#D9177E' });

    // Keys and values are checked.
    await request(server).put(`${base}/bad%20key`).set(auth).send({ value: 1 }).expect(400);
    await request(server)
      .put(`${base}/big`)
      .set(auth)
      .send({ value: 'x'.repeat(70_000) })
      .expect(413);

    // Counters.
    const first = await request(server).post(`${base}/visits/incr`).set(auth).send({}).expect(200);
    expect(first.body).toEqual({ key: 'visits', value: 1 });
    const second = await request(server)
      .post(`${base}/visits/incr`)
      .set(auth)
      .send({ by: 41 })
      .expect(200);
    expect(second.body.value).toBe(42);
    await request(server).post(`${base}/config:theme/incr`).set(auth).send({}).expect(409);

    // Expiry: an expired key reads as missing and starts again at 0.
    await request(server).put(`${base}/session`).set(auth).send({ value: 5, ttl: 60 }).expect(200);
    await prisma.cloudKvEntry.update({
      where: { projectId_key: { projectId, key: 'session' } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(server).get(`${base}/session`).set(auth).expect(404);
    const restarted = await request(server)
      .post(`${base}/session/incr`)
      .set(auth)
      .send({})
      .expect(200);
    expect(restarted.body.value).toBe(1);

    // Listing by prefix, with a cursor.
    await request(server).put(`${base}/config:lang`).set(auth).send({ value: 'es' }).expect(200);
    const page1 = await request(server).get(`${base}?prefix=config:&limit=1`).set(auth).expect(200);
    expect(page1.body.items.map((i: { key: string }) => i.key)).toEqual(['config:lang']);
    expect(page1.body.cursor).toBe('config:lang');
    expect(page1.body.usage).toMatchObject({ keys: 4, maxKeys: 1000 });
    const page2 = await request(server)
      .get(`${base}?prefix=config:&limit=1&cursor=config:lang`)
      .set(auth)
      .expect(200);
    expect(page2.body.items.map((i: { key: string }) => i.key)).toEqual(['config:theme']);
    expect(page2.body.cursor).toBeNull();

    // Public keys only, to anyone, with CORS.
    await request(server).put(`${base}/public:flags`).set(auth).send({ beta: true }).expect(400);
    await request(server)
      .put(`${base}/public:flags`)
      .set(auth)
      .send({ value: { beta: true } })
      .expect(200);
    const open = await request(server)
      .get(`/v1/cloud/kv/${slug}/public:flags`)
      .set('Origin', site)
      .expect(200);
    expect(open.body).toEqual({ beta: true });
    expect(open.headers['access-control-allow-origin']).toBe(site);
    expect(open.headers['cache-control']).toBe('public, max-age=10');
    await request(server).get(`/v1/cloud/kv/${slug}/config:theme`).expect(404);
    await request(server).get(`/v1/cloud/kv/no-such-project/public:flags`).expect(404);

    await request(server).delete(`${base}/public:flags`).set(auth).expect(204);
    await request(server).delete(`${base}/public:flags`).set(auth).expect(404);
    await request(server).get(base).expect(401);
  });
});
