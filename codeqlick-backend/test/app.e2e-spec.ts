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

const suffix = randomUUID().slice(0, 8);
const admin = {
  email: `e2e-admin-${suffix}@codeqlick.test`,
  password: 'e2e-admin-password-1234',
  name: 'E2E Admin',
};
const clientEmail = `e2e-client-${suffix}@codeqlick.test`;
const postSlug = `e2e-post-${suffix}`;

describe('Codeqlick API (e2e)', () => {
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
        name: admin.name,
        role: Role.ADMIN,
        passwordHash: await argon2.hash(admin.password, { type: argon2.argon2id }),
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.clientProject.deleteMany({ where: { client: { email: clientEmail } } });
      await prisma.post.deleteMany({ where: { slug: postSlug } });
      await prisma.user.deleteMany({ where: { email: { in: [admin.email, clientEmail] } } });
    }
    await app?.close();
  });

  it('GET /v1/health reports the database as up', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.info?.database?.status).toBe('up');
  });

  it('POST /v1/leads with an invalid body returns a 400 problem+json', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/leads')
      .send({ name: '', email: 'not-an-email', message: 'short', locale: 'fr' })
      .expect(400);

    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ type: 'about:blank', status: 400, instance: '/v1/leads' });
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it('POST /v1/auth/login with wrong credentials returns 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: admin.email, password: 'definitely-wrong' })
      .expect(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('rejects admin routes without a token', async () => {
    const res = await request(app.getHttpServer()).get('/v1/admin/stats').expect(401);
    expect(res.body.status).toBe(401);
  });

  it('runs an admin flow: login, me, stats, users, posts, projects, media, refresh, logout', async () => {
    const server = app.getHttpServer();

    const login = await request(server)
      .post('/v1/auth/login')
      .send({ email: admin.email.toUpperCase(), password: admin.password })
      .expect(200);
    expect(login.body.user).toMatchObject({ email: admin.email, role: 'ADMIN', name: admin.name });
    expect(login.body.expiresIn).toBe(900);
    const auth = { Authorization: `Bearer ${login.body.accessToken as string}` };

    const me = await request(server).get('/v1/auth/me').set(auth).expect(200);
    expect(me.body).toMatchObject({ email: admin.email, role: 'ADMIN' });

    const stats = await request(server).get('/v1/admin/stats').set(auth).expect(200);
    expect(stats.body).toHaveProperty('leads.total');
    expect(stats.body).toHaveProperty('clients');

    const created = await request(server)
      .post('/v1/admin/users')
      .set(auth)
      .send({
        email: clientEmail,
        name: 'E2E Client',
        password: 'client-password-1234',
        role: 'CLIENT',
      })
      .expect(201);
    expect(created.body).not.toHaveProperty('passwordHash');
    await request(server)
      .post('/v1/admin/users')
      .set(auth)
      .send({ email: clientEmail, name: 'Dup', password: 'client-password-1234', role: 'CLIENT' })
      .expect(409);

    await request(server)
      .post('/v1/admin/posts')
      .set(auth)
      .send({
        slug: postSlug,
        status: 'PUBLISHED',
        translations: [{ locale: 'en', title: 'Hello', excerpt: 'Hi', content: '# Hello' }],
      })
      .expect(201);
    const publicPost = await request(server)
      .get(`/v1/posts/${postSlug}`)
      .query({ locale: 'es' })
      .expect(200);
    expect(publicPost.body).toMatchObject({ slug: postSlug, title: 'Hello', locales: ['en'] });

    const project = await request(server)
      .post('/v1/admin/projects')
      .set(auth)
      .send({ clientId: created.body.id, name: 'Website', phase: 'DESIGN', progress: 10 })
      .expect(201);
    await request(server)
      .post(`/v1/admin/projects/${project.body.id as string}/updates`)
      .set(auth)
      .send({ title: 'Kick-off', body: 'We started.' })
      .expect(201);
    await request(server)
      .post('/v1/admin/projects')
      .set(auth)
      .send({ clientId: login.body.user.id, name: 'Bad', phase: 'DESIGN', progress: 0 })
      .expect(400);

    const clientLogin = await request(server)
      .post('/v1/auth/login')
      .send({ email: clientEmail, password: 'client-password-1234' })
      .expect(200);
    const clientAuth = { Authorization: `Bearer ${clientLogin.body.accessToken as string}` };
    const portal = await request(server).get('/v1/portal/projects').set(clientAuth).expect(200);
    expect(portal.body).toHaveLength(1);
    const detail = await request(server)
      .get(`/v1/portal/projects/${project.body.id as string}`)
      .set(clientAuth)
      .expect(200);
    expect(detail.body.updates).toHaveLength(1);
    await request(server).get('/v1/admin/stats').set(clientAuth).expect(403);

    // 1x1 transparent PNG.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    );
    const upload = await request(server)
      .post('/v1/admin/media')
      .set(auth)
      .attach('file', png, 'pixel.png')
      .expect(201);
    expect(upload.body).toMatchObject({ contentType: 'image/png', size: png.length });
    expect(upload.body.filename).toMatch(/^[0-9a-f-]{36}\.png$/);
    const served = await request(server)
      .get(`/v1/media/${upload.body.filename as string}`)
      .expect(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.headers['cache-control']).toContain('immutable');
    expect(Buffer.compare(served.body as Buffer, png)).toBe(0);

    // The content decides, not the name or the declared type.
    await request(server)
      .post('/v1/admin/media')
      .set(auth)
      .attach('file', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), {
        filename: 'fake.png',
        contentType: 'image/png',
      })
      .expect(400);
    await request(server)
      .post('/v1/admin/media')
      .set(auth)
      .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), 'big.png')
      .expect(413);
    await request(server)
      .post('/v1/admin/media')
      .set(clientAuth)
      .attach('file', png, 'pixel.png')
      .expect(403);
    await request(server).get('/v1/media/..%2F..%2Fpackage.json').expect(404);
    await request(server).get(`/v1/media/${randomUUID()}.png`).expect(404);

    const refreshed = await request(server)
      .post('/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);
    expect(refreshed.body.refreshToken).not.toBe(login.body.refreshToken);

    // Reusing the rotated token revokes the whole family, including the new token.
    await request(server)
      .post('/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
    await request(server)
      .post('/v1/auth/refresh')
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(401);

    await request(server)
      .post('/v1/auth/logout')
      .set(clientAuth)
      .send({ refreshToken: clientLogin.body.refreshToken })
      .expect(204);
    await request(server)
      .post('/v1/auth/refresh')
      .send({ refreshToken: clientLogin.body.refreshToken })
      .expect(401);
  });
});
