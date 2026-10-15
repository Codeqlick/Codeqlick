import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from '../src/app.setup.js';
import { Role } from '../src/generated/prisma/client.js';
import { totpCode } from '../src/modules/auth/totp.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app, configured as in production. The config is read when the app
// module is loaded, hence the dynamic import after setting it.
process.env.ADMIN_TWO_FACTOR_REQUIRED = 'true';

const tag = randomUUID().slice(0, 8);
const password = 'admin-2fa-password-1';
const admin = { email: `e2e-admin-2fa-${tag}@codeqlick.test`, password };
const client = { email: `e2e-client-2fa-${tag}@codeqlick.test`, password };
const step = () => Math.floor(Date.now() / 30_000);

describe('Two-step verification required for admins (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.create({
      data: { email: admin.email, name: 'Admin', role: Role.ADMIN, passwordHash },
    });
    await prisma.user.create({
      data: { email: client.email, name: 'Client', role: Role.CLIENT, passwordHash },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { email: { in: [admin.email, client.email] } } });
    }
    await app?.close();
    delete process.env.ADMIN_TWO_FACTOR_REQUIRED;
  });

  it('keeps an admin without it out of the admin API until they turn it on', async () => {
    const server = app.getHttpServer();
    const login = await request(server).post('/v1/auth/login').send(admin).expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken as string}` };

    const blocked = await request(server).get('/v1/admin/stats').set(auth).expect(403);
    expect(blocked.body.detail).toBe('Two-step verification is required for admin accounts');
    // Their account still works: they can see why and set it up.
    await request(server).get('/v1/auth/me').set(auth).expect(200);
    await request(server).get('/v1/auth/2fa').set(auth).expect(200, {
      enabled: false,
      recoveryCodesLeft: 0,
      required: true,
    });

    const setup = await request(server).post('/v1/auth/2fa/setup').set(auth).expect(200);
    const secret = setup.body.secret as string;
    await request(server)
      .post('/v1/auth/2fa/enable')
      .set(auth)
      .send({ code: totpCode(secret, step()) })
      .expect(200);

    // Same token, at once: the guard reads the account, not the token.
    await request(server).get('/v1/admin/stats').set(auth).expect(200);
    // And it can't be turned off while it is required.
    await request(server)
      .post('/v1/auth/2fa/disable')
      .set(auth)
      .send({ password, code: totpCode(secret, step() + 1) })
      .expect(409);
  });

  it("doesn't ask clients for it", async () => {
    const server = app.getHttpServer();
    const login = await request(server).post('/v1/auth/login').send(client).expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
    await request(server).get('/v1/portal/projects').set(auth).expect(200);
    const status = await request(server).get('/v1/auth/2fa').set(auth).expect(200);
    expect(status.body.required).toBe(false);
  });
});
