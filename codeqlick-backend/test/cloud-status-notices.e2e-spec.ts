import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const { AppModule } = await import('../src/app.module.js');
const { configureApp } = await import('../src/app.setup.js');
const { Role } = await import('../src/generated/prisma/client.js');
const { CLOUD_TERMS_VERSION } = await import('../src/modules/cloud/cloud-plans.js');
const { CloudMonitorsService } = await import('../src/modules/cloud/cloud-monitors.service.js');
const { MailService } = await import('../src/modules/mail/mail.service.js');
const { PrismaService } = await import('../src/prisma/prisma.service.js');

const tag = randomUUID().slice(0, 8);
const password = 'cloud-notices-password-1';
const owner = { email: `e2e-cn-owner-${tag}@codeqlick.test`, password };
const member = { email: `e2e-cn-member-${tag}@codeqlick.test`, password };
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('Codeqlick Cloud status page notices (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: InstanceType<typeof PrismaService>;
  const sent: Array<{ to: string; subject: string }> = [];

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
    for (const [person, name] of [
      [owner, 'Ada'],
      [member, 'Grace'],
    ] as const) {
      await prisma.user.create({
        data: {
          email: person.email,
          name,
          role: Role.CLIENT,
          passwordHash,
          registeredAt: new Date(),
        },
      });
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cloudTeam.deleteMany({ where: { slug: { endsWith: `-${tag}` } } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
  });

  it('posts incidents and maintenance, and shows them on the status page', async () => {
    const server = app.getHttpServer();
    const engine = app.get(CloudMonitorsService);
    const login = async (person: { email: string; password: string }) => {
      const res = await request(server).post('/v1/auth/login').send(person).expect(200);
      return { Authorization: `Bearer ${res.body.accessToken as string}` };
    };
    const auth = await login(owner);
    const team = `n-${tag}`;
    const created = await request(server)
      .post('/v1/cloud/teams')
      .set(auth)
      .send({ name: 'Ops', slug: team, acceptTerms: true, termsVersion: CLOUD_TERMS_VERSION })
      .expect(201);
    const teamId = created.body.id as string;
    const ownerRow = await prisma.user.findUniqueOrThrow({ where: { email: owner.email } });
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
    const memberAuth = await login(member);

    // Two heartbeats on the page, and a monitor of another team.
    const beat = (name: string) =>
      request(server)
        .post(`/v1/cloud/teams/${team}/monitors`)
        .set(auth)
        .send({
          kind: 'HEARTBEAT',
          name,
          periodMinutes: 60,
          graceMinutes: 10,
          alertIds: [ownerRow.id],
        })
        .expect(201);
    const api = (await beat('API')).body as { id: string; heartbeatUrl: string };
    const jobs = (await beat('Jobs')).body as { id: string; heartbeatUrl: string };
    const other = await prisma.cloudTeam.create({ data: { slug: `n2-${tag}`, name: 'Other' } });
    const foreign = await prisma.cloudMonitor.create({
      data: { teamId: other.id, name: 'Theirs', kind: 'HEARTBEAT', periodMinutes: 60 },
    });
    await request(server)
      .put(`/v1/cloud/teams/${team}/status-page`)
      .set(auth)
      .send({
        enabled: true,
        title: 'Ops status',
        items: [
          { monitorId: api.id, label: 'Public API' },
          { monitorId: jobs.id, label: 'Nightly jobs' },
        ],
      })
      .expect(200);

    // ── An incident ──
    const base = `/v1/cloud/teams/${team}/status-notices`;
    const incidentInput = {
      kind: 'INCIDENT',
      title: 'Slow API',
      monitorIds: [api.id],
      body: 'We are looking into it.\nMore soon.',
    };
    await request(server)
      .post(base)
      .set(auth)
      .send({ ...incidentInput, monitorIds: [api.id, foreign.id] })
      .expect(400);
    await request(server)
      .post(base)
      .set(auth)
      .send({ ...incidentInput, monitorIds: [api.id, api.id] })
      .expect(400);
    await request(server).post(base).set(memberAuth).send(incidentInput).expect(403);
    const incident = await request(server).post(base).set(auth).send(incidentInput).expect(201);
    expect(incident.body).toMatchObject({
      kind: 'INCIDENT',
      state: 'INVESTIGATING',
      open: true,
      monitorIds: [api.id],
      resolvedAt: null,
      createdBy: 'Ada',
    });
    expect(incident.body.updates).toEqual([
      expect.objectContaining({ state: 'INVESTIGATING', body: incidentInput.body }),
    ]);
    const incidentUrl = `/v1/cloud/status-notices/${incident.body.id as string}`;

    // Another team's notice doesn't exist for this one's people.
    const theirs = await prisma.cloudStatusNotice.create({
      data: {
        teamId: other.id,
        kind: 'INCIDENT',
        title: 'Theirs',
        state: 'INVESTIGATING',
        monitorIds: [foreign.id],
      },
    });
    const theirsUrl = `/v1/cloud/status-notices/${theirs.id}`;
    await request(server).get(theirsUrl).set(memberAuth).expect(404);
    await request(server).patch(theirsUrl).set(auth).send({ title: 'Mine' }).expect(404);
    await request(server)
      .post(`${theirsUrl}/updates`)
      .set(auth)
      .send({ body: 'x', state: 'RESOLVED' })
      .expect(404);
    await request(server).delete(theirsUrl).set(auth).expect(404);

    await request(server).post(`${incidentUrl}/updates`).set(auth).send({ body: 'x' }).expect(400);
    await request(server)
      .post(`${incidentUrl}/updates`)
      .set(auth)
      .send({ body: 'x', state: 'COMPLETED' })
      .expect(400);
    await request(server)
      .post(`${incidentUrl}/updates`)
      .set(memberAuth)
      .send({ body: 'x', state: 'IDENTIFIED' })
      .expect(403);
    const identified = await request(server)
      .post(`${incidentUrl}/updates`)
      .set(auth)
      .send({ body: 'A slow database query.', state: 'IDENTIFIED' })
      .expect(201);
    expect(identified.body.state).toBe('IDENTIFIED');
    expect(identified.body.updates.map((u: { state: string }) => u.state)).toEqual([
      'IDENTIFIED',
      'INVESTIGATING',
    ]);
    const resolved = await request(server)
      .post(`${incidentUrl}/updates`)
      .set(auth)
      .send({ body: 'Fixed.', state: 'RESOLVED' })
      .expect(201);
    expect(resolved.body).toMatchObject({ state: 'RESOLVED', open: false });
    expect(resolved.body.resolvedAt).not.toBeNull();
    const reopened = await request(server)
      .post(`${incidentUrl}/updates`)
      .set(auth)
      .send({ body: 'It is back.', state: 'MONITORING' })
      .expect(201);
    expect(reopened.body).toMatchObject({ state: 'MONITORING', open: true, resolvedAt: null });

    // Members read.
    const open = await request(server).get(`${base}?open=true`).set(memberAuth).expect(200);
    expect(open.body).toMatchObject({ total: 1, page: 1 });
    expect(open.body.items[0].id).toBe(incident.body.id);
    await request(server).get(`${base}?open=false`).set(memberAuth).expect(200, {
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
    await request(server).get(incidentUrl).set(memberAuth).expect(200);
    await request(server)
      .patch(incidentUrl)
      .set(auth)
      .send({ startsAt: new Date().toISOString() })
      .expect(400);
    const renamed = await request(server)
      .patch(incidentUrl)
      .set(auth)
      .send({ title: 'Slow API responses' })
      .expect(200);
    expect(renamed.body.title).toBe('Slow API responses');

    // ── Maintenance windows ──
    const now = Date.now();
    const iso = (offset: number) => new Date(now + offset).toISOString();
    const maintenanceInput = {
      kind: 'MAINTENANCE',
      title: 'Database upgrade',
      monitorIds: [jobs.id],
      body: 'Upgrading PostgreSQL.',
    };
    for (const window of [
      {},
      { startsAt: iso(HOUR) },
      { startsAt: iso(2 * HOUR), endsAt: iso(HOUR) },
      { startsAt: iso(HOUR), endsAt: iso(HOUR + 7 * DAY + MINUTE) },
      { startsAt: iso(91 * DAY), endsAt: iso(91 * DAY + HOUR) },
      { startsAt: iso(-2 * HOUR), endsAt: iso(HOUR) },
      { startsAt: iso(HOUR), endsAt: iso(2 * HOUR), state: 'SCHEDULED' },
      { startsAt: iso(-50 * MINUTE), endsAt: iso(-10 * MINUTE) },
    ]) {
      await request(server)
        .post(base)
        .set(auth)
        .send({ ...maintenanceInput, ...window })
        .expect(400);
    }
    const upcoming = await request(server)
      .post(base)
      .set(auth)
      .send({ ...maintenanceInput, startsAt: iso(DAY), endsAt: iso(DAY + HOUR) })
      .expect(201);
    expect(upcoming.body).toMatchObject({ state: 'SCHEDULED', open: true });
    expect(upcoming.body.updates[0].state).toBeNull();
    const maintenance = await request(server)
      .post(base)
      .set(auth)
      .send({ ...maintenanceInput, startsAt: iso(-30 * MINUTE), endsAt: iso(HOUR) })
      .expect(201);
    expect(maintenance.body.state).toBe('IN_PROGRESS');
    const maintenanceUrl = `/v1/cloud/status-notices/${maintenance.body.id as string}`;
    // A changed start can't be in the past; a longer window can.
    await request(server)
      .patch(maintenanceUrl)
      .set(auth)
      .send({ startsAt: iso(-20 * MINUTE) })
      .expect(400);
    const longer = await request(server)
      .patch(maintenanceUrl)
      .set(auth)
      .send({ endsAt: iso(2 * HOUR) })
      .expect(200);
    expect(longer.body.endsAt).toBe(iso(2 * HOUR));
    await request(server)
      .patch(maintenanceUrl)
      .set(auth)
      .send({ endsAt: iso(-MINUTE) })
      .expect(400);
    // Once started, no monitor can be added (it would hide its downtime).
    await request(server)
      .patch(maintenanceUrl)
      .set(auth)
      .send({ monitorIds: [jobs.id, api.id] })
      .expect(400);

    // During the maintenance: events go on, alerts don't.
    const ping = (monitor: { heartbeatUrl: string }, fail = false) =>
      request(server)
        .get(`${new URL(monitor.heartbeatUrl).pathname}${fail ? '?status=fail' : ''}`)
        .expect(200);
    await ping(api);
    await ping(jobs);
    await ping(jobs, true);
    expect((await prisma.cloudMonitor.findUniqueOrThrow({ where: { id: jobs.id } })).status).toBe(
      'DOWN',
    );
    expect(await prisma.cloudMonitorEvent.count({ where: { monitorId: jobs.id } })).toBe(2);
    await engine.tick();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(sent.filter((m) => m.subject.startsWith('Down:'))).toEqual([]);

    // The public page: MAINTENANCE, `maintenance` overall, and the notices in order.
    const status = await request(server).get(`/v1/cloud/status/${team}`).expect(200);
    expect(status.body.overall).toBe('maintenance');
    expect(status.body.monitors.map((m: { status: string }) => m.status)).toEqual([
      'UP',
      'MAINTENANCE',
    ]);
    expect(
      status.body.notices.map((n: { title: string; state: string; monitors: string[] }) => [
        n.title,
        n.state,
        n.monitors,
      ]),
    ).toEqual([
      ['Slow API responses', 'MONITORING', ['Public API']],
      ['Database upgrade', 'IN_PROGRESS', ['Nightly jobs']],
      ['Database upgrade', 'SCHEDULED', ['Nightly jobs']],
    ]);
    expect(status.body.notices[0].updates).toHaveLength(4);
    expect(status.body.notices[0].updates[0]).toEqual({
      state: 'MONITORING',
      body: 'It is back.',
      createdAt: expect.any(String),
    });
    expect(JSON.stringify(status.body)).not.toContain('Ada');
    const badge = await request(server).get(`/v1/cloud/status/${team}/badge.svg`).expect(200);
    expect(badge.text || String(badge.body)).toContain('under maintenance');

    // A note, then ending it early; a completed maintenance can't change.
    await request(server)
      .post(`${maintenanceUrl}/updates`)
      .set(auth)
      .send({ body: 'Half way.', state: 'IDENTIFIED' })
      .expect(400);
    const note = await request(server)
      .post(`${maintenanceUrl}/updates`)
      .set(auth)
      .send({ body: 'Half way.' })
      .expect(201);
    expect(note.body).toMatchObject({ state: 'IN_PROGRESS', open: true });
    const done = await request(server)
      .post(`${maintenanceUrl}/updates`)
      .set(auth)
      .send({ body: 'Done.', state: 'COMPLETED' })
      .expect(201);
    expect(done.body).toMatchObject({ state: 'COMPLETED', open: false });
    // Still down when the window ends: the held-back alert goes out on the next tick, once.
    await engine.tick();
    await vi.waitFor(() => expect(sent.filter((m) => m.subject === 'Down: Jobs')).toHaveLength(1));
    await engine.tick();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(sent.filter((m) => m.subject === 'Down: Jobs')).toHaveLength(1);
    await request(server)
      .post(`${maintenanceUrl}/updates`)
      .set(auth)
      .send({ body: 'Again.' })
      .expect(409);
    await request(server).patch(maintenanceUrl).set(auth).send({ title: 'x' }).expect(409);
    const after = await request(server).get(`/v1/cloud/status/${team}`).expect(200);
    expect(after.body.overall).toBe('partial');
    expect(after.body.notices.at(-1)).toMatchObject({
      title: 'Database upgrade',
      state: 'COMPLETED',
    });

    // ── Limits: 50 updates per notice, 20 open notices per team ──
    const count = await prisma.cloudStatusNoticeUpdate.count({
      where: { noticeId: incident.body.id as string },
    });
    await prisma.cloudStatusNoticeUpdate.createMany({
      data: Array.from({ length: 50 - count }, () => ({
        noticeId: incident.body.id as string,
        state: 'MONITORING' as const,
        body: 'Still watching.',
      })),
    });
    await request(server)
      .post(`${incidentUrl}/updates`)
      .set(auth)
      .send({ body: 'One more.', state: 'MONITORING' })
      .expect(409);
    // Open: the incident and the upcoming maintenance; 18 more make 20.
    await prisma.cloudStatusNotice.createMany({
      data: Array.from({ length: 18 }, (_, index) => ({
        teamId,
        kind: 'INCIDENT' as const,
        title: `Filler ${index}`,
        state: 'INVESTIGATING' as const,
        monitorIds: [api.id],
      })),
    });
    await request(server).post(base).set(auth).send(incidentInput).expect(409);
    await prisma.cloudStatusNotice.deleteMany({
      where: { teamId, title: { startsWith: 'Filler' } },
    });

    // Deleting a monitor takes it out of the notices.
    await request(server).delete(`/v1/cloud/monitors/${api.id}`).set(auth).expect(204);
    expect((await request(server).get(incidentUrl).set(auth).expect(200)).body.monitorIds).toEqual(
      [],
    );

    // Deleting a notice: admins only.
    await request(server).delete(incidentUrl).set(memberAuth).expect(403);
    await request(server).delete(incidentUrl).set(auth).expect(204);
    await request(server).get(incidentUrl).set(auth).expect(404);
    const actions = (await prisma.cloudEvent.findMany({ where: { teamId } })).map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'status.notice.create',
        'status.notice.update',
        'status.notice.delete',
      ]),
    );

    // The daily job deletes notices closed over 365 days ago.
    const old = await prisma.cloudStatusNotice.create({
      data: {
        teamId,
        kind: 'INCIDENT',
        title: 'Long ago',
        state: 'RESOLVED',
        monitorIds: [jobs.id],
        resolvedAt: new Date(now - 366 * DAY),
      },
    });
    await engine.cleanup();
    expect(await prisma.cloudStatusNotice.findUnique({ where: { id: old.id } })).toBeNull();
    expect(
      await prisma.cloudStatusNotice.findUnique({ where: { id: maintenance.body.id as string } }),
    ).not.toBeNull();
  });

  it('holds alerts during maintenance and leaves its time out of uptime', async () => {
    const server = app.getHttpServer();
    const login = await request(server).post('/v1/auth/login').send(owner).expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
    const team = `na-${tag}`;
    const created = await request(server)
      .post('/v1/cloud/teams')
      .set(auth)
      .send({ name: 'Alerts', slug: team, acceptTerms: true, termsVersion: CLOUD_TERMS_VERSION })
      .expect(201);
    const teamId = created.body.id as string;
    const ownerRow = await prisma.user.findUniqueOrThrow({ where: { email: owner.email } });
    const beat = async (name: string) =>
      (
        await request(server)
          .post(`/v1/cloud/teams/${team}/monitors`)
          .set(auth)
          .send({
            kind: 'HEARTBEAT',
            name,
            periodMinutes: 60,
            graceMinutes: 10,
            alertIds: [ownerRow.id],
          })
          .expect(201)
      ).body as { id: string; heartbeatUrl: string };
    const ping = (monitor: { heartbeatUrl: string }, fail = false) =>
      request(server)
        .get(`${new URL(monitor.heartbeatUrl).pathname}${fail ? '?status=fail' : ''}`)
        .expect(200);
    const settle = () => new Promise((resolve) => setTimeout(resolve, 200));
    const beta = await beat('Beta');
    const gamma = await beat('Gamma');
    await ping(beta);
    await ping(gamma);

    // Beta's outage is alerted before the window; Gamma's happens only inside it.
    await ping(beta, true);
    await vi.waitFor(() => expect(sent.some((m) => m.subject === 'Down: Beta')).toBe(true));
    const now = Date.now();
    const maintenance = await request(server)
      .post(`/v1/cloud/teams/${team}/status-notices`)
      .set(auth)
      .send({
        kind: 'MAINTENANCE',
        title: 'Cluster move',
        monitorIds: [beta.id, gamma.id],
        body: 'Moving servers.',
        startsAt: new Date(now - MINUTE).toISOString(),
        endsAt: new Date(now + HOUR).toISOString(),
      })
      .expect(201);
    await ping(gamma, true);
    await ping(gamma);
    // Beta's recovery is announced, since its outage was.
    await ping(beta);
    await vi.waitFor(() => expect(sent.some((m) => m.subject === 'Back up: Beta')).toBe(true));
    await settle();
    expect(sent.filter((m) => m.subject.endsWith(': Gamma'))).toEqual([]);

    // A started maintenance can lose monitors.
    const fewer = await request(server)
      .patch(`/v1/cloud/status-notices/${maintenance.body.id as string}`)
      .set(auth)
      .send({ monitorIds: [beta.id] })
      .expect(200);
    expect(fewer.body.monitorIds).toEqual([beta.id]);

    // Uptime and incidents leave a past window out: down 2 h ago, inside a window that ended.
    const delta = await prisma.cloudMonitor.create({
      data: { teamId, name: 'Delta', kind: 'HEARTBEAT', periodMinutes: 60, status: 'UP' },
    });
    await prisma.cloudMonitorEvent.createMany({
      data: [
        { monitorId: delta.id, status: 'UP', at: new Date(now - 4 * HOUR) },
        { monitorId: delta.id, status: 'DOWN', at: new Date(now - 2 * HOUR), error: 'HTTP 503' },
        { monitorId: delta.id, status: 'UP', at: new Date(now - 90 * MINUTE) },
      ],
    });
    await prisma.cloudStatusNotice.create({
      data: {
        teamId,
        kind: 'MAINTENANCE',
        title: 'Disk swap',
        state: 'SCHEDULED',
        monitorIds: [delta.id],
        startsAt: new Date(now - 3 * HOUR),
        endsAt: new Date(now - HOUR),
      },
    });
    await request(server)
      .put(`/v1/cloud/teams/${team}/status-page`)
      .set(auth)
      .send({ enabled: true, title: 'Alerts', items: [{ monitorId: delta.id, label: 'Delta' }] })
      .expect(200);
    const status = await request(server).get(`/v1/cloud/status/${team}`).expect(200);
    expect(status.body.monitors[0]).toMatchObject({ label: 'Delta', status: 'UP', uptime90: 1 });
    expect(status.body.monitors[0].incidents).toEqual([]);
    // The maintenance in progress no longer covers a monitor on the page: it names none.
    expect(
      status.body.notices.map((n: { title: string; state: string; monitors: string[] }) => [
        n.title,
        n.state,
        n.monitors,
      ]),
    ).toEqual([
      ['Cluster move', 'IN_PROGRESS', []],
      ['Disk swap', 'COMPLETED', ['Delta']],
    ]);
  });
});
