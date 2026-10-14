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
const slug = `e2e-scheduled-${tag}`;
const admin = { email: `e2e-scheduled-${tag}@codeqlick.test`, password: 'scheduled-password-1' };

describe('Scheduled publishing (e2e)', () => {
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
        email: admin.email,
        name: 'E2E Scheduler',
        role: Role.ADMIN,
        passwordHash: await argon2.hash(admin.password, { type: argon2.argon2id }),
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.post.deleteMany({ where: { slug } });
      await prisma.user.deleteMany({ where: { email: admin.email } });
    }
    await app?.close();
  });

  it('hides a post published with a future date until that date', async () => {
    const server = app.getHttpServer();
    const login = await request(server).post('/v1/auth/login').send(admin).expect(200);
    const auth = `Bearer ${login.body.accessToken as string}`;
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();

    const created = await request(server)
      .post('/v1/admin/posts')
      .set('Authorization', auth)
      .send({
        slug,
        status: 'PUBLISHED',
        publishedAt: tomorrow,
        translations: [
          { locale: 'en', title: 'Tomorrow', excerpt: 'Soon', content: 'Soon' },
          { locale: 'es', title: 'Mañana', excerpt: 'Pronto', content: 'Pronto' },
        ],
      })
      .expect(201);
    const id = created.body.id as string;
    expect(created.body.publishedAt).toBe(tomorrow);

    // Scheduled: not on the public site yet.
    await request(server).get(`/v1/posts/${slug}?locale=en`).expect(404);
    const list = await request(server).get('/v1/posts?locale=en&pageSize=100').expect(200);
    expect((list.body.items as { slug: string }[]).some((post) => post.slug === slug)).toBe(false);

    const log = await request(server)
      .get('/v1/admin/activity?targetType=post')
      .set('Authorization', auth)
      .expect(200);
    const entry = (
      log.body.items as { action: string; target: { id: string }; details: unknown }[]
    ).find((item) => item.target.id === id);
    expect(entry?.details).toEqual({ status: 'PUBLISHED', publishedAt: tomorrow });

    // Moving the date to the past makes it live.
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    await request(server)
      .patch(`/v1/admin/posts/${id}`)
      .set('Authorization', auth)
      .send({ publishedAt: yesterday })
      .expect(200);
    const live = await request(server).get(`/v1/posts/${slug}?locale=en`).expect(200);
    expect(live.body.publishedAt).toBe(yesterday);
  });
});
