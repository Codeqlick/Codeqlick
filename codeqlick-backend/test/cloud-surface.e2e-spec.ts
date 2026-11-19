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
import { CLOUD_TERMS_VERSION } from '../src/modules/cloud/cloud-plans.js';
import { CloudSurfaceService } from '../src/modules/cloud/cloud-surface.service.js';
import { nextSurfaceScan, surfaceSlot } from '../src/modules/cloud/cloud-surface.js';
import { DomainNotFoundError } from '../src/modules/security-checks/gather.js';
import { SecurityChecksService } from '../src/modules/security-checks/security-checks.service.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'cloud-surface-password-1';
const ada = { email: `e2e-cs-ada-${tag}@codeqlick.test`, password };
const luis = { email: `e2e-cs-luis-${tag}@codeqlick.test`, password };
const grace = { email: `e2e-cs-grace-${tag}@codeqlick.test`, password };
const terms = { acceptTerms: true, termsVersion: CLOUD_TERMS_VERSION };
const DAY_MS = 86_400_000;

const snapshot = (over: Record<string, unknown> = {}) => ({
  dns: {
    mx: ['10 mx.a.test'],
    spf: ['v=spf1 -all'],
    dmarc: ['v=dmarc1; p=reject'],
    caa: [],
    mtaSts: [],
    ns: ['ns1.a.test'],
    dnssec: 'signed',
    ...over,
  },
  cert: { issuer: "Let's Encrypt", expires: null, days: 60 },
});

const fakeScan = (hsts: 'pass' | 'fail', over: Record<string, unknown> = {}) => ({
  checks: [{ id: 'hsts' as const, status: hsts, values: {} }],
  score: hsts === 'pass' ? 90 : 60,
  grade: hsts === 'pass' ? ('A' as const) : ('C' as const),
  snapshot: snapshot(over) as never,
});

describe('Codeqlick Cloud: the Surface monitor (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const sent: MailMessage[] = [];

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
    for (const [person, name, locale] of [
      [ada, 'Ada', Locale.EN],
      [luis, 'Luis', Locale.ES],
      [grace, 'Grace', Locale.EN],
    ] as const) {
      await prisma.user.create({
        data: {
          email: person.email,
          name,
          locale,
          role: Role.CLIENT,
          passwordHash,
          registeredAt: new Date(),
        },
      });
    }
  });

  afterAll(async () => {
    if (prisma) {
      // Projects, domains and scans go with their team.
      await prisma.cloudTeam.deleteMany({ where: { slug: { startsWith: `cs-${tag}` } } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
  });

  it('switches the monitor, enforces the limit, scans, alerts and keeps scans where they were made', async () => {
    const server = app.getHttpServer();
    const login = async (who: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(who).expect(200)).body.accessToken as string}`,
    });
    const adaAuth = await login(ada);
    const luisAuth = await login(luis);
    const graceAuth = await login(grace);
    const user = (email: string) => prisma.user.findUniqueOrThrow({ where: { email } });
    const [adaRow, luisRow] = await Promise.all([user(ada.email), user(luis.email)]);

    const teamSlug = `cs-${tag}-team`;
    const otherSlug = `cs-${tag}-other`;
    await request(server)
      .post('/v1/cloud/teams')
      .set(adaAuth)
      .send({ name: 'Studio', slug: teamSlug, ...terms })
      .expect(201);
    await request(server)
      .post('/v1/cloud/teams')
      .set(graceAuth)
      .send({ name: 'Client', slug: otherSlug, ...terms })
      .expect(201);
    const team = await prisma.cloudTeam.findUniqueOrThrow({ where: { slug: teamSlug } });
    const other = await prisma.cloudTeam.findUniqueOrThrow({ where: { slug: otherSlug } });
    await prisma.cloudMember.create({
      data: {
        teamId: team.id,
        userId: luisRow.id,
        role: 'MEMBER',
        termsVersion: CLOUD_TERMS_VERSION,
        termsAcceptedAt: new Date(),
      },
    });
    // Ada also administers the client's team, so she can move the project there.
    await prisma.cloudMember.create({
      data: {
        teamId: other.id,
        userId: adaRow.id,
        role: 'ADMIN',
        termsVersion: CLOUD_TERMS_VERSION,
        termsAcceptedAt: new Date(),
      },
    });

    const slug = `cs-${tag}-shop`;
    const project = await request(server)
      .post(`/v1/cloud/teams/${teamSlug}/projects`)
      .set(adaAuth)
      .send({ name: 'Shop', slug })
      .expect(201);
    const projectId = project.body.id as string;
    const domainUrl = (id: string) => `/v1/cloud/projects/${projectId}/domains/${id}`;

    const makeDomain = (name: string, state: 'PENDING' | 'VERIFIED' | 'LIVE' | 'ERROR') =>
      prisma.cloudDomain.create({
        data: {
          projectId,
          name: `${name}-${tag}.example.org`,
          verificationToken: randomUUID(),
          state,
          verifiedAt: state === 'PENDING' ? null : new Date(),
        },
      });
    const pending = await makeDomain('pending', 'PENDING');
    const live = await makeDomain('live', 'LIVE');
    const errored = await makeDomain('error', 'ERROR');
    const verified = await makeDomain('verified', 'VERIFIED');
    const extra = await Promise.all([1, 2, 3].map((n) => makeDomain(`extra${n}`, 'LIVE')));

    // ── The switch ────────────────────────────────────────────────────────────────────────────
    // Not verified yet.
    const notYet = await request(server)
      .patch(domainUrl(pending.id))
      .set(adaAuth)
      .send({ surfaceMonitor: true })
      .expect(409);
    expect(notYet.body.detail).toBe('Verify the domain first');
    // Admins only, and only members of the team at all.
    await request(server)
      .patch(domainUrl(live.id))
      .set(luisAuth)
      .send({ surfaceMonitor: true })
      .expect(403);
    await request(server)
      .patch(domainUrl(live.id))
      .set(graceAuth)
      .send({ surfaceMonitor: true })
      .expect(404);
    await request(server)
      .patch(domainUrl(randomUUID()))
      .set(adaAuth)
      .send({ surfaceMonitor: true })
      .expect(404);
    await request(server).patch(domainUrl(live.id)).set(adaAuth).send({}).expect(400);
    await request(server)
      .patch(domainUrl(live.id))
      .set(adaAuth)
      .send({ surfaceMonitor: 'yes' })
      .expect(400);

    const before = Date.now();
    const on = await request(server)
      .patch(domainUrl(live.id))
      .set(adaAuth)
      .send({ surfaceMonitor: true })
      .expect(200);
    expect(on.body).toMatchObject({
      id: live.id,
      name: live.name,
      state: 'LIVE',
      surfaceMonitor: true,
      surfaceLast: null,
    });
    // The next run is the domain's own daily slot, within the next day.
    const next = new Date(on.body.surfaceNextAt as string);
    expect(next.getTime()).toBeGreaterThan(before);
    expect(next.getTime()).toBeLessThanOrEqual(Date.now() + DAY_MS);
    expect(next.getTime()).toBe(nextSurfaceScan(live.id, new Date(next.getTime() - 1)).getTime());
    const slot = surfaceSlot(live.id);
    expect(slot.hour).toBeGreaterThanOrEqual(1);
    expect(slot.hour).toBeLessThanOrEqual(5);
    const events = () =>
      prisma.cloudEvent.findMany({
        where: { teamId: team.id, action: { startsWith: 'domain.surface_monitor_' } },
        orderBy: { createdAt: 'asc' },
      });
    expect((await events()).map((e) => [e.action, e.targetLabel])).toEqual([
      ['domain.surface_monitor_enabled', live.name],
    ]);
    // Switching it on again changes nothing and records nothing.
    await request(server)
      .patch(domainUrl(live.id))
      .set(adaAuth)
      .send({ surfaceMonitor: true })
      .expect(200);
    expect(await events()).toHaveLength(1);

    // The listing shows the setting for every domain.
    const listed = await request(server)
      .get(`/v1/cloud/projects/${projectId}/domains`)
      .set(luisAuth)
      .expect(200);
    const byName = Object.fromEntries(
      (listed.body.items as Array<{ name: string; surfaceMonitor: boolean }>).map((d) => [
        d.name,
        d,
      ]),
    );
    expect(byName[live.name]).toMatchObject({ surfaceMonitor: true, surfaceLast: null });
    expect(byName[verified.name]).toMatchObject({
      surfaceMonitor: false,
      surfaceNextAt: null,
      surfaceLast: null,
    });

    // VERIFIED and ERROR domains can be watched too.
    await request(server)
      .patch(domainUrl(errored.id))
      .set(adaAuth)
      .send({ surfaceMonitor: true })
      .expect(200);
    await request(server)
      .patch(domainUrl(verified.id))
      .set(adaAuth)
      .send({ surfaceMonitor: true })
      .expect(200);

    // ── The limit (FREE: 5 domains per team) ─────────────────────────────────────────────────
    // Three are on (live, errored, verified): two more fill it.
    for (const domain of extra.slice(0, 2)) {
      await request(server)
        .patch(domainUrl(domain.id))
        .set(adaAuth)
        .send({ surfaceMonitor: true })
        .expect(200);
    }
    const usage = await request(server)
      .get(`/v1/cloud/teams/${teamSlug}/usage`)
      .set(luisAuth)
      .expect(200);
    expect(usage.body.surfaceDomains).toBe(5);
    expect(usage.body.limits.surfaceDomains).toBe(5);
    const full = await request(server)
      .patch(domainUrl(extra[2]!.id))
      .set(adaAuth)
      .send({ surfaceMonitor: true })
      .expect(409);
    expect(full.body.detail).toBe('A team can monitor at most 5 domains');
    // Switching one off clears its next run and frees its place.
    const off = await request(server)
      .patch(domainUrl(errored.id))
      .set(adaAuth)
      .send({ surfaceMonitor: false })
      .expect(200);
    expect(off.body).toMatchObject({ surfaceMonitor: false, surfaceNextAt: null });
    expect((await events()).at(-1)).toMatchObject({
      action: 'domain.surface_monitor_disabled',
      targetLabel: errored.name,
    });
    await request(server)
      .patch(domainUrl(extra[2]!.id))
      .set(adaAuth)
      .send({ surfaceMonitor: true })
      .expect(200);
    // Back to a quiet state for the rest: only `live` stays on.
    for (const domain of [verified, extra[0]!, extra[1]!, extra[2]!]) {
      await request(server)
        .patch(domainUrl(domain.id))
        .set(adaAuth)
        .send({ surfaceMonitor: false })
        .expect(200);
    }
    expect(
      (await request(server).get(`/v1/cloud/teams/${teamSlug}/usage`).set(adaAuth)).body
        .surfaceDomains,
    ).toBe(1);

    // ── History before any scan ───────────────────────────────────────────────────────────────
    const empty = await request(server)
      .get(`${domainUrl(live.id)}/surface`)
      .set(luisAuth)
      .expect(200);
    expect(empty.body).toMatchObject({
      enabled: true,
      nextAt: next.toISOString(),
      last: null,
      scans: [],
      domain: { id: live.id },
    });
    await request(server)
      .get(`${domainUrl(live.id)}/surface`)
      .set(graceAuth)
      .expect(404);
    await request(server)
      .get(`${domainUrl(randomUUID())}/surface`)
      .set(adaAuth)
      .expect(404);

    // ── The scheduled job ─────────────────────────────────────────────────────────────────────
    const surface = app.get(CloudSurfaceService);
    const scan = vi.spyOn(app.get(SecurityChecksService), 'scan');
    const due = () =>
      prisma.cloudDomain.update({
        where: { id: live.id },
        data: { surfaceNextAt: new Date(Date.now() - 30 * DAY_MS) },
      });
    const alerts = () =>
      sent.filter((m) => /Security changes on|Cambios de seguridad/.test(m.subject));

    // The first scan is the baseline: stored, nothing reported, the next run moved to the slot.
    scan.mockResolvedValueOnce(fakeScan('pass'));
    await due();
    await surface.runScheduled();
    const afterFirst = await prisma.cloudDomain.findUniqueOrThrow({ where: { id: live.id } });
    expect(afterFirst.surfaceNextAt!.getTime()).toBeGreaterThan(Date.now());
    expect(scan).toHaveBeenCalledWith(live.name, expect.any(AbortSignal));
    expect(alerts()).toHaveLength(0);
    const first = await prisma.surfaceScan.findFirstOrThrow({ where: { domainId: live.id } });
    expect(first).toMatchObject({
      status: 'DONE',
      score: 90,
      grade: 'A',
      teamId: team.id,
      projectId,
    });
    expect(first.result).toEqual([{ id: 'hsts', status: 'pass', values: {} }]);

    // Not due again until its slot.
    await surface.runScheduled();
    expect(await prisma.surfaceScan.count({ where: { domainId: live.id } })).toBe(1);

    // A failed scan is stored and neither compared nor alerted.
    scan.mockRejectedValueOnce(new DomainNotFoundError('Domain not found'));
    await due();
    await surface.runScheduled();
    expect(alerts()).toHaveLength(0);
    const failed = await prisma.surfaceScan.findFirstOrThrow({
      where: { domainId: live.id, status: 'FAILED' },
    });
    expect(failed).toMatchObject({ error: 'not_found', score: null, grade: null });

    // A worse check and a changed NS set: one email to each owner and admin, in their language.
    scan.mockResolvedValueOnce(fakeScan('fail', { ns: ['ns1.evil.test'] }));
    await due();
    await surface.runScheduled();
    const mails = alerts();
    expect(mails.map((m) => m.to)).toEqual([ada.email]);
    expect(mails[0]!.subject).toBe(`Security changes on ${live.name}`);
    expect(mails[0]!.text).toContain('pass → fail');
    expect(mails[0]!.text).toContain('Name servers changed');
    expect(mails[0]!.text).toContain(`/domains/${live.id}/security?scan=`);

    // A suspended project keeps its setting, but its scans are skipped (and the slot moves on).
    await prisma.cloudProject.update({
      where: { id: projectId },
      data: { suspendedAt: new Date() },
    });
    const scansBefore = await prisma.surfaceScan.count({ where: { domainId: live.id } });
    scan.mockClear();
    await due();
    await surface.runScheduled();
    expect(scan).not.toHaveBeenCalled();
    expect(await prisma.surfaceScan.count({ where: { domainId: live.id } })).toBe(scansBefore);
    const suspended = await prisma.cloudDomain.findUniqueOrThrow({ where: { id: live.id } });
    expect(suspended.surfaceMonitor).toBe(true);
    expect(suspended.surfaceNextAt!.getTime()).toBeGreaterThan(Date.now());
    await prisma.cloudProject.update({ where: { id: projectId }, data: { suspendedAt: null } });

    // ── Reading the history and a scan ───────────────────────────────────────────────────────
    const history = await request(server)
      .get(`${domainUrl(live.id)}/surface`)
      .set(luisAuth)
      .expect(200);
    expect(history.body.enabled).toBe(true);
    expect(
      (history.body.scans as Array<{ status: string; changes: number }>).map((s) => [
        s.status,
        s.changes,
      ]),
    ).toEqual([
      ['DONE', 2],
      ['FAILED', 0],
      ['DONE', 0],
    ]);
    expect(history.body.last).toEqual(history.body.scans[0]);
    expect(history.body.scans[1]).toMatchObject({
      error: 'not_found',
      score: null,
      grade: null,
    });
    const latestId = history.body.scans[0].id as string;
    const firstId = history.body.scans[2].id as string;

    const detail = await request(server)
      .get(`/v1/cloud/surface-scans/${latestId}?locale=es`)
      .set(luisAuth)
      .expect(200);
    expect(detail.body).toMatchObject({
      id: latestId,
      domain: { id: live.id, name: live.name },
      project: { slug, name: 'Shop' },
      status: 'DONE',
      error: null,
      failure: null,
      score: 60,
      grade: 'C',
      previous: { id: firstId, grade: 'A', score: 90 },
    });
    expect(detail.body.changes).toEqual([
      { kind: 'check', id: 'hsts', from: 'pass', to: 'fail' },
      { kind: 'records', record: 'ns', added: ['ns1.evil.test'], removed: ['ns1.a.test'] },
    ]);
    expect(detail.body.snapshot.dns.ns).toEqual(['ns1.evil.test']);
    const https = (
      detail.body.groups as Array<{
        key: string;
        name: string;
        checks: Array<{ id: string; status: string }>;
      }>
    ).find((g) => g.key === 'https')!;
    expect(https.name).toBe('HTTPS y cifrado');
    expect(https.checks).toEqual([expect.objectContaining({ id: 'hsts', status: 'fail' })]);

    const baseline = await request(server)
      .get(`/v1/cloud/surface-scans/${firstId}`)
      .set(adaAuth)
      .expect(200);
    expect(baseline.body).toMatchObject({ previous: null, changes: [] });
    const failedId = history.body.scans[1].id as string;
    const failedScan = await request(server)
      .get(`/v1/cloud/surface-scans/${failedId}`)
      .set(adaAuth)
      .expect(200);
    expect(failedScan.body).toMatchObject({
      status: 'FAILED',
      error: 'not_found',
      groups: [],
      snapshot: null,
      changes: [],
      previous: null,
    });
    expect(failedScan.body.failure).toEqual(expect.any(String));
    await request(server).get(`/v1/cloud/surface-scans/${latestId}`).set(graceAuth).expect(404);
    await request(server).get(`/v1/cloud/surface-scans/${randomUUID()}`).set(adaAuth).expect(404);
    await request(server).get('/v1/cloud/surface-scans/not-an-id').set(adaAuth).expect(400);

    // The Domains tab shows the newest scan with how many changes it had.
    const withLast = await request(server)
      .get(`/v1/cloud/projects/${projectId}/domains`)
      .set(adaAuth)
      .expect(200);
    expect(
      (withLast.body.items as Array<{ id: string; surfaceLast: unknown }>).find(
        (d) => d.id === live.id,
      )!.surfaceLast,
    ).toMatchObject({ id: latestId, status: 'DONE', grade: 'C', changes: 2 });

    // ── Moving the project: the switch goes off, the scans stay with the source team ──────────
    await request(server)
      .post(`/v1/cloud/projects/${projectId}/transfer`)
      .set(adaAuth)
      .send({ team: otherSlug })
      .expect(200);
    const moved = await prisma.cloudDomain.findUniqueOrThrow({ where: { id: live.id } });
    expect(moved).toMatchObject({ surfaceMonitor: false, surfaceNextAt: null });
    expect(await prisma.surfaceScan.count({ where: { domainId: live.id, teamId: team.id } })).toBe(
      3,
    );
    // The new team starts with an empty history; the old team's scans are not shown to it...
    const target = await request(server)
      .get(`${domainUrl(live.id)}/surface`)
      .set(graceAuth)
      .expect(200);
    expect(target.body).toMatchObject({ enabled: false, nextAt: null, last: null, scans: [] });
    // ...and the old team's members can still open them, but nobody else.
    await request(server).get(`/v1/cloud/surface-scans/${latestId}`).set(luisAuth).expect(200);
    await request(server).get(`/v1/cloud/surface-scans/${latestId}`).set(graceAuth).expect(404);

    // ── Removing the domain deletes its scans ─────────────────────────────────────────────────
    await request(server).delete(domainUrl(live.id)).set(graceAuth).expect(204);
    expect(await prisma.surfaceScan.count({ where: { domainId: live.id } })).toBe(0);
  });
});
