import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Role } from '../src/generated/prisma/client.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'account-password-1';
const people = {
  ana: `e2e-acc-ana-${tag}@codeqlick.test`,
  owner: `e2e-acc-owner-${tag}@codeqlick.test`,
  admin: `e2e-acc-admin-${tag}@codeqlick.test`,
};

describe('Own account: name, email, export, deletion (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const sent: MailMessage[] = [];
  const tokens: Record<string, string> = {};

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
      data: { email: people.ana, name: 'Ana', role: Role.CLIENT, passwordHash },
    });
    const owner = await prisma.user.create({
      data: { email: people.owner, name: 'Olga', role: Role.CLIENT, passwordHash },
    });
    await prisma.clientProject.create({ data: { clientId: owner.id, name: `Web ${tag}` } });
    await prisma.user.create({
      data: { email: people.admin, name: 'Adam', role: Role.ADMIN, passwordHash },
    });
    for (const [who, email] of Object.entries(people)) {
      const login = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password })
        .expect(200);
      tokens[who] = (login.body as { accessToken: string }).accessToken;
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.clientProject.deleteMany({ where: { name: `Web ${tag}` } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
  });

  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

  it('changes the name and the language of the emails', async () => {
    const res = await request(app.getHttpServer())
      .patch('/v1/auth/me')
      .set(auth('ana'))
      .send({ name: 'Ana María', locale: 'es' })
      .expect(200);
    expect(res.body).toMatchObject({ name: 'Ana María', email: people.ana });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: people.ana } });
    expect(user.locale).toBe('ES');
  });

  it('changes the email only once the new address confirms it', async () => {
    const server = app.getHttpServer();
    const newEmail = `e2e-acc-ana2-${tag}@codeqlick.test`;
    await request(server)
      .post('/v1/auth/email')
      .set(auth('ana'))
      .send({ email: newEmail, password: 'wrong-password', locale: 'es' })
      .expect(400);
    await request(server)
      .post('/v1/auth/email')
      .set(auth('ana'))
      .send({ email: people.owner, password, locale: 'es' })
      .expect(409);
    await request(server)
      .post('/v1/auth/email')
      .set(auth('ana'))
      .send({ email: newEmail, password, locale: 'es' })
      .expect(202);

    // Nothing changes until the link is opened.
    expect(await prisma.user.count({ where: { email: people.ana } })).toBe(1);
    const mail = sent.find((message) => message.to === newEmail);
    expect(mail?.subject).toBe('Confirma tu nuevo correo — Codeqlick');
    const token = /confirm-email\?token=([\w-]+)/.exec(mail?.text ?? '')?.[1] ?? '';
    expect(token).not.toBe('');

    const res = await request(server).post('/v1/auth/email/confirm').send({ token }).expect(200);
    expect(res.body).toEqual({ email: newEmail });
    expect(await prisma.user.count({ where: { email: newEmail } })).toBe(1);
    // The old address is told, the link is spent and every session has ended.
    expect(sent.some((m) => m.to === people.ana && /ha cambiado/.test(m.subject))).toBe(true);
    await request(server).post('/v1/auth/email/confirm').send({ token }).expect(400);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: newEmail } });
    expect(await prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    people.ana = newEmail;
  });

  it('lets each person hold a unique username, free again once they change it', async () => {
    const server = app.getHttpServer();
    const name = `ana_${tag}`;
    const mine = await request(server)
      .put('/v1/auth/me/username')
      .set(auth('ana'))
      .send({ username: `  Ana_${tag.toUpperCase()} ` })
      .expect(200);
    expect(mine.body).toMatchObject({ username: name });
    const me = await request(server).get('/v1/auth/me').set(auth('ana')).expect(200);
    expect(me.body.username).toBe(name);

    // Taken for anyone else, available for its owner.
    const check = await request(server)
      .get('/v1/auth/username/available')
      .query({ username: name.toUpperCase() })
      .set(auth('owner'))
      .expect(200);
    expect(check.body).toEqual({ username: name, available: false, reason: 'taken' });
    const own = await request(server)
      .get('/v1/auth/username/available')
      .query({ username: name })
      .set(auth('ana'))
      .expect(200);
    expect(own.body.available).toBe(true);
    await request(server)
      .put('/v1/auth/me/username')
      .set(auth('owner'))
      .send({ username: name })
      .expect(409);

    // Rules: reserved, too short, odd characters, two dots.
    for (const bad of ['admin', 'ab', 'ana-maria', 'ana..m']) {
      await request(server)
        .put('/v1/auth/me/username')
        .set(auth('owner'))
        .send({ username: bad })
        .expect(400);
    }

    // Ana changes hers: the old one is free at once.
    await request(server)
      .put('/v1/auth/me/username')
      .set(auth('ana'))
      .send({ username: `ana.m_${tag}` })
      .expect(200);
    const taken = await request(server)
      .put('/v1/auth/me/username')
      .set(auth('owner'))
      .send({ username: name })
      .expect(200);
    expect(taken.body.username).toBe(name);
    await request(server)
      .put('/v1/auth/me/username')
      .set(auth('owner'))
      .send({ username: null })
      .expect(200);
    const log = await prisma.activityLog.findFirst({
      where: { action: 'account.username_changed', targetLabel: `@ana.m_${tag}` },
    });
    expect(log).not.toBeNull();
  });

  it('keeps one profile photo, public, replaced and removed with its file', async () => {
    const server = app.getHttpServer();
    const photo = (color: string) =>
      sharp({ create: { width: 640, height: 480, channels: 3, background: color } })
        .jpeg()
        .toBuffer();
    const first = await request(server)
      .post('/v1/auth/me/avatar')
      .set(auth('ana'))
      .attach('file', await photo('#d9177e'), 'me.jpg')
      .expect(201);
    const firstFile = first.body.avatar as string;
    expect(firstFile).toMatch(/^[0-9a-f-]{36}\.webp$/);
    const served = await request(server).get(`/v1/avatars/${firstFile}`).expect(200);
    expect(served.headers['content-type']).toBe('image/webp');
    expect((await sharp(served.body as Buffer).metadata()).width).toBe(256);

    const second = await request(server)
      .post('/v1/auth/me/avatar')
      .set(auth('ana'))
      .attach('file', await photo('#14101f'), 'me.jpg')
      .expect(201);
    expect(second.body.avatar).not.toBe(firstFile);
    await request(server).get(`/v1/avatars/${firstFile}`).expect(404);
    const me = await request(server).get('/v1/auth/me').set(auth('ana')).expect(200);
    expect(me.body.avatar).toBe(second.body.avatar);

    await request(server)
      .post('/v1/auth/me/avatar')
      .set(auth('ana'))
      .attach('file', Buffer.from('not an image'), 'me.jpg')
      .expect(400);
    const removed = await request(server).delete('/v1/auth/me/avatar').set(auth('ana')).expect(200);
    expect(removed.body.avatar).toBeNull();
    await request(server)
      .get(`/v1/avatars/${second.body.avatar as string}`)
      .expect(404);
  });

  it("exports the person's data", async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/auth/me/export')
      .set(auth('owner'))
      .expect(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="codeqlick-/);
    const body = res.body as { user: { email: string }; projects: { name: string }[] };
    expect(body.user.email).toBe(people.owner);
    expect(body.projects.map((p) => p.name)).toEqual([`Web ${tag}`]);
    expect(JSON.stringify(body)).not.toContain('passwordHash');
  });

  it('deletes the account, except admins and clients with projects', async () => {
    const server = app.getHttpServer();
    await request(server).delete('/v1/auth/me').set(auth('admin')).send({ password }).expect(403);
    await request(server).delete('/v1/auth/me').set(auth('owner')).send({ password }).expect(409);
    await request(server)
      .delete('/v1/auth/me')
      .set(auth('ana'))
      .send({ password: 'wrong-password' })
      .expect(400);

    // Ana's token outlived the email change (access tokens last minutes): still her account.
    await request(server).delete('/v1/auth/me').set(auth('ana')).send({ password }).expect(204);
    expect(await prisma.user.count({ where: { email: people.ana } })).toBe(0);
    expect(sent.some((m) => m.to === people.ana && /eliminado/.test(m.subject))).toBe(true);
  });
});
