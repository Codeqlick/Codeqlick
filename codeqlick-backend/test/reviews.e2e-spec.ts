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
const password = 'review-password-1';
const admin = { email: `e2e-review-admin-${tag}@codeqlick.test`, password };
const client = { email: `e2e-review-client-${tag}@codeqlick.test`, password };
const other = { email: `e2e-review-other-${tag}@codeqlick.test`, password };

describe('Client reviews (e2e)', () => {
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

  it('asks for a review on launch, and publishes it only with consent', async () => {
    const server = app.getHttpServer();
    const bearer = async (user: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`,
    });
    const adminAuth = await bearer(admin);
    const clientAuth = await bearer(client);
    const otherAuth = await bearer(other);
    const portal = `/v1/portal/projects/${ids.project}/review`;
    const teamPath = `/v1/admin/projects/${ids.project}/review`;
    const quote = 'Nos entendieron a la primera y entregaron antes de lo previsto.';

    // Not asked for: nothing to send.
    await request(server)
      .put(portal)
      .set(clientAuth)
      .send({ rating: 5, quote, authorName: 'Grace', consent: true, locale: 'es' })
      .expect(400);

    // Launching the project asks the client, once.
    const before = sent.length;
    await request(server)
      .patch(`/v1/admin/projects/${ids.project}`)
      .set(adminAuth)
      .send({ phase: 'LAUNCHED' })
      .expect(200);
    await vi.waitFor(() => expect(sent.length).toBe(before + 1));
    expect(sent.at(-1)).toMatchObject({
      to: client.email,
      subject: 'Tienda online ya está en marcha: ¿qué tal ha ido?',
    });
    await request(server)
      .patch(`/v1/admin/projects/${ids.project}`)
      .set(adminAuth)
      .send({ phase: 'SUPPORT' })
      .expect(200);
    await request(server)
      .patch(`/v1/admin/projects/${ids.project}`)
      .set(adminAuth)
      .send({ phase: 'LAUNCHED' })
      .expect(200);
    expect(sent.length).toBe(before + 1);

    const asked = await request(server).get(portal).set(clientAuth).expect(200);
    expect(asked.body.status).toBe('REQUESTED');
    await request(server).get(portal).set(otherAuth).expect(404);

    // Sent without consent: it can't go on the website.
    await request(server)
      .put(portal)
      .set(clientAuth)
      .send({ rating: 6, quote, authorName: 'Grace', consent: false, locale: 'es' })
      .expect(400);
    const sentReview = await request(server)
      .put(portal)
      .set(clientAuth)
      .send({
        rating: 5,
        quote,
        authorName: 'Grace',
        authorRole: 'CEO, Tienda',
        consent: false,
        locale: 'es',
      })
      .expect(200);
    expect(sentReview.body).toMatchObject({ status: 'SUBMITTED', rating: 5, consent: false });
    await vi.waitFor(() => expect(sent.at(-1)?.subject).toBe('Tienda online: review 5/5'));
    await request(server)
      .put(`${teamPath}/status`)
      .set(adminAuth)
      .send({ status: 'PUBLISHED' })
      .expect(400);

    // With consent: published, on the Spanish site only, until hidden.
    await request(server)
      .put(portal)
      .set(clientAuth)
      .send({
        rating: 5,
        quote,
        authorName: 'Grace',
        authorRole: 'CEO, Tienda',
        consent: true,
        locale: 'es',
      })
      .expect(200);
    const published = await request(server)
      .put(`${teamPath}/status`)
      .set(adminAuth)
      .send({ status: 'PUBLISHED' })
      .expect(200);
    expect(published.body).toMatchObject({ status: 'PUBLISHED', publishedAt: expect.any(String) });
    const es = await request(server).get('/v1/reviews?locale=es').expect(200);
    expect(es.body).toEqual(
      expect.arrayContaining([{ quote, author: 'Grace', role: 'CEO, Tienda', rating: 5 }]),
    );
    const en = await request(server).get('/v1/reviews?locale=en').expect(200);
    expect(en.body.map((r: { quote: string }) => r.quote)).not.toContain(quote);
    await request(server)
      .put(`${teamPath}/status`)
      .set(adminAuth)
      .send({ status: 'HIDDEN' })
      .expect(200);
    const hidden = await request(server).get('/v1/reviews?locale=es').expect(200);
    expect(hidden.body.map((r: { quote: string }) => r.quote)).not.toContain(quote);
  });
});
