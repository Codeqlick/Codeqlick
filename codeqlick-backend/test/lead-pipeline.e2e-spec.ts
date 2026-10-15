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
const admin = { email: `e2e-pipeline-admin-${tag}@codeqlick.test`, password: 'pipeline-pass-1' };
const leadEmail = `e2e-pipeline-lead-${tag}@codeqlick.test`;

describe('Lead pipeline (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const sent: MailMessage[] = [];

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
    await prisma.user.create({
      data: {
        email: admin.email,
        name: 'Luis',
        role: Role.ADMIN,
        passwordHash: await argon2.hash(admin.password, { type: argon2.argon2id }),
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      const client = await prisma.user.findUnique({ where: { email: leadEmail } });
      if (client) await prisma.clientProject.deleteMany({ where: { clientId: client.id } });
      await prisma.lead.deleteMany({ where: { email: leadEmail } });
      await prisma.user.deleteMany({ where: { email: { in: [admin.email, leadEmail] } } });
    }
    await app?.close();
  });

  it('follows a lead through the stages and turns it into a client with a project', async () => {
    const server = app.getHttpServer();
    const auth = {
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(admin).expect(200)).body.accessToken as string}`,
    };
    const lead = await prisma.lead.create({
      data: {
        name: 'Marta',
        email: leadEmail,
        company: 'Panadería Sol',
        message: 'Queremos una tienda.',
        locale: Locale.ES,
      },
    });
    const url = `/v1/admin/leads/${lead.id}`;

    // Old statuses are gone; the new ones and the follow-up date are accepted.
    await request(server).patch(url).set(auth).send({ status: 'QUALIFIED' }).expect(400);
    const call = await request(server)
      .patch(url)
      .set(auth)
      .send({ status: 'CALL', followUpOn: '2026-11-03' })
      .expect(200);
    expect(call.body).toMatchObject({ status: 'CALL', followUpOn: '2026-11-03', lostReason: null });

    // A reason sticks only while the lead is lost.
    const lost = await request(server)
      .patch(url)
      .set(auth)
      .send({ status: 'LOST', lostReason: 'PRICE' })
      .expect(200);
    expect(lost.body.lostReason).toBe('PRICE');
    const back = await request(server)
      .patch(url)
      .set(auth)
      .send({ status: 'PROPOSAL' })
      .expect(200);
    expect(back.body.lostReason).toBeNull();

    // Convert: a client account with the welcome email, a project in Discovery, the lead won.
    const converted = await request(server).post(`${url}/convert`).set(auth).send({}).expect(201);
    expect(converted.body).toMatchObject({
      lead: { status: 'WON', followUpOn: null },
      client: { created: true, invitationSent: true },
      project: { name: 'Panadería Sol' },
    });
    expect(converted.body.lead.clientId).toBe(converted.body.client.id);
    expect(sent.at(-1)).toMatchObject({ to: leadEmail });
    expect(sent.at(-1)?.subject).toContain('Bienvenido');
    const project = await prisma.clientProject.findUniqueOrThrow({
      where: { id: converted.body.project.id as string },
    });
    expect(project).toMatchObject({ clientId: converted.body.client.id, phase: 'DISCOVERY' });

    await request(server).post(`${url}/convert`).set(auth).send({}).expect(409);

    const stats = await request(server).get('/v1/admin/stats').set(auth).expect(200);
    expect(Array.isArray(stats.body.leads.lostReasons)).toBe(true);
  });

  it("won't turn an admin's email into a client", async () => {
    const server = app.getHttpServer();
    const auth = {
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(admin).expect(200)).body.accessToken as string}`,
    };
    const lead = await prisma.lead.create({
      data: {
        name: 'Luis',
        email: admin.email,
        message: 'Prueba de conversión.',
        locale: Locale.ES,
      },
    });
    try {
      const refused = await request(server)
        .post(`/v1/admin/leads/${lead.id}/convert`)
        .set(auth)
        .send({})
        .expect(409);
      expect(refused.body.detail).toBe('This email belongs to an admin account');
    } finally {
      await prisma.lead.delete({ where: { id: lead.id } });
    }
  });
});
