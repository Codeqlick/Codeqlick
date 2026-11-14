import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// The site a monitor checks: what it answers is up to the test (real fetching refuses local
// addresses, decision 38). The URL check stays the real one.
const site = vi.hoisted(() => ({ status: 200 as number | 'error', body: '' }));
// What the project's notification channels are sent (decision 64), instead of the internet.
const posts = vi.hoisted(
  () => [] as Array<{ url: string; body: string; headers: Record<string, string> }>,
);
const hook = vi.hoisted(() => ({ status: 200 }));
vi.mock('../src/modules/site-audits/safe-fetch.js', async (original) => {
  const actual = await original<typeof import('../src/modules/site-audits/safe-fetch.js')>();
  return {
    ...actual,
    safeFetch: vi.fn((url: string) =>
      site.status === 'error'
        ? Promise.reject(new Error('connect ECONNREFUSED'))
        : Promise.resolve({
            url,
            status: site.status,
            headers: {},
            body: site.body,
            bytes: Buffer.byteLength(site.body),
            truncated: false,
            ttfbMs: 20,
            redirects: [],
            certificateValidTo: new Date(Date.now() + 5 * 86_400_000),
          }),
    ),
    safePost: vi.fn((url: string, body: string, headers: Record<string, string>) => {
      posts.push({ url, body, headers });
      return Promise.resolve({ status: hook.status, body: '' });
    }),
  };
});

const { AppModule } = await import('../src/app.module.js');
const { configureApp } = await import('../src/app.setup.js');
const { Role } = await import('../src/generated/prisma/client.js');
const { CLOUD_TERMS_VERSION } = await import('../src/modules/cloud/cloud-plans.js');
const { CloudMonitorsService } = await import('../src/modules/cloud/cloud-monitors.service.js');
const { MailService } = await import('../src/modules/mail/mail.service.js');
const { PrismaService } = await import('../src/prisma/prisma.service.js');

const tag = randomUUID().slice(0, 8);
const password = 'cloud-monitors-password-1';
const owner = { email: `e2e-cm-owner-${tag}@codeqlick.test`, password };
const MINUTE = 60_000;

describe('Codeqlick Cloud monitors and status pages (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: InstanceType<typeof PrismaService>;
  const sent: Array<{ to: string; subject: string }> = [];
  let ownerId = '';
  const team = `m-${tag}`;
  let auth: { Authorization: string } = { Authorization: '' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    vi.spyOn(app.get(MailService), 'send').mockImplementation((message) => {
      sent.push(message);
      return Promise.resolve();
    });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    ownerId = (
      await prisma.user.create({
        data: {
          email: owner.email,
          name: 'Ada',
          role: Role.CLIENT,
          passwordHash,
          registeredAt: new Date(),
        },
      })
    ).id;
    const server = app.getHttpServer();
    const login = await request(server).post('/v1/auth/login').send(owner).expect(200);
    auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
    await request(server)
      .post('/v1/cloud/teams')
      .set(auth)
      .send({ name: 'Ops', slug: team, acceptTerms: true, termsVersion: CLOUD_TERMS_VERSION })
      .expect(201);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cloudTeam.deleteMany({ where: { slug: { in: [`m-${tag}`, `k-${tag}`] } } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
  });

  it('checks URLs, takes heartbeats, alerts, and publishes a status page', async () => {
    const server = app.getHttpServer();
    const engine = app.get(CloudMonitorsService);

    // Unsafe addresses are refused at once.
    for (const url of [
      'http://127.0.0.1/',
      'http://example.com:8080/',
      'ftp://example.com/',
      'https://u:p@example.com/',
    ]) {
      await request(server)
        .post(`/v1/cloud/teams/${team}/monitors`)
        .set(auth)
        .send({ kind: 'HTTP', name: 'x', url, alertIds: [ownerId] })
        .expect(400);
    }
    const http = await request(server)
      .post(`/v1/cloud/teams/${team}/monitors`)
      .set(auth)
      .send({ kind: 'HTTP', name: 'Website', url: 'https://example.com/', alertIds: [ownerId] })
      .expect(201);
    expect(http.body).toMatchObject({ kind: 'HTTP', status: 'UNKNOWN', heartbeatUrl: null });

    // First check: UP (no email). Two failures: DOWN and an email. Back: UP and an email.
    const t0 = new Date();
    site.status = 200;
    await engine.tick(t0);
    let monitor = await prisma.cloudMonitor.findUniqueOrThrow({
      where: { id: http.body.id as string },
    });
    expect(monitor.status).toBe('UP');
    expect(monitor.certExpiresAt).not.toBeNull();
    // The certificate expires within 14 days: one warning.
    expect(sent.filter((m) => /certific/i.test(m.subject))).toHaveLength(1);
    site.status = 503;
    await engine.tick(new Date(t0.getTime() + 5 * MINUTE));
    expect(
      (await prisma.cloudMonitor.findUniqueOrThrow({ where: { id: monitor.id } })).status,
    ).toBe('UP');
    await engine.tick(new Date(t0.getTime() + 10 * MINUTE));
    monitor = await prisma.cloudMonitor.findUniqueOrThrow({ where: { id: monitor.id } });
    expect(monitor).toMatchObject({ status: 'DOWN', lastError: 'HTTP 503' });
    await vi.waitFor(() => expect(sent.some((m) => m.subject === 'Down: Website')).toBe(true));
    site.status = 200;
    await engine.tick(new Date(t0.getTime() + 15 * MINUTE));
    await vi.waitFor(() => expect(sent.some((m) => m.subject === 'Back up: Website')).toBe(true));
    // Not due yet: no new check.
    const before = await prisma.cloudMonitorCheck.count({ where: { monitorId: monitor.id } });
    await engine.tick(new Date(t0.getTime() + 16 * MINUTE));
    expect(await prisma.cloudMonitorCheck.count({ where: { monitorId: monitor.id } })).toBe(before);

    // Heartbeat: on time, then late, then a failure call.
    const beat = await request(server)
      .post(`/v1/cloud/teams/${team}/monitors`)
      .set(auth)
      .send({
        kind: 'HEARTBEAT',
        name: 'Backups',
        periodMinutes: 60,
        graceMinutes: 10,
        alertIds: [ownerId],
      })
      .expect(201);
    const pingUrl = new URL(beat.body.heartbeatUrl as string).pathname;
    await request(server).get(pingUrl).expect(200, { ok: true });
    expect(
      (await prisma.cloudMonitor.findUniqueOrThrow({ where: { id: beat.body.id as string } }))
        .status,
    ).toBe('UP');
    await engine.tick(new Date(Date.now() + 71 * MINUTE));
    expect(
      (await prisma.cloudMonitor.findUniqueOrThrow({ where: { id: beat.body.id as string } }))
        .status,
    ).toBe('DOWN');
    await request(server).post(pingUrl).send({}).expect(200);
    await request(server).post(`${pingUrl}?status=fail`).expect(200);
    const failed = await prisma.cloudMonitor.findUniqueOrThrow({
      where: { id: beat.body.id as string },
    });
    expect(failed).toMatchObject({ status: 'DOWN', lastError: 'The job reported a failure' });
    await request(server).get('/v1/cloud/heartbeats/cqh_aaaaaaaaaaaaaaaaaaaaaa').expect(404);

    const detail = await request(server)
      .get(`/v1/cloud/monitors/${http.body.id as string}`)
      .set(auth)
      .expect(200);
    expect(detail.body.days).toHaveLength(90);
    expect(detail.body.incidents.length).toBeGreaterThanOrEqual(1);

    // Pausing: PAUSED, and the engine leaves it alone.
    await request(server)
      .patch(`/v1/cloud/monitors/${http.body.id as string}`)
      .set(auth)
      .send({ enabled: false })
      .expect(200);
    expect(
      (await prisma.cloudMonitor.findUniqueOrThrow({ where: { id: monitor.id } })).status,
    ).toBe('PAUSED');

    // Status page: off → 404; on → JSON and a badge others can embed.
    await request(server).get(`/v1/cloud/status/${team}`).expect(404);
    await request(server)
      .put(`/v1/cloud/teams/${team}/status-page`)
      .set(auth)
      .send({
        enabled: true,
        title: 'Ops status',
        items: [
          { monitorId: http.body.id, label: 'Website' },
          { monitorId: beat.body.id, label: 'Nightly backups' },
        ],
      })
      .expect(200);
    const status = await request(server).get(`/v1/cloud/status/${team}`).expect(200);
    expect(status.body).toMatchObject({ title: 'Ops status', overall: 'major' });
    expect(status.body.monitors.map((m: { label: string }) => m.label)).toEqual([
      'Website',
      'Nightly backups',
    ]);
    expect(JSON.stringify(status.body)).not.toContain('example.com');
    const badge = await request(server).get(`/v1/cloud/status/${team}/badge.svg`).expect(200);
    expect(badge.headers['content-type']).toMatch(/image\/svg\+xml/);
    expect(badge.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('checks text on the page of HTTP monitors and refuses it on heartbeats', async () => {
    const server = app.getHttpServer();
    const engine = app.get(CloudMonitorsService);
    const login = await request(server).post('/v1/auth/login').send(owner).expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
    const team = `k-${tag}`;
    await request(server)
      .post('/v1/cloud/teams')
      .set(auth)
      .send({ name: 'Shop', slug: team, acceptTerms: true, termsVersion: CLOUD_TERMS_VERSION })
      .expect(201);
    const monitors = `/v1/cloud/teams/${team}/monitors`;

    // Heartbeats with text are refused. (Creating monitors is limited to 10 a minute, shared with
    // the test above, so invalid texts are tried on PATCH below.)
    const heartbeat = {
      kind: 'HEARTBEAT',
      name: 'Backups',
      periodMinutes: 60,
      graceMinutes: 10,
      alertIds: [ownerId],
    };
    await request(server)
      .post(monitors)
      .set(auth)
      .send({ ...heartbeat, keyword: 'done' })
      .expect(400);
    const beat = await request(server).post(monitors).set(auth).send(heartbeat).expect(201);
    expect(beat.body).toMatchObject({ keyword: null, keywordMode: 'CONTAINS' });
    await request(server)
      .patch(`/v1/cloud/monitors/${beat.body.id as string}`)
      .set(auth)
      .send({ keyword: 'done' })
      .expect(400);

    const created = await request(server)
      .post(monitors)
      .set(auth)
      .send({
        kind: 'HTTP',
        name: 'Shop',
        url: 'https://example.com/',
        keyword: ' Add to cart ',
        alertIds: [ownerId],
      })
      .expect(201);
    expect(created.body).toMatchObject({ keyword: 'Add to cart', keywordMode: 'CONTAINS' });
    const id = created.body.id as string;
    for (const keyword of ['', 'a'.repeat(101), 'two\nlines']) {
      await request(server)
        .patch(`/v1/cloud/monitors/${id}`)
        .set(auth)
        .send({ keyword })
        .expect(400);
    }
    const load = () =>
      prisma.cloudMonitor.findUniqueOrThrow({
        where: { id },
        include: { team: { select: { slug: true, name: true } } },
      });

    // The text is there: UP. Missing twice in a row: DOWN with the reason.
    const t0 = new Date();
    site.status = 200;
    site.body = '<button>Add to cart</button>';
    await engine.checkHttp(await load(), t0);
    expect((await load()).status).toBe('UP');
    site.body = '<p>Out of stock</p>';
    await engine.checkHttp(await load(), new Date(t0.getTime() + 5 * MINUTE));
    expect(await load()).toMatchObject({ status: 'UP', failures: 1 });
    await engine.checkHttp(await load(), new Date(t0.getTime() + 10 * MINUTE));
    expect(await load()).toMatchObject({
      status: 'DOWN',
      lastError: "The page doesn't contain «Add to cart»",
    });
    const checks = await prisma.cloudMonitorCheck.findMany({
      where: { monitorId: id },
      orderBy: { checkedAt: 'desc' },
    });
    expect(checks[0]).toMatchObject({ ok: false, statusCode: 200 });

    // Switching the mode resets the count; "must not contain" now holds.
    const patched = await request(server)
      .patch(`/v1/cloud/monitors/${id}`)
      .set(auth)
      .send({ keyword: 'Out of stock', keywordMode: 'NOT_CONTAINS' })
      .expect(200);
    expect(patched.body).toMatchObject({ keyword: 'Out of stock', keywordMode: 'NOT_CONTAINS' });
    expect((await load()).failures).toBe(0);
    site.body = '<button>Add to cart</button>';
    await engine.checkHttp(await load(), new Date(t0.getTime() + 15 * MINUTE));
    expect((await load()).status).toBe('UP');

    // null switches the check off.
    const cleared = await request(server)
      .patch(`/v1/cloud/monitors/${id}`)
      .set(auth)
      .send({ keyword: null })
      .expect(200);
    expect(cleared.body.keyword).toBeNull();
    const detail = await request(server).get(`/v1/cloud/monitors/${id}`).set(auth).expect(200);
    expect(detail.body).toMatchObject({ keyword: null, keywordMode: 'NOT_CONTAINS' });
  });

  // Keeps the whole file under the create limit (10 monitors a minute): the first test makes 6.
  it("alerts the project's Slack, Discord and webhook channels that asked (decision 64)", async () => {
    const server = app.getHttpServer();
    const engine = app.get(CloudMonitorsService);
    const project = await request(server)
      .post(`/v1/cloud/teams/${team}/projects`)
      .set(auth)
      .send({ name: 'Web', slug: `mp-${tag}` })
      .expect(201);
    const projectId = project.body.id as string;
    const notifications = `/v1/cloud/projects/${projectId}/notifications`;

    // Email channels can't take monitor alerts: monitors email their own people.
    await request(server)
      .post(notifications)
      .set(auth)
      .send({ kind: 'EMAIL', name: 'Team', recipientIds: [ownerId], monitorAlerts: true })
      .expect(400);
    const email = await request(server)
      .post(notifications)
      .set(auth)
      .send({ kind: 'EMAIL', name: 'Team', recipientIds: [ownerId] })
      .expect(201);
    expect(email.body.monitorAlerts).toBe(false);
    await request(server)
      .patch(`${notifications}/${email.body.id as string}`)
      .set(auth)
      .send({ monitorAlerts: true })
      .expect(400);
    const hookChannel = await request(server)
      .post(notifications)
      .set(auth)
      .send({
        kind: 'WEBHOOK',
        name: 'Ops',
        url: 'https://hooks.example.com/monitors/aaaa',
        monitorAlerts: true,
      })
      .expect(201);
    expect(hookChannel.body.monitorAlerts).toBe(true);
    const secret = hookChannel.body.secret as string;
    await request(server)
      .post(notifications)
      .set(auth)
      .send({ kind: 'WEBHOOK', name: 'Builds', url: 'https://hooks.example.com/builds/bbbb' })
      .expect(201);

    const api = await request(server)
      .post(`/v1/cloud/teams/${team}/monitors`)
      .set(auth)
      .send({
        kind: 'HTTP',
        name: 'API',
        url: 'https://api.example.com/',
        projectId,
        alertIds: [ownerId],
      })
      .expect(201);
    const monitorId = api.body.id as string;
    const received = (event: string) =>
      posts
        .filter((p) => p.headers['X-Codeqlick-Event'] === event)
        .map((p) => ({ ...p, json: JSON.parse(p.body) as Record<string, unknown> }));

    // First check: UP, no alert, but the certificate (5 days left) warns.
    const t1 = new Date();
    site.status = 200;
    await engine.tick(t1);
    await vi.waitFor(() => expect(received('monitor.cert')).toHaveLength(1));
    expect(received('monitor.cert')[0]!.json).toMatchObject({
      monitor: { id: monitorId, kind: 'HTTP', url: 'https://api.example.com/' },
      error: null,
      downMinutes: null,
    });
    expect(received('monitor.cert')[0]!.json.certExpiresAt).toEqual(expect.any(String));

    // Two failures: DOWN, the email and one signed post to the channel that asked.
    site.status = 503;
    await engine.tick(new Date(t1.getTime() + 5 * MINUTE));
    await engine.tick(new Date(t1.getTime() + 10 * MINUTE));
    await vi.waitFor(() => expect(received('monitor.down')).toHaveLength(1));
    const down = received('monitor.down')[0]!;
    expect(down.url).toBe('https://hooks.example.com/monitors/aaaa');
    expect(down.headers['X-Codeqlick-Signature']).toBe(
      `sha256=${createHmac('sha256', secret).update(down.body).digest('hex')}`,
    );
    expect(down.json).toMatchObject({
      event: 'monitor.down',
      project: { slug: `mp-${tag}`, name: 'Web' },
      monitor: { id: monitorId, name: 'API', kind: 'HTTP', url: 'https://api.example.com/' },
      error: 'HTTP 503',
      downMinutes: null,
      certExpiresAt: null,
    });
    expect(down.json.consoleUrl).toMatch(new RegExp(`/en/console/${team}/monitors/${monitorId}$`));
    await vi.waitFor(() => expect(sent.some((m) => m.subject === 'Down: API')).toBe(true));

    // Back up after 5 minutes; the channel records the delivery.
    const channelRow = () =>
      prisma.cloudNotifyChannel.findUniqueOrThrow({ where: { id: hookChannel.body.id as string } });
    const beforeUp = new Date();
    site.status = 200;
    await engine.tick(new Date(t1.getTime() + 15 * MINUTE));
    await vi.waitFor(async () => {
      const row = await channelRow();
      expect(row.lastSentAt?.getTime() ?? 0).toBeGreaterThanOrEqual(beforeUp.getTime());
      expect(row).toMatchObject({ lastOk: true, failures: 0 });
    });
    expect(received('monitor.up')).toHaveLength(1);
    expect(received('monitor.up')[0]!.json).toMatchObject({ downMinutes: 5, error: null });
    // Nothing ever went to the channel without monitor alerts.
    expect(posts.every((p) => p.url === 'https://hooks.example.com/monitors/aaaa')).toBe(true);

    // Down again 15 minutes after the last down alert, and the webhook answers 500: a failure.
    hook.status = 500;
    site.status = 503;
    await engine.tick(new Date(t1.getTime() + 20 * MINUTE));
    await engine.tick(new Date(t1.getTime() + 25 * MINUTE));
    await vi.waitFor(async () =>
      expect(await channelRow()).toMatchObject({ lastOk: false, failures: 1, enabled: true }),
    );
    expect((await channelRow()).lastError).toMatch(/^HTTP 500/);
    expect(received('monitor.down')).toHaveLength(2);
    hook.status = 200;

    // A monitor without a project keeps email only.
    const before = posts.length;
    const beat = await request(server)
      .post(`/v1/cloud/teams/${team}/monitors`)
      .set(auth)
      .send({
        kind: 'HEARTBEAT',
        name: 'Nightly',
        periodMinutes: 60,
        graceMinutes: 10,
        alertIds: [ownerId],
      })
      .expect(201);
    await request(server)
      .get(`${new URL(beat.body.heartbeatUrl as string).pathname}?status=fail`)
      .expect(200);
    await vi.waitFor(() => expect(sent.some((m) => m.subject === 'Down: Nightly')).toBe(true));
    expect(posts).toHaveLength(before);
  });
});
