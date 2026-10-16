import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Role } from '../src/generated/prisma/client.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: the public form allows 5 posts per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'form-password-1';
const admin = { email: `e2e-form-admin-${tag}@codeqlick.test`, password };
const site = 'https://peluqueria-e2e.test';

describe('Site forms (e2e)', () => {
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
          email: `e2e-form-client-${tag}@codeqlick.test`,
          name: 'Marta',
          role: Role.CLIENT,
          passwordHash,
        },
      })
    ).id;
    ids.project = (
      await prisma.clientProject.create({
        data: { clientId: ids.client, name: 'Peluquería Marta', productionUrl: `${site}/` },
      })
    ).id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.clientProject.deleteMany({ where: { clientId: ids.client! } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
  });

  it('emails the messages of a site to the client and sends the visitor back', async () => {
    const server = app.getHttpServer();
    const login = await request(server).post('/v1/auth/login').send(admin).expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
    const settings = `/v1/admin/projects/${ids.project}/form`;

    expect((await request(server).get(settings).set(auth).expect(200)).body).toEqual({
      enabled: false,
    });
    await request(server)
      .put(settings)
      .set(auth)
      .send({ enabled: true, recipients: ['no-es-un-email'] })
      .expect(400);
    const saved = await request(server)
      .put(settings)
      .set(auth)
      .send({ enabled: true, recipients: ['Marta@Peluqueria.test'] })
      .expect(200);
    expect(saved.body).toMatchObject({
      enabled: true,
      recipients: ['marta@peluqueria.test'],
      origins: [site],
      submissions: 0,
    });
    const key = saved.body.key as string;
    const post = (from: string) =>
      request(server)
        .post(`/v1/forms/${key}`)
        .set('Origin', from)
        .set('Referer', `${from}/contacto#form`)
        .type('form');

    // A plain HTML form: sent, then back to the page with the result.
    const ok = await post(site)
      .send({ name: 'Ana', email: 'ana@example.com', phone: '600 000 000', message: 'Cita?' })
      .expect(303);
    expect(ok.headers.location).toBe(`${site}/contacto?form=ok#form`);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'marta@peluqueria.test', replyTo: 'ana@example.com' });
    expect(sent[0]?.subject).toBe('Nuevo mensaje desde peluqueria-e2e.test: Ana');
    expect(sent[0]?.text).toContain('600 000 000');

    // Missing fields: back with an error, nothing sent.
    const bad = await post(site).send({ name: 'Ana', email: 'ana' }).expect(303);
    expect(bad.headers.location).toBe(`${site}/contacto?form=error#form`);
    // Another site using the key: refused.
    await post('https://otra-web.test')
      .send({ name: 'X', email: 'x@x.es', message: 'Hola' })
      .expect(403);
    // A bot filling in the honeypot (as JSON): "ok", nothing sent.
    const bot = await request(server)
      .post(`/v1/forms/${key}`)
      .send({ name: 'Bot', email: 'bot@spam.test', message: 'Buy', website: 'http://spam' })
      .expect(200);
    expect(bot.body).toEqual({ ok: true });
    expect(sent).toHaveLength(1);

    const after = await request(server).get(settings).set(auth).expect(200);
    expect(after.body.submissions).toBe(1);
    expect(after.body.lastSubmissionAt).not.toBeNull();

    // A new key stops the old one.
    const replaced = await request(server).post(`${settings}/key`).set(auth).expect(200);
    expect(replaced.body.key).not.toBe(key);
    await post(site).send({ name: 'Ana', email: 'ana@example.com', message: 'Hola' }).expect(404);
  });
});
