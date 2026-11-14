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
const slug = (name: string) => `e2e-updated-${name}-${tag}`;
const admin = { email: `e2e-updated-${tag}@codeqlick.test`, password: 'updated-password-1' };

describe('Updated date of posts and case studies (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let auth: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.create({
      data: {
        email: admin.email,
        name: 'E2E Updated',
        role: Role.ADMIN,
        passwordHash: await argon2.hash(admin.password, { type: argon2.argon2id }),
      },
    });
    const login = await request(app.getHttpServer()).post('/v1/auth/login').send(admin).expect(200);
    auth = `Bearer ${login.body.accessToken as string}`;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.post.deleteMany({ where: { slug: { startsWith: 'e2e-updated-' } } });
      await prisma.portfolioItem.deleteMany({ where: { slug: { startsWith: 'e2e-updated-' } } });
      await prisma.user.deleteMany({ where: { email: admin.email } });
    }
    await app?.close();
  });

  it('dates a post when its text changes, a day or more after publication', async () => {
    const server = app.getHttpServer();
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const translations = (title: string) => [
      { locale: 'en', title, excerpt: 'Excerpt', content: 'Body' },
      { locale: 'es', title: 'Hola', excerpt: 'Extracto', content: 'Cuerpo' },
    ];

    // Live since two days ago; one published just now, for the launch-day fix.
    const created = await request(server)
      .post('/v1/admin/posts')
      .set('Authorization', auth)
      .send({
        slug: slug('post'),
        status: 'PUBLISHED',
        publishedAt: twoDaysAgo,
        translations: translations('Hello'),
      })
      .expect(201);
    const fresh = await request(server)
      .post('/v1/admin/posts')
      .set('Authorization', auth)
      .send({ slug: slug('fresh'), status: 'PUBLISHED', translations: translations('Fresh') })
      .expect(201);

    const before = await request(server)
      .get(`/v1/posts/${slug('post')}?locale=en`)
      .expect(200);
    expect(before.body.contentUpdatedAt).toBeNull();

    // Saving the same text with other tags changes nothing readers see.
    await request(server)
      .patch(`/v1/admin/posts/${created.body.id as string}`)
      .set('Authorization', auth)
      .send({ tagIds: [], translations: translations('Hello') })
      .expect(200);
    const same = await request(server)
      .get(`/v1/posts/${slug('post')}?locale=en`)
      .expect(200);
    expect(same.body.contentUpdatedAt).toBeNull();

    // A new title is an update, shown in the detail and in the list.
    await request(server)
      .patch(`/v1/admin/posts/${created.body.id as string}`)
      .set('Authorization', auth)
      .send({ translations: translations('Hello again') })
      .expect(200);
    const after = await request(server)
      .get(`/v1/posts/${slug('post')}?locale=en`)
      .expect(200);
    expect(typeof after.body.contentUpdatedAt).toBe('string');
    expect(Date.parse(after.body.contentUpdatedAt as string)).toBeGreaterThan(
      Date.parse(twoDaysAgo),
    );
    const list = await request(server).get('/v1/posts?locale=en&pageSize=100').expect(200);
    const summary = (list.body.items as { slug: string; contentUpdatedAt: string | null }[]).find(
      (post) => post.slug === slug('post'),
    );
    expect(summary?.contentUpdatedAt).toBe(after.body.contentUpdatedAt);

    // An edit on launch day is stored but not shown.
    await request(server)
      .patch(`/v1/admin/posts/${fresh.body.id as string}`)
      .set('Authorization', auth)
      .send({ translations: translations('Fresh, fixed') })
      .expect(200);
    const stored = await prisma.post.findUniqueOrThrow({ where: { slug: slug('fresh') } });
    expect(stored.contentUpdatedAt).toBeInstanceOf(Date);
    const fixed = await request(server)
      .get(`/v1/posts/${slug('fresh')}?locale=en`)
      .expect(200);
    expect(fixed.body.contentUpdatedAt).toBeNull();
  });

  it('dates a case study when its summary changes', async () => {
    const server = app.getHttpServer();
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const translations = (summary: string) => [
      { locale: 'en', title: 'Shop', summary, content: 'Body' },
    ];
    const created = await request(server)
      .post('/v1/admin/portfolio')
      .set('Authorization', auth)
      .send({
        slug: slug('study'),
        status: 'PUBLISHED',
        publishedAt: twoDaysAgo,
        technologies: ['Next.js'],
        sortOrder: 0,
        translations: translations('An online shop.'),
      })
      .expect(201);
    const id = created.body.id as string;

    const before = await request(server)
      .get(`/v1/portfolio/${slug('study')}?locale=en`)
      .expect(200);
    expect(before.body.contentUpdatedAt).toBeNull();

    // Technologies are not the readers' content.
    await request(server)
      .patch(`/v1/admin/portfolio/${id}`)
      .set('Authorization', auth)
      .send({ technologies: ['Next.js', 'NestJS'] })
      .expect(200);
    const same = await request(server)
      .get(`/v1/portfolio/${slug('study')}?locale=en`)
      .expect(200);
    expect(same.body.contentUpdatedAt).toBeNull();

    await request(server)
      .patch(`/v1/admin/portfolio/${id}`)
      .set('Authorization', auth)
      .send({ translations: translations('An online shop that sells more.') })
      .expect(200);
    const after = await request(server)
      .get(`/v1/portfolio/${slug('study')}?locale=en`)
      .expect(200);
    expect(typeof after.body.contentUpdatedAt).toBe('string');
    const list = await request(server).get('/v1/portfolio?locale=en&pageSize=50').expect(200);
    const summary = (list.body.items as { slug: string; contentUpdatedAt: string | null }[]).find(
      (item) => item.slug === slug('study'),
    );
    expect(summary?.contentUpdatedAt).toBe(after.body.contentUpdatedAt);
  });
});
