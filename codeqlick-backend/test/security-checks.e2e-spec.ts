import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Locale, Role } from '../src/generated/prisma/client.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import type { SecurityInputs } from '../src/modules/security-checks/security-check-inputs.js';
import { SecurityChecksService } from '../src/modules/security-checks/security-checks.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// POST /security-checks is limited to 3 per minute and per IP: every request here says which
// "client" it comes from. The background runner is off in tests; runs are started by hand, with
// what the network would have answered.
const tag = randomUUID().slice(0, 8);
const password = 'security-pass-1234';
const admin = { email: `e2e-sec-admin-${tag}@codeqlick.test`, password };
const client = { email: `e2e-sec-client-${tag}@codeqlick.test`, password };
const visitor = `e2e-sec-visitor-${tag}@codeqlick.test`;
const domain = `acme-${tag}.com`;
const body = (over: Record<string, unknown> = {}) => ({
  domain,
  email: visitor,
  name: 'Ana',
  locale: 'es',
  acceptPrivacy: true,
  ...over,
});

function inputs(host: string): SecurityInputs {
  return {
    domain: host,
    now: new Date(),
    web: {
      page: {
        url: `https://${host}/`,
        status: 200,
        headers: { server: 'Apache/2.4.1' },
        body: '<html><img src="http://cdn.test/a.png"></html>',
      },
      certificateFailed: false,
      http: { finalUrl: `https://${host}/`, firstRedirect: `https://${host}/`, status: 200 },
      tls: {
        version: 'TLSv1.2',
        cipher: 'ECDHE-RSA-AES128-GCM-SHA256',
        authorized: true,
        authError: null,
        validTo: new Date(Date.now() + 90 * 86_400_000),
        issuer: "Let's Encrypt",
        tls10: false,
        tls11: false,
      },
      securityTxt: null,
    },
    dns: {
      mx: [],
      txt: [],
      spf: { records: [], lookups: 0, redirectRecord: null },
      dmarc: [],
      dkim: [],
      caa: [],
      ns: [],
      mtaSts: { txt: [], policy: null },
      tlsRpt: [],
      dnssec: { ad: false, hasDs: false },
    },
    retire: null,
  };
}

describe('Security checks (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const sent: MailMessage[] = [];
  const server = () => app.getHttpServer();
  const post = (ip: string, payload: unknown) =>
    request(server())
      .post('/v1/security-checks')
      .set('X-Forwarded-For', ip)
      .send(payload as object);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    vi.spyOn(app.get(MailService), 'send').mockImplementation((message: MailMessage) => {
      sent.push(message);
      return Promise.resolve();
    });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.create({
      data: { email: admin.email, name: 'A', role: Role.ADMIN, passwordHash },
    });
    await prisma.user.create({
      data: { email: client.email, name: 'C', role: Role.CLIENT, passwordHash },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.securityCheck.deleteMany({ where: { email: { contains: `-${tag}@` } } });
      await prisma.lead.deleteMany({ where: { email: { contains: `-${tag}@` } } });
      await prisma.user.deleteMany({ where: { email: { in: [admin.email, client.email] } } });
    }
    await app?.close();
  });

  it('refuses addresses that cannot be checked, and a missing consent', async () => {
    for (const [index, value] of ['10.0.0.1', 'localhost', 'printer.local'].entries()) {
      const res = await post(`198.51.100.${index + 1}`, body({ domain: value })).expect(400);
      expect(JSON.stringify(res.body)).toContain('domain');
    }
    await post('198.51.100.9', body({ acceptPrivacy: false })).expect(400);
    await post('198.51.100.9', body({ email: 'nope' })).expect(400);
    await post('198.51.100.9', body({ extra: true })).expect(400);
  });

  it('stores a PENDING check (a URL is reduced to its host) and reports it', async () => {
    const res = await post(
      '198.51.100.20',
      body({ domain: `https://WWW.${domain}/about?x=1` }),
    ).expect(202);
    const id = res.body.id as string;
    const row = await prisma.securityCheck.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ domain: `www.${domain}`, status: 'PENDING', email: visitor });

    const report = await request(server()).get(`/v1/security-checks/${id}`).expect(200);
    expect(report.body).toMatchObject({
      id,
      domain: `www.${domain}`,
      status: 'PENDING',
      score: null,
      grade: null,
      groups: [],
    });
    expect(JSON.stringify(report.body)).not.toContain(visitor);
    await request(server()).get(`/v1/security-checks/${randomUUID()}`).expect(404);
    await request(server()).get('/v1/security-checks/not-a-uuid').expect(400);
    await request(server()).get(`/v1/security-checks/${id}?locale=fr`).expect(400);
  });

  it('returns the earlier check for the same email and domain within a day, case aside', async () => {
    const first = await post('198.51.100.30', body()).expect(202);
    const again = await post(
      '198.51.100.31',
      body({ domain: domain.toUpperCase(), email: visitor.toUpperCase() }),
    ).expect(202);
    expect(again.body.id).toBe(first.body.id);
    expect(await prisma.securityCheck.count({ where: { domain, email: visitor } })).toBe(1);
  });

  it('runs a check: grade, grouped findings in the language asked, lead, emails', async () => {
    const id = (await prisma.securityCheck.findFirstOrThrow({ where: { domain, email: visitor } }))
      .id;
    const service = app.get(SecurityChecksService);
    service.gather = (host) => Promise.resolve(inputs(host));
    service.fetchRetireJson = () => Promise.reject(new Error('no network in tests'));
    await service.run(id);

    const es = await request(server()).get(`/v1/security-checks/${id}?locale=es`).expect(200);
    expect(es.body).toMatchObject({ id, domain, status: 'DONE', failure: null });
    expect(typeof es.body.score).toBe('number');
    expect(typeof es.body.grade).toBe('string');
    expect(es.body.groups.map((group: { key: string }) => group.key)).toEqual([
      'https',
      'headers',
      'page',
      'dns-email',
      'security-txt',
    ]);
    const headers = es.body.groups[1].checks as Array<{
      id: string;
      status: string;
      title: string;
    }>;
    expect(headers.find((check) => check.id === 'csp-present')).toMatchObject({
      status: 'fail',
      title: 'Hay una Content-Security-Policy',
    });
    // Worst first.
    const order = ['fail', 'warn', 'info', 'pass'];
    const ranks = headers.map((check) => order.indexOf(check.status));
    expect(ranks).toEqual(ranks.toSorted((a, b) => a - b));
    const en = await request(server()).get(`/v1/security-checks/${id}`).expect(200);
    expect(
      en.body.groups[1].checks.find((check: { id: string }) => check.id === 'csp-present').title,
    ).toBe('A Content-Security-Policy is set');
    expect(JSON.stringify(en.body)).not.toContain(visitor);

    // A lead of type security, linked, and the emails.
    const row = await prisma.securityCheck.findUniqueOrThrow({ where: { id } });
    expect(row.leadId).not.toBeNull();
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: row.leadId! } });
    expect(lead).toMatchObject({ projectType: 'security', company: domain, email: visitor });
    expect(lead.message).toContain(`/es/security-check/${id}`);
    const toVisitor = sent.find((mail) => mail.to === visitor);
    expect(toVisitor?.subject).toContain('Revisión de seguridad');
    expect(toVisitor?.html).toContain('<');
    expect(
      sent.some((mail) => mail.to === 'hello@codeqlick.com' && mail.subject.includes(domain)),
    ).toBe(true);
  });

  it('refuses more than 5 checks a day per email and 10 a day per domain', async () => {
    const mine = `e2e-sec-heavy-${tag}@codeqlick.test`;
    await prisma.securityCheck.createMany({
      data: Array.from({ length: 5 }, (_, index) => ({
        domain: `bulk${index}-${tag}.com`,
        email: mine,
        locale: Locale.EN,
      })),
    });
    const byEmail = await post(
      '198.51.100.40',
      body({ email: mine, domain: `another-${tag}.com` }),
    );
    expect(byEmail.status).toBe(429);

    const crowded = `crowded-${tag}.com`;
    await prisma.securityCheck.createMany({
      data: Array.from({ length: 10 }, (_, index) => ({
        domain: crowded,
        email: `e2e-sec-crowd${index}-${tag}@codeqlick.test`,
        locale: Locale.EN,
      })),
    });
    const byDomain = await post('198.51.100.41', body({ domain: crowded }));
    expect(byDomain.status).toBe(429);
  });

  it('discards the honeypot without storing anything', async () => {
    const before = await prisma.securityCheck.count({ where: { email: visitor } });
    const res = await post(
      '198.51.100.50',
      body({ domain: `trap-${tag}.com`, website: 'x' }),
    ).expect(202);
    expect(typeof res.body.id).toBe('string');
    expect(await prisma.securityCheck.count({ where: { email: visitor } })).toBe(before);
  });

  it('is limited to 3 requests a minute per IP', async () => {
    const ip = '198.51.100.60';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await post(ip, body({ domain: 'nope' }))).status).toBe(400);
    }
    expect((await post(ip, body({ domain: 'nope' }))).status).toBe(429);
  });

  it('lists the checks for admins only, newest first, filtered by status', async () => {
    await request(server()).get('/v1/admin/security-checks').expect(401);
    const login = async (who: typeof admin) =>
      `Bearer ${
        (await request(server()).post('/v1/auth/login').send(who).expect(200)).body
          .accessToken as string
      }`;
    const clientAuth = { Authorization: await login(client) };
    await request(server()).get('/v1/admin/security-checks').set(clientAuth).expect(403);

    const auth = { Authorization: await login(admin) };
    const all = await request(server())
      .get('/v1/admin/security-checks?pageSize=100')
      .set(auth)
      .expect(200);
    expect(all.body).toMatchObject({ page: 1, pageSize: 100 });
    const mineRows = (all.body.items as Array<{ domain: string; email: string }>).filter(
      (item) => item.email === visitor,
    );
    expect(mineRows.length).toBeGreaterThan(0);
    const done = await request(server())
      .get('/v1/admin/security-checks?status=DONE&pageSize=100')
      .set(auth)
      .expect(200);
    const item = (done.body.items as Array<Record<string, unknown>>).find(
      (row) => row.domain === domain,
    )!;
    expect(item).toMatchObject({
      email: visitor,
      name: 'Ana',
      status: 'DONE',
      grade: expect.any(String),
      score: expect.any(Number),
      leadId: expect.any(String),
    });
    expect(
      (done.body.items as Array<{ status: string }>).every((row) => row.status === 'DONE'),
    ).toBe(true);
    await request(server()).get('/v1/admin/security-checks?status=nope').set(auth).expect(400);
  });
});
