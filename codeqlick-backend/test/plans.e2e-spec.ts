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
const password = 'plan-password-1';
const admin = { email: `e2e-plan-admin-${tag}@codeqlick.test`, password };
const client = { email: `e2e-plan-client-${tag}@codeqlick.test`, password };
const other = { email: `e2e-plan-other-${tag}@codeqlick.test`, password };

describe('Maintenance plans (e2e)', () => {
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

  it('draws the monthly allowance down with the hours and warns the team at the threshold and when used up', async () => {
    const server = app.getHttpServer();
    const bearer = async (user: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`,
    });
    const adminAuth = await bearer(admin);
    const clientAuth = await bearer(client);
    const otherAuth = await bearer(other);
    const plan = `/v1/admin/projects/${ids.project}/plan`;
    const portal = `/v1/portal/projects/${ids.project}/plan`;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(
      new Date(),
    );
    const log = (minutes: number) =>
      request(server)
        .post(`/v1/admin/projects/${ids.project}/time`)
        .set(adminAuth)
        .send({ date: today, minutes, description: 'Mantenimiento' })
        .expect(201);

    expect((await request(server).get(plan).set(adminAuth).expect(200)).body).toEqual({
      active: false,
    });
    await request(server).get(portal).set(clientAuth).expect(404);
    await request(server)
      .put(plan)
      .set(adminAuth)
      .send({ active: true, name: 'Mantenimiento', monthlyMinutes: 30 })
      .expect(400);
    const saved = await request(server)
      .put(plan)
      .set(adminAuth)
      .send({ active: true, name: 'Mantenimiento básico', monthlyMinutes: 120 })
      .expect(200);
    expect(saved.body).toMatchObject({
      alertPercent: 80,
      usedMinutes: 0,
      remainingMinutes: 120,
      percent: 0,
    });
    expect(saved.body.months).toHaveLength(4);

    // 50 %: quiet. 83 %: one warning. 92 %: quiet again. 125 %: used up.
    const before = sent.length;
    await log(60);
    await log(40);
    await vi.waitFor(() => expect(sent.length).toBe(before + 1));
    expect(sent.at(-1)?.subject).toBe('[codeqlick] Tienda online: 83 % of the monthly hours');
    await log(10);
    expect(sent.length).toBe(before + 1);
    await log(40);
    await vi.waitFor(() => expect(sent.length).toBe(before + 2));
    expect(sent.at(-1)?.subject).toBe('[codeqlick] Tienda online: hours used up');

    // The client sees it; others don't; the overview lists it.
    const forClient = await request(server).get(portal).set(clientAuth).expect(200);
    expect(forClient.body).toMatchObject({ usedMinutes: 150, remainingMinutes: 0, percent: 125 });
    await request(server).get(portal).set(otherAuth).expect(404);
    const overview = await request(server).get('/v1/admin/plans').set(adminAuth).expect(200);
    expect(overview.body.plans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          project: expect.objectContaining({ id: ids.project }),
          percent: 125,
        }),
      ]),
    );

    // Paused: hidden from the client.
    await request(server)
      .put(plan)
      .set(adminAuth)
      .send({ active: false, name: 'Mantenimiento básico', monthlyMinutes: 120 })
      .expect(200);
    await request(server).get(portal).set(clientAuth).expect(404);
  });
});
