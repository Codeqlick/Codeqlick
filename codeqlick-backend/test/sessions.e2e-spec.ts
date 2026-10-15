import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Role } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const email = `e2e-sessions-${randomUUID().slice(0, 8)}@codeqlick.test`;
const password = 'sessions-password-1';

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

describe('Active sessions (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.create({
      data: {
        email,
        name: 'E2E Sessions',
        role: Role.CLIENT,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      },
    });
  });

  afterAll(async () => {
    if (prisma) await prisma.user.deleteMany({ where: { email } });
    await app?.close();
  });

  it('lists the devices, signs one out and then all the others', async () => {
    const server = app.getHttpServer();
    const signIn = async (userAgent: string): Promise<Tokens> =>
      (
        await request(server)
          .post('/v1/auth/login')
          .set('User-Agent', userAgent)
          .send({ email, password })
          .expect(200)
      ).body as Tokens;
    const list = async (tokens: Tokens) =>
      (
        await request(server)
          .get('/v1/auth/sessions')
          .set('Authorization', `Bearer ${tokens.accessToken}`)
          .expect(200)
      ).body as { id: string; userAgent: string; current: boolean }[];

    const laptop = await signIn('Laptop browser');
    const phone = await signIn('Phone browser');
    const tablet = await signIn('Tablet browser');

    // A refresh keeps the device: still one entry for the laptop, still the current one.
    const refreshed = (
      await request(server)
        .post('/v1/auth/refresh')
        .set('User-Agent', 'Laptop browser')
        .send({ refreshToken: laptop.refreshToken })
        .expect(200)
    ).body as Tokens;
    const sessions = await list(refreshed);
    expect(sessions.map((s) => s.userAgent).toSorted()).toEqual([
      'Laptop browser',
      'Phone browser',
      'Tablet browser',
    ]);
    expect(sessions.filter((s) => s.current).map((s) => s.userAgent)).toEqual(['Laptop browser']);

    // Sign the phone out: its refresh token stops working, and it isn't reported as theft.
    const phoneId = sessions.find((s) => s.userAgent === 'Phone browser')?.id ?? '';
    await request(server)
      .delete(`/v1/auth/sessions/${phoneId}`)
      .set('Authorization', `Bearer ${refreshed.accessToken}`)
      .expect(204);
    await request(server)
      .delete(`/v1/auth/sessions/${phoneId}`)
      .set('Authorization', `Bearer ${refreshed.accessToken}`)
      .expect(404);
    await request(server)
      .post('/v1/auth/refresh')
      .send({ refreshToken: phone.refreshToken })
      .expect(401);
    expect((await list(refreshed)).map((s) => s.userAgent).toSorted()).toEqual([
      'Laptop browser',
      'Tablet browser',
    ]);

    // Everything else: only the laptop remains.
    await request(server)
      .post('/v1/auth/sessions/revoke-others')
      .set('Authorization', `Bearer ${refreshed.accessToken}`)
      .send({ refreshToken: refreshed.refreshToken })
      .expect(204);
    expect((await list(refreshed)).map((s) => s.userAgent)).toEqual(['Laptop browser']);
    await request(server)
      .post('/v1/auth/refresh')
      .send({ refreshToken: tablet.refreshToken })
      .expect(401);
  });
});
