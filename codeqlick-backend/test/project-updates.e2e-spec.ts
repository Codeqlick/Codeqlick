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
const admin = { email: `e2e-updates-admin-${tag}@codeqlick.test`, password: 'updates-password-1' };
const clientEmail = `e2e-updates-client-${tag}@codeqlick.test`;

describe('Project update emails (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let clientId: string;
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
    const passwordHash = await argon2.hash(admin.password, { type: argon2.argon2id });
    await prisma.user.create({
      data: { email: admin.email, name: 'E2E Updates', role: Role.ADMIN, passwordHash },
    });
    const client = await prisma.user.create({
      data: {
        email: clientEmail,
        name: 'Grace',
        role: Role.CLIENT,
        locale: Locale.ES,
        passwordHash,
      },
    });
    clientId = client.id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.clientProject.deleteMany({ where: { clientId } });
      await prisma.user.deleteMany({ where: { email: { in: [admin.email, clientEmail] } } });
    }
    await app?.close();
  });

  it('emails the client an update in their language, only when asked to', async () => {
    const server = app.getHttpServer();
    const login = await request(server).post('/v1/auth/login').send(admin).expect(200);
    const auth = `Bearer ${login.body.accessToken as string}`;

    const project = await request(server)
      .post('/v1/admin/projects')
      .set('Authorization', auth)
      .send({ clientId, name: 'Tienda online', phase: 'DEVELOPMENT', progress: 40 })
      .expect(201);
    const projectId = project.body.id as string;
    const post = (body: Record<string, unknown>) =>
      request(server)
        .post(`/v1/admin/projects/${projectId}/updates`)
        .set('Authorization', auth)
        .send(body);

    const quiet = await post({ title: 'Nota interna', body: 'Sin aviso.' }).expect(201);
    expect(quiet.body.clientNotified).toBeUndefined();
    expect(sent).toHaveLength(0);

    const long = 'x'.repeat(2000);
    const notified = await post({
      title: 'Diseño aprobado',
      body: long,
      notifyClient: true,
    }).expect(201);
    expect(notified.body.clientNotified).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(clientEmail);
    expect(sent[0]?.subject).toBe('Tienda online: Diseño aprobado');
    expect(sent[0]?.text).toContain('Hola Grace:');
    expect(sent[0]?.text).toContain(`/es/portal/projects/${projectId}`);
    // Long updates are cut; the portal has the rest.
    expect(sent[0]?.text).toContain(`${'x'.repeat(1500)}…`);
    expect(sent[0]?.text).not.toContain('x'.repeat(1501));

    // The admin changes the client's language: the next email follows it.
    await request(server)
      .patch(`/v1/admin/users/${clientId}`)
      .set('Authorization', auth)
      .send({ locale: 'en' })
      .expect(200)
      .expect((response) => expect(response.body.locale).toBe('en'));
    await post({ title: 'Staging is up', body: 'Have a look.', notifyClient: true }).expect(201);
    expect(sent[1]?.text).toContain('Hi Grace,');
    expect(sent[1]?.text).toContain(`/en/portal/projects/${projectId}`);

    // A failed email keeps the update; a deactivated client isn't emailed at all.
    vi.mocked(app.get(MailService).send).mockRejectedValueOnce(new Error('smtp down'));
    const failed = await post({ title: 'Fails', body: 'x', notifyClient: true }).expect(201);
    expect(failed.body.clientNotified).toBe(false);
    await prisma.user.update({ where: { id: clientId }, data: { isActive: false } });
    const inactive = await post({ title: 'Inactive', body: 'x', notifyClient: true }).expect(201);
    expect(inactive.body.clientNotified).toBe(false);
    expect(sent).toHaveLength(2);

    const updates = await prisma.projectUpdate.count({ where: { projectId } });
    expect(updates).toBe(5);
  });
});
