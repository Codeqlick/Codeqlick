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

// Revision history of posts and case studies (architecture 4.2, decision 52).
const tag = randomUUID().slice(0, 8);
const admin = { email: `e2e-rev-admin-${tag}@codeqlick.test`, password: 'revisions-pass-1' };
const client = { email: `e2e-rev-client-${tag}@codeqlick.test`, password: 'revisions-pass-1' };
const prefix = `e2e-rev-${tag}`;

interface Revision {
  id: string;
  createdAt: string;
  author: { name: string } | null;
}

describe('Content revisions (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let auth: string;
  let clientAuth: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const passwordHash = await argon2.hash(admin.password, { type: argon2.argon2id });
    await prisma.user.createMany({
      data: [
        { email: admin.email, name: 'E2E Revisions', role: Role.ADMIN, passwordHash },
        { email: client.email, name: 'E2E Client', role: Role.CLIENT, passwordHash },
      ],
    });
    const server = app.getHttpServer();
    const login = await request(server).post('/v1/auth/login').send(admin).expect(200);
    auth = `Bearer ${login.body.accessToken as string}`;
    const clientLogin = await request(server).post('/v1/auth/login').send(client).expect(200);
    clientAuth = `Bearer ${clientLogin.body.accessToken as string}`;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.post.deleteMany({ where: { slug: { startsWith: prefix } } });
      await prisma.portfolioItem.deleteMany({ where: { slug: { startsWith: prefix } } });
      await prisma.tag.deleteMany({ where: { slug: { startsWith: prefix } } });
      await prisma.activityLog.deleteMany({ where: { actorName: 'E2E Revisions' } });
      await prisma.user.deleteMany({ where: { email: { in: [admin.email, client.email] } } });
    }
    await app?.close();
  });

  it('keeps, lists, shows and restores the versions of a post', async () => {
    const server = app.getHttpServer();
    const createTag = async (suffix: string) =>
      (
        await request(server)
          .post('/v1/admin/tags')
          .set('Authorization', auth)
          .send({ slug: `${prefix}-${suffix}`, nameEn: suffix, nameEs: suffix })
          .expect(201)
      ).body as { id: string };
    const kept = await createTag('kept');
    const gone = await createTag('gone');

    const original = [
      { locale: 'en', title: 'First', excerpt: 'Excerpt', content: 'Original body' },
      { locale: 'es', title: 'Primero', excerpt: 'Resumen', content: 'Cuerpo original' },
    ];
    const created = await request(server)
      .post('/v1/admin/posts')
      .set('Authorization', auth)
      .send({
        slug: `${prefix}-post`,
        status: 'DRAFT',
        coverImageUrl: 'https://cdn.codeqlick.test/old.png',
        tagIds: [kept.id, gone.id],
        translations: original,
      })
      .expect(201);
    const id = created.body.id as string;
    const base = `/v1/admin/posts/${id}`;
    const revisions = async () =>
      (await request(server).get(`${base}/revisions`).set('Authorization', auth).expect(200))
        .body as Revision[];
    const patch = (body: object) =>
      request(server).patch(base).set('Authorization', auth).send(body).expect(200);

    // Creating stores nothing; neither does a PATCH with the same content in another order...
    expect(await revisions()).toEqual([]);
    await patch({ tagIds: [gone.id, kept.id], translations: original.toReversed() });
    expect(await revisions()).toEqual([]);
    // ...nor one that only publishes, dates or renames the post.
    const published = await patch({
      status: 'PUBLISHED',
      publishedAt: '2026-01-15T09:00:00.000Z',
      slug: `${prefix}-post-renamed`,
    });
    expect(await revisions()).toEqual([]);

    // A content change keeps the previous version, by its editor.
    await patch({
      coverImageUrl: null,
      translations: [{ ...original[0], title: 'Second' }, original[1]],
    });
    const [first] = await revisions();
    expect(first).toMatchObject({ author: { name: 'E2E Revisions' } });
    const shown = await request(server)
      .get(`${base}/revisions/${first?.id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(shown.body).toMatchObject({ id: first?.id, author: { name: 'E2E Revisions' } });
    expect(shown.body.snapshot.coverImageUrl).toBe('https://cdn.codeqlick.test/old.png');
    expect(shown.body.snapshot.tagIds).toHaveLength(2);
    expect(shown.body.snapshot.translations).toHaveLength(2);
    expect(shown.body.snapshot).not.toHaveProperty('status');
    expect(shown.body.snapshot).not.toHaveProperty('slug');

    // Restoring puts the content back, never the publication or slug, without deleted tags.
    await request(server)
      .delete(`/v1/admin/tags/${gone.id}`)
      .set('Authorization', auth)
      .expect(204);
    const restored = await request(server)
      .post(`${base}/revisions/${first?.id}/restore`)
      .set('Authorization', auth)
      .expect(200);
    expect(restored.body).toMatchObject({
      id,
      slug: `${prefix}-post-renamed`,
      status: 'PUBLISHED',
      publishedAt: published.body.publishedAt,
      coverImageUrl: 'https://cdn.codeqlick.test/old.png',
      tagIds: [kept.id],
    });
    const titles = (restored.body.translations as { title: string }[]).map((t) => t.title);
    expect(titles.toSorted()).toEqual(['First', 'Primero']);

    // The restore is itself a change: the replaced version is now the newest revision.
    const afterRestore = await revisions();
    expect(afterRestore).toHaveLength(2);
    const newest = await request(server)
      .get(`${base}/revisions/${afterRestore[0]?.id}`)
      .set('Authorization', auth)
      .expect(200);
    const newestTitles = (newest.body.snapshot.translations as { title: string }[]).map(
      (t) => t.title,
    );
    expect(newestTitles).toContain('Second');

    const logged = await prisma.activityLog.findFirst({
      where: { action: 'post.restored', targetId: id },
    });
    expect(logged?.details).toEqual({ revisionCreatedAt: first?.createdAt });

    // Another post's revision is a 404 here; a client can't see any of it.
    const other = await request(server)
      .post('/v1/admin/posts')
      .set('Authorization', auth)
      .send({
        slug: `${prefix}-other`,
        status: 'DRAFT',
        translations: [{ locale: 'en', title: 'Other', excerpt: 'x', content: 'x' }],
      })
      .expect(201);
    const otherBase = `/v1/admin/posts/${other.body.id as string}`;
    await request(server)
      .get(`${otherBase}/revisions/${first?.id}`)
      .set('Authorization', auth)
      .expect(404);
    await request(server)
      .post(`${otherBase}/revisions/${first?.id}/restore`)
      .set('Authorization', auth)
      .expect(404);
    await request(server).get(`${base}/revisions`).set('Authorization', clientAuth).expect(403);
    await request(server)
      .post(`${base}/revisions/${first?.id}/restore`)
      .set('Authorization', clientAuth)
      .expect(403);

    // Only the last 20 are kept.
    for (let i = 0; i < 21; i += 1) {
      await patch({ translations: [{ ...original[0], title: `Edit ${i}` }] });
    }
    expect(await revisions()).toHaveLength(20);
    expect(await prisma.postRevision.count({ where: { postId: id } })).toBe(20);

    // Deleting the post deletes its revisions.
    await request(server).delete(base).set('Authorization', auth).expect(204);
    expect(await prisma.postRevision.count({ where: { postId: id } })).toBe(0);
    await request(server).get(`${base}/revisions`).set('Authorization', auth).expect(404);
  });

  it('keeps and restores the versions of a case study', async () => {
    const server = app.getHttpServer();
    const translation = {
      locale: 'en',
      title: 'Shop',
      summary: 'A shop',
      content: 'Original body',
      testimonialQuote: 'Great work',
      testimonialRole: 'Founder',
    };
    const created = await request(server)
      .post('/v1/admin/portfolio')
      .set('Authorization', auth)
      .send({
        slug: `${prefix}-case`,
        status: 'PUBLISHED',
        clientName: 'Acme',
        testimonialAuthor: 'Ana',
        technologies: ['Next.js', 'NestJS'],
        services: ['web'],
        sortOrder: 5,
        translations: [translation],
      })
      .expect(201);
    const id = created.body.id as string;
    const base = `/v1/admin/portfolio/${id}`;
    const revisions = async () =>
      (await request(server).get(`${base}/revisions`).set('Authorization', auth).expect(200))
        .body as Revision[];
    const patch = (body: object) =>
      request(server).patch(base).set('Authorization', auth).send(body).expect(200);

    await patch({ sortOrder: 7, status: 'DRAFT', slug: `${prefix}-case-moved` });
    expect(await revisions()).toEqual([]);

    await patch({ clientName: 'Acme Inc.', translations: [{ ...translation, title: 'Store' }] });
    const [first] = await revisions();
    expect(first).toMatchObject({ author: { name: 'E2E Revisions' } });
    const shown = await request(server)
      .get(`${base}/revisions/${first?.id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(shown.body.snapshot).toEqual({
      coverImageUrl: null,
      clientName: 'Acme',
      projectUrl: null,
      technologies: ['Next.js', 'NestJS'],
      services: ['web'],
      testimonialAuthor: 'Ana',
      translations: [translation],
    });

    const restored = await request(server)
      .post(`${base}/revisions/${first?.id}/restore`)
      .set('Authorization', auth)
      .expect(200);
    expect(restored.body).toMatchObject({
      slug: `${prefix}-case-moved`,
      status: 'DRAFT',
      sortOrder: 7,
      clientName: 'Acme',
      translations: [{ title: 'Shop' }],
    });
    expect(await revisions()).toHaveLength(2);
    const logged = await prisma.activityLog.findFirst({
      where: { action: 'portfolio.restored', targetId: id },
    });
    expect(logged?.details).toEqual({ revisionCreatedAt: first?.createdAt });

    await request(server)
      .get(`/v1/admin/portfolio/${randomUUID()}/revisions/${first?.id}`)
      .set('Authorization', auth)
      .expect(404);
    await request(server).get(`${base}/revisions`).set('Authorization', clientAuth).expect(403);

    await request(server).delete(base).set('Authorization', auth).expect(204);
    expect(await prisma.portfolioRevision.count({ where: { portfolioItemId: id } })).toBe(0);
  });
});
