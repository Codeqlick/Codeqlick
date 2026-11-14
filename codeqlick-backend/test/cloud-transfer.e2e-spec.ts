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
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'cloud-transfer-password-1';
const ada = { email: `e2e-ct-ada-${tag}@codeqlick.test`, password };
const grace = { email: `e2e-ct-grace-${tag}@codeqlick.test`, password };
const luis = { email: `e2e-ct-luis-${tag}@codeqlick.test`, password };
const terms = { acceptTerms: true, termsVersion: CLOUD_TERMS_VERSION };
const DAY_MS = 86_400_000;

describe('Codeqlick Cloud: moving a project to another team (e2e)', () => {
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
      [grace, 'Grace', Locale.ES],
      [luis, 'Luis', Locale.EN],
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
      // Projects go with their team.
      await prisma.cloudTeam.deleteMany({ where: { slug: { startsWith: `ct-${tag}` } } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
  });

  it('moves a project with its monitors, people lists and analytics', async () => {
    const server = app.getHttpServer();
    const login = async (who: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(who).expect(200)).body.accessToken as string}`,
    });
    const adaAuth = await login(ada);
    const graceAuth = await login(grace);
    const luisAuth = await login(luis);
    const user = (email: string) => prisma.user.findUniqueOrThrow({ where: { email } });
    const [adaRow, graceRow, luisRow] = await Promise.all([
      user(ada.email),
      user(grace.email),
      user(luis.email),
    ]);
    const join = (teamId: string, userId: string, role: 'ADMIN' | 'MEMBER') =>
      prisma.cloudMember.create({
        data: {
          teamId,
          userId,
          role,
          termsVersion: CLOUD_TERMS_VERSION,
          termsAcceptedAt: new Date(),
        },
      });

    // Ada's studio (Luis is an admin there) and Grace's client team (Ada is an admin there).
    const studioSlug = `ct-${tag}-studio`;
    const clientSlug = `ct-${tag}-client`;
    await request(server)
      .post('/v1/cloud/teams')
      .set(adaAuth)
      .send({ name: 'Studio', slug: studioSlug, ...terms })
      .expect(201);
    await request(server)
      .post('/v1/cloud/teams')
      .set(graceAuth)
      .send({ name: 'Client', slug: clientSlug, ...terms })
      .expect(201);
    const studio = await prisma.cloudTeam.findUniqueOrThrow({ where: { slug: studioSlug } });
    const client = await prisma.cloudTeam.findUniqueOrThrow({ where: { slug: clientSlug } });
    await join(studio.id, luisRow.id, 'ADMIN');
    await join(client.id, adaRow.id, 'ADMIN');

    const slug = `ct-${tag}-shop`;
    const project = await request(server)
      .post(`/v1/cloud/teams/${studioSlug}/projects`)
      .set(adaAuth)
      .send({ name: 'Shop', slug })
      .expect(201);
    const projectId = project.body.id as string;
    const url = `/v1/cloud/projects/${projectId}/transfer`;

    // What moves with it: a form and a monitor whose people are partly outside the target.
    const form = await prisma.cloudForm.create({
      data: {
        projectId,
        name: 'Contact',
        key: `cqf_${tag}${randomUUID().replaceAll('-', '').slice(0, 16)}`,
        recipientIds: [adaRow.id, luisRow.id],
      },
    });
    const monitor = await prisma.cloudMonitor.create({
      data: {
        teamId: studio.id,
        projectId,
        name: 'Shop',
        kind: 'HTTP',
        url: 'https://shop.example.com',
        alertIds: [luisRow.id],
      },
    });
    const other = await prisma.cloudMonitor.create({
      data: {
        teamId: studio.id,
        name: 'Studio site',
        kind: 'HTTP',
        url: 'https://studio.example.com',
        alertIds: [adaRow.id],
      },
    });
    await prisma.cloudStatusPage.create({
      data: {
        teamId: studio.id,
        title: 'Studio status',
        items: [
          { monitorId: monitor.id, label: 'Shop' },
          { monitorId: other.id, label: 'Studio' },
        ],
      },
    });
    const event = (createdAt: Date) =>
      prisma.cloudAnalyticsEvent.create({
        data: {
          projectId,
          teamId: studio.id,
          name: 'pageview',
          path: '/',
          browser: 'Firefox',
          os: 'Linux',
          device: 'desktop',
          visitor: 'a'.repeat(32),
          createdAt,
        },
      });
    const recent = await event(new Date());
    const old = await event(new Date(Date.now() - 90 * DAY_MS));

    // ── Refusals ─────────────────────────────────────────────────────────────────────────────
    const created = await request(server)
      .post('/v1/cloud/tokens')
      .set(adaAuth)
      .send({ name: 'CI', expiresInDays: 30 })
      .expect(201);
    // Session only: a token can't move projects.
    await request(server)
      .post(url)
      .set({ Authorization: `Bearer ${created.body.token as string}` })
      .send({ team: clientSlug })
      .expect(401);
    // Not in the project's team, or not its owner.
    await request(server).post(url).set(graceAuth).send({ team: clientSlug }).expect(404);
    const notOwner = await request(server)
      .post(url)
      .set(luisAuth)
      .send({ team: studioSlug })
      .expect(403);
    expect(notOwner.body.message).toBe('Only a team owner can do this');
    const unknown = await request(server)
      .post(url)
      .set(adaAuth)
      .send({ team: `ct-${tag}-nope` })
      .expect(404);
    expect(unknown.body.message).toBe('Team not found');
    const same = await request(server)
      .post(url)
      .set(adaAuth)
      .send({ team: studioSlug })
      .expect(400);
    expect(same.body.message).toBe('The project is already in that team');
    const build = await prisma.cloudBuild.create({
      data: {
        projectId,
        number: 1,
        trigger: 'MANUAL',
        target: 'PRODUCTION',
        branch: 'main',
        commit: 'a'.repeat(40),
      },
    });
    const busy = await request(server)
      .post(url)
      .set(adaAuth)
      .send({ team: clientSlug })
      .expect(409);
    expect(busy.body.message).toBe("Wait for the project's builds to finish");
    await prisma.cloudBuild.update({ where: { id: build.id }, data: { status: 'CANCELED' } });

    // ── The move ─────────────────────────────────────────────────────────────────────────────
    const moved = await request(server)
      .post(url)
      .set(adaAuth)
      .send({ team: clientSlug })
      .expect(200);
    expect(moved.body).toMatchObject({
      id: projectId,
      slug,
      team: { slug: clientSlug, name: 'Client' },
      git: 'none',
    });
    await request(server).get(`/v1/cloud/projects/${projectId}`).set(graceAuth).expect(200);
    await request(server).get(`/v1/cloud/projects/${projectId}`).set(luisAuth).expect(404);

    // The monitor moved with it, Luis (not in the client team) left its lists.
    const movedMonitor = await prisma.cloudMonitor.findUniqueOrThrow({ where: { id: monitor.id } });
    expect(movedMonitor.teamId).toBe(client.id);
    expect(movedMonitor.alertIds).toEqual([adaRow.id]);
    expect((await prisma.cloudMonitor.findUniqueOrThrow({ where: { id: other.id } })).teamId).toBe(
      studio.id,
    );
    const page = await prisma.cloudStatusPage.findUniqueOrThrow({ where: { teamId: studio.id } });
    expect(page.items).toEqual([{ monitorId: other.id, label: 'Studio' }]);
    const movedForm = await prisma.cloudForm.findUniqueOrThrow({ where: { id: form.id } });
    expect(movedForm.recipientIds).toEqual([adaRow.id]);

    // This month's analytics at once, older ones right after.
    expect(
      (await prisma.cloudAnalyticsEvent.findUniqueOrThrow({ where: { id: recent.id } })).teamId,
    ).toBe(client.id);
    await vi.waitFor(async () => {
      const row = await prisma.cloudAnalyticsEvent.findUniqueOrThrow({ where: { id: old.id } });
      expect(row.teamId).toBe(client.id);
    });

    // Both teams record it; the target's other owner is told, in her language.
    const actions = async (teamId: string) =>
      (await prisma.cloudEvent.findMany({ where: { teamId } })).map((e) => ({
        action: e.action,
        label: e.targetLabel,
        details: e.details,
      }));
    const details = { from: studioSlug, to: clientSlug, monitors: 1, git: 'none' };
    expect(await actions(studio.id)).toContainEqual({
      action: 'project.transferred_out',
      label: slug,
      details,
    });
    expect(await actions(client.id)).toContainEqual({
      action: 'project.transferred_in',
      label: slug,
      details,
    });
    const told = sent.filter((m) => m.subject.includes('Shop'));
    expect(told.map((m) => m.to)).toEqual([grace.email]);
    expect(told[0]!.subject).toBe('Ada ha movido Shop a Client en Codeqlick Cloud');
    expect(told[0]!.text).toContain(`/es/console/${clientSlug}/${slug}`);

    // Moving it back needs an owner of the client team: Ada is only an admin there.
    await request(server).post(url).set(adaAuth).send({ team: studioSlug }).expect(403);
  });
});
