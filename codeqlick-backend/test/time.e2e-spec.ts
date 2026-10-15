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
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'time-password-1';
const admin = { email: `e2e-time-admin-${tag}@codeqlick.test`, password };
const client = { email: `e2e-time-client-${tag}@codeqlick.test`, password };
const other = { email: `e2e-time-other-${tag}@codeqlick.test`, password };

describe('Time tracking (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const sent: MailMessage[] = [];
  const ids: Record<string, string> = {};

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
      data: { email: admin.email, name: 'Luis', role: Role.ADMIN, passwordHash },
    });
    ids.client = (
      await prisma.user.create({
        data: {
          email: client.email,
          name: 'Grace',
          role: Role.CLIENT,
          locale: Locale.ES,
          passwordHash,
        },
      })
    ).id;
    ids.other = (
      await prisma.user.create({
        data: { email: other.email, name: 'Ada', role: Role.CLIENT, passwordHash },
      })
    ).id;
    ids.project = (
      await prisma.clientProject.create({ data: { clientId: ids.client, name: 'Tienda online' } })
    ).id;
    ids.otherProject = (
      await prisma.clientProject.create({ data: { clientId: ids.other, name: 'Otra' } })
    ).id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.clientProject.deleteMany({
        where: { clientId: { in: [ids.client!, ids.other!] } },
      });
      await prisma.user.deleteMany({
        where: { email: { in: [admin.email, client.email, other.email] } },
      });
    }
    await app?.close();
  });

  it('lets the team log hours and shows them to the client only when turned on', async () => {
    const server = app.getHttpServer();
    const bearer = async (user: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`,
    });
    const adminAuth = await bearer(admin);
    const clientAuth = await bearer(client);
    const otherAuth = await bearer(other);
    const path = `/v1/admin/projects/${ids.project}/time`;

    await request(server)
      .post(path)
      .set(adminAuth)
      .send({ date: '2026-09-30', minutes: 0, description: 'x' })
      .expect(400);
    await request(server)
      .post(path)
      .set(clientAuth)
      .send({ date: '2026-09-30', minutes: 60, description: 'x' })
      .expect(403);
    await request(server)
      .post(`/v1/admin/projects/${randomUUID()}/time`)
      .set(adminAuth)
      .send({ date: '2026-09-30', minutes: 60, description: 'x' })
      .expect(404);
    for (const entry of [
      { date: '2026-09-30', minutes: 90, description: 'Reunión de arranque' },
      { date: '2026-10-02', minutes: 240, description: 'Diseño de la portada' },
      { date: '2026-10-05', minutes: 45, description: 'Ajustes' },
    ]) {
      await request(server).post(path).set(adminAuth).send(entry).expect(201);
    }
    const logged = await request(server)
      .post(`/v1/admin/projects/${ids.otherProject}/time`)
      .set(adminAuth)
      .send({ date: '2026-10-03', minutes: 30, description: 'Otra cosa' })
      .expect(201);
    expect(logged.body).toMatchObject({
      date: '2026-10-03',
      minutes: 30,
      author: { name: 'Luis' },
      project: { name: 'Otra' },
    });

    const summary = await request(server).get(path).set(adminAuth).expect(200);
    expect(summary.body).toMatchObject({
      totalMinutes: 375,
      months: [
        { month: '2026-10', minutes: 285 },
        { month: '2026-09', minutes: 90 },
      ],
    });
    expect(summary.body.entries.map((e: { date: string }) => e.date)).toEqual([
      '2026-10-05',
      '2026-10-02',
      '2026-09-30',
    ]);

    // The month view adds every project up.
    const month = await request(server)
      .get('/v1/admin/time?month=2026-10')
      .set(adminAuth)
      .expect(200);
    const mine = month.body.projects.find((p: { id: string }) => p.id === ids.project);
    expect(mine).toMatchObject({ name: 'Tienda online', minutes: 285, client: { name: 'Grace' } });
    expect(
      month.body.projects.find((p: { id: string }) => p.id === ids.otherProject),
    ).toMatchObject({
      minutes: 30,
    });
    await request(server).get('/v1/admin/time?month=2026-13').set(adminAuth).expect(400);

    // Hidden from the client until the project shows them; never to other clients.
    const portal = `/v1/portal/projects/${ids.project}/time`;
    await request(server).get(portal).set(clientAuth).expect(404);
    const project = await request(server)
      .patch(`/v1/admin/projects/${ids.project}`)
      .set(adminAuth)
      .send({ showHours: true })
      .expect(200);
    expect(project.body.showHours).toBe(true);
    const shown = await request(server).get(portal).set(clientAuth).expect(200);
    expect(shown.body.totalMinutes).toBe(375);
    await request(server).get(portal).set(otherAuth).expect(404);

    // Deleting an entry.
    const first = summary.body.entries[0].id as string;
    await request(server).delete(`${path}/${first}`).set(adminAuth).expect(204);
    await request(server).delete(`${path}/${first}`).set(adminAuth).expect(404);
    const after = await request(server).get(portal).set(clientAuth).expect(200);
    expect(after.body.totalMinutes).toBe(330);

    const actions = await prisma.activityLog.findMany({
      where: { targetId: ids.project, action: { startsWith: 'project.time_' } },
      select: { action: true },
    });
    expect(actions.map((entry) => entry.action).toSorted()).toEqual([
      'project.time_deleted',
      'project.time_logged',
      'project.time_logged',
      'project.time_logged',
    ]);
  });
});
