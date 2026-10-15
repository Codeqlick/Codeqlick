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
const tag = randomUUID().slice(0, 8);
const password = 'saved-replies-pass-1';
const admin = { email: `e2e-saved-${tag}@codeqlick.test`, password };
const client = { email: `e2e-saved-client-${tag}@codeqlick.test`, password };

describe('Saved replies (e2e)', () => {
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
      await prisma.savedReply.deleteMany({ where: { title: { endsWith: tag } } });
      await prisma.user.deleteMany({ where: { email: { in: [admin.email, client.email] } } });
    }
    await app?.close();
  });

  it('lets admins keep reusable texts', async () => {
    const server = app.getHttpServer();
    const auth = {
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(admin).expect(200)).body.accessToken as string}`,
    };
    await request(server)
      .post('/v1/admin/saved-replies')
      .set(auth)
      .send({ title: ' ', body: 'x' })
      .expect(400);
    const created = await request(server)
      .post('/v1/admin/saved-replies')
      .set(auth)
      .send({ title: `Primera llamada ${tag}`, body: 'Hola {name}:\n\n¿Te va bien una llamada?' })
      .expect(201);
    const id = created.body.id as string;

    const updated = await request(server)
      .patch(`/v1/admin/saved-replies/${id}`)
      .set(auth)
      .send({ body: 'Hola {name}: ¿hablamos el martes?' })
      .expect(200);
    expect(updated.body).toMatchObject({
      title: `Primera llamada ${tag}`,
      body: 'Hola {name}: ¿hablamos el martes?',
    });

    const list = await request(server).get('/v1/admin/saved-replies').set(auth).expect(200);
    expect(list.body.map((r: { id: string }) => r.id)).toContain(id);

    await request(server).delete(`/v1/admin/saved-replies/${id}`).set(auth).expect(204);
    await request(server).delete(`/v1/admin/saved-replies/${id}`).set(auth).expect(404);

    const clientAuth = {
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(client).expect(200)).body.accessToken as string}`,
    };
    await request(server).get('/v1/admin/saved-replies').set(clientAuth).expect(403);
  });
});
