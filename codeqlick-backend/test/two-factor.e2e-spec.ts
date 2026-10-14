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
import { totpCode } from '../src/modules/auth/totp.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const email = `e2e-2fa-${randomUUID().slice(0, 8)}@codeqlick.test`;
const password = 'two-factor-password-1';
const step = () => Math.floor(Date.now() / 30_000);

describe('Two-step verification (e2e)', () => {
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
        name: 'E2E Two Factor',
        role: Role.CLIENT,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      },
    });
  });

  afterAll(async () => {
    if (prisma) await prisma.user.deleteMany({ where: { email } });
    await app?.close();
  });

  it('sets up, signs in with a code or a recovery code, and turns off', async () => {
    const server = app.getHttpServer();
    const login = () => request(server).post('/v1/auth/login').send({ email, password });

    const first = await login().expect(200);
    const auth = { Authorization: `Bearer ${first.body.accessToken as string}` };
    await request(server).get('/v1/auth/2fa').set(auth).expect(200, {
      enabled: false,
      recoveryCodesLeft: 0,
    });

    const setup = await request(server).post('/v1/auth/2fa/setup').set(auth).expect(200);
    const secret = setup.body.secret as string;
    expect(setup.body.otpauthUrl).toContain(`secret=${secret}`);
    const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(stored.totpSecret).not.toContain(secret);

    await request(server)
      .post('/v1/auth/2fa/enable')
      .set(auth)
      .send({ code: '000000' })
      .expect(400);
    const enabled = await request(server)
      .post('/v1/auth/2fa/enable')
      .set(auth)
      .send({ code: totpCode(secret, step()) })
      .expect(200);
    const recoveryCodes = enabled.body.recoveryCodes as string[];
    expect(recoveryCodes).toHaveLength(10);
    await request(server).post('/v1/auth/2fa/setup').set(auth).expect(409);

    // The password alone no longer signs in.
    const challenge = await login().expect(200);
    expect(challenge.body).not.toHaveProperty('accessToken');
    expect(challenge.body.twoFactorRequired).toBe(true);
    const challengeToken = challenge.body.challengeToken as string;
    // The challenge is not an access token.
    await request(server)
      .get('/v1/auth/me')
      .set({ Authorization: `Bearer ${challengeToken}` })
      .expect(401);

    await request(server)
      .post('/v1/auth/2fa/verify')
      .send({ challengeToken, code: '123456' })
      .expect(401);
    const verified = await request(server)
      .post('/v1/auth/2fa/verify')
      .send({ challengeToken, code: recoveryCodes[0] })
      .expect(200);
    expect(verified.body.accessToken).toBeTruthy();
    await request(server).get('/v1/auth/2fa').set(auth).expect(200, {
      enabled: true,
      recoveryCodesLeft: 9,
    });

    // A recovery code works once.
    const again = await login().expect(200);
    await request(server)
      .post('/v1/auth/2fa/verify')
      .send({ challengeToken: again.body.challengeToken, code: recoveryCodes[0] })
      .expect(401);

    // The code accepted when enabling can't be reused; the next one is still in the window.
    await request(server)
      .post('/v1/auth/2fa/disable')
      .set(auth)
      .send({ password: 'wrong-password', code: totpCode(secret, step() + 1) })
      .expect(400);
    await request(server)
      .post('/v1/auth/2fa/disable')
      .set(auth)
      .send({ password, code: totpCode(secret, step() + 1) })
      .expect(204);

    const plain = await login().expect(200);
    expect(plain.body.accessToken).toBeTruthy();
    const after = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(after).toMatchObject({ totpSecret: null, totpEnabledAt: null, totpRecoveryHashes: [] });
  });
});
