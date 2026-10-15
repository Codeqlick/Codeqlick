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
const password = 'support-password-1';
const admin = { email: `e2e-support-admin-${tag}@codeqlick.test`, password };
const client = { email: `e2e-support-client-${tag}@codeqlick.test`, password };
const other = { email: `e2e-support-other-${tag}@codeqlick.test`, password };

describe('Support requests (e2e)', () => {
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
  });

  it('lets a client open a request and talk it through with the team until it is closed', async () => {
    const server = app.getHttpServer();
    const bearer = async (user: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`,
    });
    const clientAuth = await bearer(client);
    const adminAuth = await bearer(admin);
    const otherAuth = await bearer(other);

    // Only their own projects; validation first.
    await request(server)
      .post('/v1/portal/tickets')
      .set(clientAuth)
      .send({ type: 'BUG', title: 'x', body: 'y', projectId: ids.otherProject })
      .expect(400);
    const opened = await request(server)
      .post('/v1/portal/tickets')
      .set(clientAuth)
      .send({
        type: 'BUG',
        priority: 'HIGH',
        title: 'El carrito no suma el envío',
        body: 'Al añadir dos productos el total no incluye el envío.',
        projectId: ids.project,
      })
      .expect(201);
    const id = opened.body.id as string;
    expect(opened.body).toMatchObject({
      status: 'OPEN',
      priority: 'HIGH',
      project: { name: 'Tienda online' },
      messages: [{ author: { name: 'Grace', team: false } }],
    });
    expect(opened.body.number).toEqual(expect.any(Number));
    await vi.waitFor(() =>
      expect(sent.at(-1)).toMatchObject({
        replyTo: client.email,
        subject: `New support request #${opened.body.number as number}: El carrito no suma el envío`,
      }),
    );

    // Another client can't see it; admins can't open one.
    await request(server).get(`/v1/portal/tickets/${id}`).set(otherAuth).expect(404);
    await request(server)
      .post('/v1/portal/tickets')
      .set(adminAuth)
      .send({ type: 'QUESTION', title: 'x', body: 'y' })
      .expect(400);

    // The team answers: the request waits for the client, who is emailed in Spanish.
    const answered = await request(server)
      .post(`/v1/admin/tickets/${id}/messages`)
      .set(adminAuth)
      .send({ body: 'Lo vemos. ¿Pasa también en móvil?' })
      .expect(201);
    expect(answered.body.status).toBe('WAITING_CLIENT');
    await vi.waitFor(() =>
      expect(sent.at(-1)).toMatchObject({
        to: client.email,
        subject: `Respuesta a tu petición #${opened.body.number as number}`,
      }),
    );

    // The client replies: back with the team.
    const replied = await request(server)
      .post(`/v1/portal/tickets/${id}/messages`)
      .set(clientAuth)
      .send({ body: 'Sí, también en móvil.' })
      .expect(201);
    expect(replied.body.status).toBe('IN_PROGRESS');
    expect(replied.body.messages).toHaveLength(3);

    // Resolved: the client is told; the admin list filters by open ones.
    const resolved = await request(server)
      .patch(`/v1/admin/tickets/${id}`)
      .set(adminAuth)
      .send({ status: 'RESOLVED', priority: 'NORMAL' })
      .expect(200);
    expect(resolved.body).toMatchObject({ status: 'RESOLVED', resolvedAt: expect.any(String) });
    await vi.waitFor(() =>
      expect(sent.at(-1)?.subject).toBe(`Tu petición #${opened.body.number as number}: Resuelta`),
    );
    const active = await request(server)
      .get('/v1/admin/tickets?active=true&pageSize=100')
      .set(adminAuth)
      .expect(200);
    expect(active.body.items.map((t: { id: string }) => t.id)).not.toContain(id);

    // The client closes it; a closed request takes no more messages.
    await request(server).post(`/v1/portal/tickets/${id}/close`).set(clientAuth).expect(200);
    await request(server)
      .post(`/v1/portal/tickets/${id}/messages`)
      .set(clientAuth)
      .send({ body: 'Una cosa más' })
      .expect(409);
    const mine = await request(server).get('/v1/portal/tickets').set(clientAuth).expect(200);
    expect(mine.body.items).toEqual([expect.objectContaining({ id, status: 'CLOSED' })]);
  });
});
