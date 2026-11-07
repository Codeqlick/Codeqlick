import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Locale, Role } from '../src/generated/prisma/client.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'monitor-password-1';
const admin = { email: `e2e-monitor-admin-${tag}@codeqlick.test`, password };
const client = { email: `e2e-monitor-client-${tag}@codeqlick.test`, password };
const other = { email: `e2e-monitor-other-${tag}@codeqlick.test`, password };

describe('Client site monitoring (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const sent: MailMessage[] = [];
  const ids: Record<string, string> = {};
  // A stand-in for the client's site: answers with `siteStatus`.
  let siteStatus = 200;
  let site: Server;
  let siteUrl = '';

  beforeAll(async () => {
    site = createServer((_req, res) => {
      res.writeHead(siteStatus, { 'Content-Type': 'text/plain' });
      res.end('ok');
    });
    await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
    siteUrl = `http://127.0.0.1:${(site.address() as AddressInfo).port}/`;
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
      await prisma.supportTicket.deleteMany({
        where: { clientId: { in: [ids.client!, ids.other!] } },
      });
      await prisma.clientProject.deleteMany({
        where: { clientId: { in: [ids.client!, ids.other!] } },
      });
      await prisma.user.deleteMany({
        where: { email: { in: [admin.email, client.email, other.email] } },
      });
    }
    await app?.close();
    await new Promise((resolve) => site?.close(resolve));
  });

  it('checks the site, alerts on two failures and its return, and shows the status to the client', async () => {
    const server = app.getHttpServer();
    const bearer = async (user: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`,
    });
    const adminAuth = await bearer(admin);
    const clientAuth = await bearer(client);
    const otherAuth = await bearer(other);
    const monitor = `/v1/admin/projects/${ids.project}/monitor`;
    const status = `/v1/portal/projects/${ids.project}/status`;

    // A project needs its production address to be monitored.
    await request(server).put(monitor).set(adminAuth).send({ enabled: true }).expect(400);
    await request(server).get(status).set(clientAuth).expect(404);
    await request(server)
      .patch(`/v1/admin/projects/${ids.project}`)
      .set(adminAuth)
      .send({ productionUrl: siteUrl })
      .expect(200);

    // Enabling it checks it at once.
    const enabled = await request(server)
      .put(monitor)
      .set(adminAuth)
      .send({ enabled: true })
      .expect(200);
    expect(enabled.body).toMatchObject({ enabled: true, status: 'UP', url: siteUrl, uptime30: 1 });
    expect(enabled.body.days).toHaveLength(30);

    // One failure is not an outage; two are, and the team is told once.
    siteStatus = 500;
    const before = sent.length;
    const once = await request(server).post(`${monitor}/check`).set(adminAuth).expect(200);
    expect(once.body).toMatchObject({ status: 'UP', lastError: 'HTTP 500' });
    const twice = await request(server).post(`${monitor}/check`).set(adminAuth).expect(200);
    expect(twice.body.status).toBe('DOWN');
    await vi.waitFor(() => expect(sent.length).toBe(before + 1));
    expect(sent.at(-1)?.subject).toBe(`[codeqlick] DOWN: Tienda online (${siteUrl})`);
    await request(server).post(`${monitor}/check`).set(adminAuth).expect(200);
    expect(sent.length).toBe(before + 1);

    // Back up: the team is told.
    siteStatus = 200;
    const back = await request(server).post(`${monitor}/check`).set(adminAuth).expect(200);
    expect(back.body).toMatchObject({ status: 'UP', lastError: null });
    await vi.waitFor(() => expect(sent.at(-1)?.subject).toBe('[codeqlick] Back up: Tienda online'));
    expect(back.body.uptime30).toBe(0.4);

    // The client sees it; others don't; the list has it.
    const forClient = await request(server).get(status).set(clientAuth).expect(200);
    expect(forClient.body).toMatchObject({ status: 'UP', uptime30: 0.4 });
    await request(server).get(status).set(otherAuth).expect(404);
    const list = await request(server).get('/v1/admin/monitoring').set(adminAuth).expect(200);
    expect(list.body.map((m: { projectId: string }) => m.projectId)).toContain(ids.project);

    // Turned off: hidden from the client.
    await request(server).put(monitor).set(adminAuth).send({ enabled: false }).expect(200);
    await request(server).get(status).set(clientAuth).expect(404);
  });
});
