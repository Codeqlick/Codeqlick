import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Role } from '../src/generated/prisma/client.js';
import { CLOUD_TERMS_VERSION } from '../src/modules/cloud/cloud-plans.js';
import { CloudAuditsService } from '../src/modules/cloud/cloud-audits.service.js';
import { nextProductionCheck } from '../src/modules/cloud/cloud-production-checks.js';
import { CloudProductionChecksService } from '../src/modules/cloud/cloud-production-checks.service.js';
import { MailService } from '../src/modules/mail/mail.service.js';
import type { AuditInputs } from '../src/modules/site-audits/site-audit-checks.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const tag = randomUUID().slice(0, 8);
const password = 'cloud-audits-password-1';
const owner = { email: `e2e-ca-owner-${tag}@codeqlick.test`, password };
const member = { email: `e2e-ca-member-${tag}@codeqlick.test`, password };

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

/** A page with nothing a search engine or a phone wants: far below a full score. */
const barePage: AuditInputs = {
  ...page,
  page: {
    url: 'https://shop.example/',
    status: 200,
    headers: {},
    body: '<!doctype html><html><head></head><body></body></html>',
    bytes: 2_000,
    ttfbMs: 3_000,
  } as AuditInputs['page'],
};

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
    await prisma.user.create({
      data: {
        email: member.email,
        name: 'Grace',
        role: Role.CLIENT,
        passwordHash,
        registeredAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cloudTeam.deleteMany({ where: { slug: { in: [`a-${tag}`, `ap-${tag}`] } } });
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
    expect(list.body.items[0].kind).toBe('manual');
    expect(list.body.items[0]).not.toHaveProperty('preview');
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

  it('checks production every week, lists the history and alerts when the score drops', async () => {
    const server = app.getHttpServer();
    const audits = app.get(CloudAuditsService);
    const weekly = app.get(CloudProductionChecksService);
    const bearer = async (user: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`,
    });
    const auth = await bearer(owner);
    // Signed in before any request is built: a request made while another one is being built
    // closes the server that one is about to use.
    const memberAuth = await bearer(member);
    const team = `ap-${tag}`;
    const created = await request(server)
      .post('/v1/cloud/teams')
      .set(auth)
      .send({ name: 'Weekly', slug: team, acceptTerms: true, termsVersion: CLOUD_TERMS_VERSION })
      .expect(201);
    const teamId = created.body.id as string;
    const memberRow = await prisma.user.findUniqueOrThrow({ where: { email: member.email } });
    await prisma.cloudMember.create({
      data: {
        teamId,
        userId: memberRow.id,
        role: 'MEMBER',
        termsVersion: CLOUD_TERMS_VERSION,
        termsAcceptedAt: new Date(),
      },
    });
    const project = await request(server)
      .post(`/v1/cloud/teams/${team}/projects`)
      .set(auth)
      .send({ name: 'Shop', slug: `apw-${tag}` })
      .expect(201);
    const id = project.body.id as string;
    const url = `/v1/cloud/projects/${id}`;
    const reader = await request(server)
      .post('/v1/cloud/tokens')
      .set(auth)
      .send({ name: 'Reader', teamSlug: team, expiresInDays: null, readOnly: true })
      .expect(201);

    // ── The setting: admins only, never with a read-only token, at least one field.
    await request(server).patch(url).set(auth).send({}).expect(400);
    await request(server)
      .patch(url)
      .set({ Authorization: `Bearer ${reader.body.token as string}` })
      .send({ productionChecks: true })
      .expect(403);
    await request(server).patch(url).set(memberAuth).send({ productionChecks: true }).expect(403);
    expect((await prisma.cloudProject.findUniqueOrThrow({ where: { id } })).productionChecks).toBe(
      false,
    );

    const enabled = await request(server)
      .patch(url)
      .set(auth)
      .send({ productionChecks: true })
      .expect(200);
    expect(enabled.body.productionChecks).toBe(true);
    const on = await prisma.cloudProject.findUniqueOrThrow({ where: { id } });
    expect(on.productionChecks).toBe(true);
    expect(on.productionCheckNextAt!.getTime()).toBe(nextProductionCheck(id, new Date()).getTime());
    await request(server).patch(url).set(auth).send({ productionChecks: true }).expect(200);
    const events = (action: string) =>
      prisma.cloudEvent.count({ where: { teamId, action, targetLabel: `apw-${tag}` } });
    expect(await events('project.production_checks_enabled')).toBe(1);

    // Any member, even a read-only token, reads it; the rename keeps working.
    const empty = await request(server)
      .get(`${url}/production-checks`)
      .set({ Authorization: `Bearer ${reader.body.token as string}` })
      .expect(200);
    expect(empty.body).toMatchObject({ enabled: true, items: [] });
    expect(empty.body.nextAt).toBe(on.productionCheckNextAt!.toISOString());
    expect(empty.body.url).toMatch(new RegExp(`^https://apw-${tag}\\.`));
    await request(server).get(`${url}/production-checks`).set(memberAuth).expect(200);
    const renamed = await request(server).patch(url).set(auth).send({ name: 'Store' }).expect(200);
    expect(renamed.body.name).toBe('Store');
    expect(await events('project.production_checks_enabled')).toBe(1);

    // ── A due week: skipped without production, then run and compared with the last one.
    const sent = vi.spyOn(app.get(MailService), 'send');
    const makeDue = () =>
      prisma.cloudProject.update({
        where: { id },
        data: { productionCheckNextAt: new Date(Date.now() - 60_000) },
      });
    const scheduled = () =>
      prisma.cloudAudit.findMany({ where: { projectId: id, kind: 'SCHEDULED' } });
    audits.gatherInputs = () => Promise.resolve(barePage);
    await makeDue();
    await weekly.runScheduled();
    expect(await scheduled()).toHaveLength(0);
    const moved = await prisma.cloudProject.findUniqueOrThrow({ where: { id } });
    expect(moved.productionCheckNextAt!.getTime()).toBeGreaterThan(Date.now());

    const deployment = await prisma.cloudDeployment.create({
      data: {
        projectId: id,
        shortId: 'abcd1234',
        target: 'PRODUCTION',
        sizeBytes: 1n,
        fileCount: 1,
      },
    });
    await prisma.cloudProject.update({
      where: { id },
      data: { productionDeploymentId: deployment.id },
    });
    // The previous week scored 100, in every category.
    const full = { speed: 100, mobile: 100, seo: 100, security: 100 };
    const lastWeek = await prisma.cloudAudit.create({
      data: {
        teamId,
        projectId: id,
        kind: 'SCHEDULED',
        url: 'https://shop.example/',
        score: 100,
        result: { finalUrl: 'https://shop.example/', categories: full, checks: [] },
        createdAt: new Date(Date.now() - 7 * 86_400_000),
      },
    });
    await makeDue();
    await weekly.runScheduled();
    const rows = await scheduled();
    expect(rows).toHaveLength(2);
    const fresh = rows.find((row) => row.id !== lastWeek.id)!;
    expect(fresh).toMatchObject({ teamId, userId: null, kind: 'SCHEDULED', projectId: id });
    expect(fresh.url).toMatch(new RegExp(`^https://apw-${tag}\\.`));
    expect(fresh.score).toBeLessThan(90);
    expect(await prisma.cloudEvent.count({ where: { teamId, action: 'audit.run' } })).toBe(0);
    const dropEmails = sent.mock.calls.filter(([message]) =>
      message.subject.startsWith('Website score dropped'),
    );
    expect(dropEmails.map(([message]) => message.to)).toEqual([owner.email]);

    // The list says where each audit came from; the history marks the week that dropped.
    await prisma.cloudAudit.create({
      data: {
        teamId,
        projectId: id,
        kind: 'PREVIEW',
        url: 'https://shop--abcd1234.example/',
        score: 80,
        result: {},
        createdAt: new Date(Date.now() - 20 * 86_400_000),
      },
    });
    const list = await request(server).get(`/v1/cloud/teams/${team}/audits`).set(auth).expect(200);
    expect(list.body.items.map((item: { kind: string }) => item.kind)).toEqual([
      'scheduled',
      'scheduled',
      'preview',
    ]);
    const history = await request(server).get(`${url}/production-checks`).set(auth).expect(200);
    // A preview check is never part of the weekly history.
    expect(history.body.items).toHaveLength(2);
    expect(history.body.items).toMatchObject([
      { id: fresh.id, score: fresh.score, dropped: true },
      { id: lastWeek.id, score: 100, dropped: false },
    ]);
    expect(Object.keys(history.body.items[0].categories).sort()).toEqual([
      'mobile',
      'security',
      'seo',
      'speed',
    ]);

    // ── Off clears the next run; scheduled audits live 90 days, the others 30.
    await request(server).patch(url).set(auth).send({ productionChecks: false }).expect(200);
    expect(
      (await prisma.cloudProject.findUniqueOrThrow({ where: { id } })).productionCheckNextAt,
    ).toBeNull();
    expect(await events('project.production_checks_disabled')).toBe(1);
    const off = await request(server).get(`${url}/production-checks`).set(auth).expect(200);
    expect(off.body).toMatchObject({ enabled: false, nextAt: null });
    expect(off.body.items).toHaveLength(2);

    const old = new Date(Date.now() - 31 * 86_400_000);
    await prisma.cloudAudit.updateMany({ where: { id: lastWeek.id }, data: { createdAt: old } });
    const manual = await prisma.cloudAudit.create({
      data: { teamId, url: 'https://shop.example/', score: 50, result: {}, createdAt: old },
    });
    await audits.cleanup();
    expect(await prisma.cloudAudit.findUnique({ where: { id: manual.id } })).toBeNull();
    expect(await prisma.cloudAudit.findUnique({ where: { id: lastWeek.id } })).not.toBeNull();
    await prisma.cloudAudit.updateMany({
      where: { id: lastWeek.id },
      data: { createdAt: new Date(Date.now() - 91 * 86_400_000) },
    });
    await audits.cleanup();
    expect(await prisma.cloudAudit.findUnique({ where: { id: lastWeek.id } })).toBeNull();
  });
});
