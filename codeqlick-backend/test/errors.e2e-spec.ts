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
import { ErrorsService } from '../src/modules/errors/errors.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'errors-pass-1234';
const admin = { email: `e2e-errors-${tag}@codeqlick.test`, password };
const client = { email: `e2e-errors-client-${tag}@codeqlick.test`, password };

describe('Errors (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.create({
      data: { email: admin.email, name: 'A', role: Role.ADMIN, passwordHash },
    });
    await prisma.user.create({
      data: { email: client.email, name: 'C', role: Role.CLIENT, passwordHash },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.errorGroup.deleteMany({ where: { message: { contains: tag } } });
      await prisma.user.deleteMany({ where: { email: { in: [admin.email, client.email] } } });
    }
    await app?.close();
  });

  it('groups the website reports and the API errors for the admin to resolve', async () => {
    const server = app.getHttpServer();
    const login = async (who: typeof admin) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(who).expect(200)).body.accessToken as string}`,
    });
    const auth = await login(admin);
    const clientAuth = await login(client);

    // The website reports a browser error twice, with different ids in the message: one group.
    for (const id of [12, 34]) {
      await request(server)
        .post('/v1/errors')
        .send({
          source: 'browser',
          message: `TypeError: photo ${id} is undefined ${tag}`,
          stack: `TypeError\n    at Deck (https://codeqlick.com/_next/static/chunks/app-1a2b3c4d5e.js:1:${id})`,
          path: `/es/swipe/deck?from=${id}`,
          digest: 'abc123',
        })
        .expect(204);
    }
    await request(server).post('/v1/errors').send({ source: 'browser' }).expect(400);
    await request(server)
      .post('/v1/errors')
      .send({ source: 'server', message: `x ${tag}`, extra: 1 })
      .expect(400);

    // The API's own unexpected errors are recorded by the exception filter through the service.
    await app.get(ErrorsService).record({
      source: 'API',
      message: `Error: database went away ${tag}`,
      method: 'GET',
      path: '/v1/posts',
      reference: 'req-1',
    });

    await request(server).get('/v1/admin/errors').expect(401);
    await request(server).get('/v1/admin/errors').set(clientAuth).expect(403);

    const open = await request(server).get('/v1/admin/errors').set(auth).expect(200);
    const mine = (open.body as Array<{ id: string; message: string }>).filter((e) =>
      e.message.includes(tag),
    );
    expect(mine).toHaveLength(2);
    const browser = mine.find((e) => e.message.startsWith('TypeError'));
    expect(browser).toMatchObject({
      source: 'WEB_BROWSER',
      count: 2,
      path: '/es/swipe/deck',
      reference: 'abc123',
      resolvedAt: null,
    });

    const id = browser!.id;
    await request(server).post(`/v1/admin/errors/${id}/resolve`).set(auth).expect(200);
    const resolved = await request(server)
      .get('/v1/admin/errors?status=resolved')
      .set(auth)
      .expect(200);
    expect((resolved.body as Array<{ id: string }>).some((e) => e.id === id)).toBe(true);

    // It happens again: it opens again, counted.
    await request(server)
      .post('/v1/errors')
      .send({
        source: 'browser',
        message: `TypeError: photo 56 is undefined ${tag}`,
        stack: `TypeError\n    at Deck (https://codeqlick.com/_next/static/chunks/app-9f8e7d6c5b.js:1:2)`,
      })
      .expect(204);
    const again = await request(server).get(`/v1/admin/errors/${id}`).set(auth).expect(200);
    expect(again.body).toMatchObject({ resolvedAt: null, count: 3 });

    await request(server).post('/v1/admin/errors/resolve-all').set(auth).expect(200);
    const after = await request(server).get('/v1/admin/errors').set(auth).expect(200);
    expect((after.body as Array<{ message: string }>).some((e) => e.message.includes(tag))).toBe(
      false,
    );
    await request(server).post(`/v1/admin/errors/${id}/reopen`).set(auth).expect(200);
    await request(server).get(`/v1/admin/errors/${randomUUID()}`).set(auth).expect(404);
  });
});
