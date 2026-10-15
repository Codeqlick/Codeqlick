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
const admin = {
  email: `e2e-activity-admin-${tag}@codeqlick.test`,
  password: 'activity-password-1',
};
const client = {
  email: `e2e-activity-client-${tag}@codeqlick.test`,
  password: 'activity-password-2',
};

interface Entry {
  action: string;
  actor: { name: string };
  target: { type: string; id: string | null; label: string | null };
  details: Record<string, unknown> | null;
}

describe('Activity log (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    for (const [user, role, name] of [
      [admin, Role.ADMIN, 'E2E Activity Admin'],
      [client, Role.CLIENT, 'E2E Activity Client'],
    ] as const) {
      await prisma.user.create({
        data: {
          email: user.email,
          name,
          role,
          passwordHash: await argon2.hash(user.password, { type: argon2.argon2id }),
        },
      });
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.post.deleteMany({ where: { slug: `e2e-activity-${tag}` } });
      await prisma.user.deleteMany({ where: { email: { in: [admin.email, client.email] } } });
    }
    await app?.close();
  });

  it('records who created, published and deleted a post, for admins only', async () => {
    const server = app.getHttpServer();
    const token = async (user: { email: string; password: string }) =>
      `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`;
    const auth = await token(admin);

    const created = await request(server)
      .post('/v1/admin/posts')
      .set('Authorization', auth)
      .send({
        slug: `e2e-activity-${tag}`,
        status: 'DRAFT',
        translations: [
          { locale: 'en', title: 'Activity log', excerpt: 'Test', content: 'Text' },
          { locale: 'es', title: 'Registro de actividad', excerpt: 'Prueba', content: 'Texto' },
        ],
      })
      .expect(201);
    const id = created.body.id as string;
    await request(server)
      .patch(`/v1/admin/posts/${id}`)
      .set('Authorization', auth)
      .send({ status: 'PUBLISHED' })
      .expect(200);
    await request(server).delete(`/v1/admin/posts/${id}`).set('Authorization', auth).expect(204);

    const log = await request(server)
      .get('/v1/admin/activity?targetType=post&pageSize=100')
      .set('Authorization', auth)
      .expect(200);
    const mine = (log.body.items as Entry[]).filter((entry) => entry.target.id === id);
    // Newest first.
    expect(mine.map((entry) => entry.action)).toEqual([
      'post.deleted',
      'post.published',
      'post.created',
    ]);
    expect(mine[0]).toMatchObject({
      actor: { name: 'E2E Activity Admin' },
      target: { type: 'post', label: 'Registro de actividad' },
    });
    expect(mine[2]?.details).toEqual({ status: 'DRAFT' });

    const clientAuth = await token(client);
    await request(server).get('/v1/admin/activity').set('Authorization', clientAuth).expect(403);
  });
});
