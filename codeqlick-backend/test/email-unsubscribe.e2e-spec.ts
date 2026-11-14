import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Locale, Role } from '../src/generated/prisma/client.js';
import { makeUnsubscribeToken } from '../src/modules/auth/unsubscribe-token.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: the browser routes are limited to 30 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const email = `lin-${tag}@codeqlick.test`;
const goneEmail = `gone-${tag}@codeqlick.test`;
const secret = process.env.JWT_ACCESS_SECRET!;

describe('One-click unsubscribe from optional emails (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let userId = '';
  let goneToken = '';

  const preferences = async () =>
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { weeklyDigest: true, monthlyReport: true },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    userId = (
      await prisma.user.create({
        // A deactivated account is treated like any other: the preference is just stored.
        data: { email, name: 'Lin', role: Role.CLIENT, passwordHash: 'x', isActive: false },
      })
    ).id;
    const gone = await prisma.user.create({
      data: { email: goneEmail, name: 'Gone', role: Role.CLIENT, passwordHash: 'x' },
    });
    goneToken = makeUnsubscribeToken({ userId: gone.id, kind: 'digest' }, secret);
    await prisma.user.delete({ where: { id: gone.id } });
  });

  afterAll(async () => {
    if (prisma) await prisma.user.deleteMany({ where: { email: { in: [email, goneEmail] } } });
    await app?.close();
  });

  it('shows what a link is about without changing anything', async () => {
    const server = app.getHttpServer();
    const token = makeUnsubscribeToken({ userId, kind: 'digest' }, secret);
    for (let i = 0; i < 2; i += 1) {
      await request(server)
        .get('/v1/email/preferences')
        .query({ token })
        .expect(200, { kind: 'digest', subscribed: true, email: `l***@codeqlick.test` });
    }
    expect(await preferences()).toEqual({ weeklyDigest: true, monthlyReport: true });
  });

  it("sends a browser opening the one-click URL to the website's page, changing nothing", async () => {
    const server = app.getHttpServer();
    const site = process.env.SITE_URL!.replace(/\/+$/, '');
    const token = makeUnsubscribeToken({ userId, kind: 'digest' }, secret);
    await request(server)
      .get('/v1/email/unsubscribe')
      .query({ token })
      .expect(302)
      .expect('Location', `${site}/en/email/unsubscribe?token=${token}`);
    await prisma.user.update({ where: { id: userId }, data: { locale: Locale.ES } });
    await request(server)
      .get('/v1/email/unsubscribe')
      .query({ token })
      .expect(302)
      .expect('Location', `${site}/es/email/unsubscribe?token=${token}`);
    // A wrong token still goes to the page, which says the link is invalid.
    await request(server)
      .get('/v1/email/unsubscribe')
      .query({ token: goneToken })
      .expect(302)
      .expect('Location', `${site}/en/email/unsubscribe?token=${goneToken}`);
    expect(await preferences()).toEqual({ weeklyDigest: true, monthlyReport: true });
  });

  it("turns one email off with the mail provider's form-urlencoded one-click POST", async () => {
    const server = app.getHttpServer();
    const token = makeUnsubscribeToken({ userId, kind: 'report' }, secret);
    for (let i = 0; i < 2; i += 1) {
      // Twice: the same answer when it already was off.
      const response = await request(server)
        .post('/v1/email/unsubscribe')
        .query({ token })
        .type('form')
        .send('List-Unsubscribe=One-Click')
        .expect(204);
      expect(response.text).toBe('');
    }
    expect(await preferences()).toEqual({ weeklyDigest: true, monthlyReport: false });
    await request(server)
      .get('/v1/email/preferences')
      .query({ token })
      .expect(200, { kind: 'report', subscribed: false, email: `l***@codeqlick.test` });
  });

  it("switches it off and back on from the website's buttons", async () => {
    const server = app.getHttpServer();
    const token = makeUnsubscribeToken({ userId, kind: 'digest' }, secret);
    await request(server)
      .put('/v1/email/preferences')
      .send({ token, subscribed: false })
      .expect(200, { kind: 'digest', subscribed: false, email: `l***@codeqlick.test` });
    expect(await preferences()).toEqual({ weeklyDigest: false, monthlyReport: false });
    await request(server)
      .put('/v1/email/preferences')
      .send({ token, subscribed: true })
      .expect(200, { kind: 'digest', subscribed: true, email: `l***@codeqlick.test` });
    expect(await preferences()).toEqual({ weeklyDigest: true, monthlyReport: false });
    await request(server)
      .put('/v1/email/preferences')
      .send({ token, subscribed: 'no' })
      .expect(400);
  });

  it('answers 404 alike for a forged link and a deleted account', async () => {
    const server = app.getHttpServer();
    const valid = makeUnsubscribeToken({ userId, kind: 'digest' }, secret);
    const forged = [
      makeUnsubscribeToken({ userId, kind: 'digest' }, 'another-secret'),
      `${valid.split('.')[0]}.${'A'.repeat(43)}`,
      valid.slice(0, -2),
      'not-a-token',
      '',
    ];
    const answers: unknown[] = [];
    for (const token of [...forged, goneToken]) {
      const get = await request(server).get('/v1/email/preferences').query({ token }).expect(404);
      await request(server).post('/v1/email/unsubscribe').query({ token }).expect(404);
      await request(server)
        .put('/v1/email/preferences')
        .send({ token, subscribed: false })
        .expect(404);
      answers.push(get.body.detail);
    }
    expect(new Set(answers).size).toBe(1);
    await request(server).post('/v1/email/unsubscribe').expect(404);
    expect(await preferences()).toEqual({ weeklyDigest: true, monthlyReport: false });
  });
});
