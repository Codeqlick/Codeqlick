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

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const admin = { email: `e2e-invite-admin-${tag}@codeqlick.test`, password: 'invite-password-1' };
const invitedEmail = `e2e-invite-client-${tag}@codeqlick.test`;

describe('Welcome emails (e2e)', () => {
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
        name: 'E2E Invite',
        role: Role.ADMIN,
        passwordHash: await argon2.hash(admin.password, { type: argon2.argon2id }),
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { email: { in: [admin.email, invitedEmail] } } });
    }
    await app?.close();
  });

  it('creates an account without a password and lets the user choose it from the email', async () => {
    const server = app.getHttpServer();
    const login = await request(server).post('/v1/auth/login').send(admin).expect(200);
    const auth = `Bearer ${login.body.accessToken as string}`;

    const created = await request(server)
      .post('/v1/admin/users')
      .set('Authorization', auth)
      .send({ email: invitedEmail, name: 'Grace', role: 'CLIENT', locale: 'es' })
      .expect(201);
    expect(created.body.invitationSent).toBe(true);
    const userId = created.body.id as string;

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(invitedEmail);
    expect(sent[0]?.subject).toContain('Bienvenido');
    const token = /\/es\/reset-password\?token=([\w-]+)&welcome=1/.exec(sent[0]?.text ?? '')?.[1];
    expect(token).toBeDefined();

    // Sending it again replaces the link: only the latest one works.
    await request(server)
      .post(`/v1/admin/users/${userId}/invitation`)
      .set('Authorization', auth)
      .send({ locale: 'en' })
      .expect(204);
    expect(sent).toHaveLength(2);
    expect(sent[1]?.subject).toContain('Welcome');
    const latest = /\/en\/reset-password\?token=([\w-]+)&welcome=1/.exec(sent[1]?.text ?? '')?.[1];
    expect(latest).toBeDefined();

    const password = 'chosen-password-1';
    await request(server)
      .post('/v1/auth/password-reset/confirm')
      .send({ token, newPassword: password })
      .expect(400);
    await request(server)
      .post('/v1/auth/password-reset/confirm')
      .send({ token: latest, newPassword: password })
      .expect(204);
    await request(server)
      .post('/v1/auth/login')
      .send({ email: invitedEmail, password })
      .expect(200);

    const actions = await prisma.activityLog.findMany({
      where: { targetId: userId },
      select: { action: true },
    });
    expect(actions.map((entry) => entry.action).toSorted()).toEqual([
      'user.created',
      'user.invited',
      'user.invited',
    ]);

    // Nothing is sent to a deactivated account, and an unknown one is a 404.
    await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    await request(server)
      .post(`/v1/admin/users/${userId}/invitation`)
      .set('Authorization', auth)
      .send({ locale: 'en' })
      .expect(400);
    await request(server)
      .post(`/v1/admin/users/${randomUUID()}/invitation`)
      .set('Authorization', auth)
      .send({ locale: 'en' })
      .expect(404);
    expect(sent).toHaveLength(2);
  });

  it('keeps the account and tells the admin when the email fails', async () => {
    const server = app.getHttpServer();
    const login = await request(server).post('/v1/auth/login').send(admin).expect(200);
    const auth = `Bearer ${login.body.accessToken as string}`;
    const email = `e2e-invite-fail-${tag}@codeqlick.test`;
    vi.mocked(app.get(MailService).send).mockRejectedValueOnce(new Error('smtp down'));

    try {
      const created = await request(server)
        .post('/v1/admin/users')
        .set('Authorization', auth)
        .send({ email, name: 'Ada', role: 'CLIENT', locale: 'en' })
        .expect(201);
      expect(created.body.invitationSent).toBe(false);

      vi.mocked(app.get(MailService).send).mockRejectedValueOnce(new Error('smtp down'));
      await request(server)
        .post(`/v1/admin/users/${created.body.id as string}/invitation`)
        .set('Authorization', auth)
        .send({ locale: 'en' })
        .expect(503);
    } finally {
      await prisma.user.deleteMany({ where: { email } });
    }
  });
});
