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
const slug = (name: string) => `e2e-redirect-${name}-${tag}`;
const admin = { email: `e2e-redirects-${tag}@codeqlick.test`, password: 'redirects-password-1' };

const postTranslations = [
  { locale: 'en', title: 'Redirects', excerpt: 'Old links.', content: 'Body.' },
];
const portfolioTranslations = [
  { locale: 'en', title: 'Redirects', summary: 'Old links.', content: 'Body.' },
];

describe('Old slugs redirect after a slug change (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let auth: string;

  const server = () => app.getHttpServer();

  const createPost = async (postSlug: string, status: 'DRAFT' | 'PUBLISHED' = 'PUBLISHED') => {
    const created = await request(server())
      .post('/v1/admin/posts')
      .set('Authorization', auth)
      .send({ slug: postSlug, status, translations: postTranslations })
      .expect(201);
    expect(created.body.oldSlugs).toEqual([]);
    return created.body.id as string;
  };

  const patchPost = async (id: string, body: Record<string, unknown>) => {
    const saved = await request(server())
      .patch(`/v1/admin/posts/${id}`)
      .set('Authorization', auth)
      .send(body)
      .expect(200);
    return saved.body as { slug: string; oldSlugs: string[] };
  };

  const postOldSlugs = async (id: string) => {
    const found = await request(server())
      .get(`/v1/admin/posts/${id}`)
      .set('Authorization', auth)
      .expect(200);
    return found.body.oldSlugs as string[];
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.create({
      data: {
        email: admin.email,
        name: 'E2E Redirects',
        role: Role.ADMIN,
        passwordHash: await argon2.hash(admin.password, { type: argon2.argon2id }),
      },
    });
    const login = await request(server()).post('/v1/auth/login').send(admin).expect(200);
    auth = `Bearer ${login.body.accessToken as string}`;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.post.deleteMany({ where: { slug: { endsWith: `-${tag}` } } });
      await prisma.portfolioItem.deleteMany({ where: { slug: { endsWith: `-${tag}` } } });
      await prisma.user.deleteMany({ where: { email: admin.email } });
    }
    await app?.close();
  });

  it('redirects every old slug of a published post to its current one', async () => {
    const [a, b, c] = [slug('a'), slug('b'), slug('c')];
    const id = await createPost(a);

    // A → B: the old slug answers with the new one; the admin panel lists it.
    const renamed = await patchPost(id, { slug: b });
    expect(renamed.oldSlugs).toEqual([a]);
    const first = await request(server()).get(`/v1/posts/redirects/${a}`).expect(200);
    expect(first.body).toEqual({ slug: b });
    await request(server()).get(`/v1/posts/${a}?locale=en`).expect(404);

    // B → C: no chain, both old slugs lead to C; newest first in the admin panel.
    expect((await patchPost(id, { slug: c })).oldSlugs).toEqual([b, a]);
    for (const old of [a, b]) {
      const answer = await request(server()).get(`/v1/posts/redirects/${old}`).expect(200);
      expect(answer.body).toEqual({ slug: c });
    }
    expect(await postOldSlugs(id)).toEqual([b, a]);

    // Renaming back to A drops A's redirect and keeps C.
    expect((await patchPost(id, { slug: a })).oldSlugs).toEqual([c, b]);
    await request(server()).get(`/v1/posts/redirects/${a}`).expect(404);
    const back = await request(server()).get(`/v1/posts/redirects/${c}`).expect(200);
    expect(back.body).toEqual({ slug: a });

    // A slug in use wins: a new post taking B removes that redirect.
    const other = await createPost(b);
    expect(await postOldSlugs(id)).toEqual([c]);
    await request(server()).get(`/v1/posts/redirects/${b}`).expect(404);

    // So does an edited one taking C.
    await patchPost(other, { slug: c });
    expect(await postOldSlugs(id)).toEqual([]);
    await request(server()).get(`/v1/posts/redirects/${c}`).expect(404);
  });

  it('keeps nothing when a draft that was never published is renamed', async () => {
    const id = await createPost(slug('draft-1'), 'DRAFT');
    expect((await patchPost(id, { slug: slug('draft-2') })).oldSlugs).toEqual([]);
    await request(server())
      .get(`/v1/posts/redirects/${slug('draft-1')}`)
      .expect(404);
    expect(await prisma.postSlugRedirect.count({ where: { postId: id } })).toBe(0);
  });

  it('answers only while the post is live, and forgets the redirects of a deleted post', async () => {
    const id = await createPost(slug('live-1'));
    await patchPost(id, { slug: slug('live-2') });
    await request(server())
      .get(`/v1/posts/redirects/${slug('live-1')}`)
      .expect(200);

    // Back to draft: the redirect stays but answers 404, as the post itself does.
    await patchPost(id, { status: 'DRAFT' });
    const hidden = await request(server())
      .get(`/v1/posts/redirects/${slug('live-1')}`)
      .expect(404);
    expect(hidden.body.status).toBe(404);
    expect(await postOldSlugs(id)).toEqual([slug('live-1')]);

    // Scheduled for tomorrow: still hidden.
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    await patchPost(id, { status: 'PUBLISHED', publishedAt: tomorrow });
    await request(server())
      .get(`/v1/posts/redirects/${slug('live-1')}`)
      .expect(404);

    await request(server()).delete(`/v1/admin/posts/${id}`).set('Authorization', auth).expect(204);
    expect(await prisma.postSlugRedirect.count({ where: { postId: id } })).toBe(0);
    await request(server())
      .get(`/v1/posts/redirects/${slug('live-1')}`)
      .expect(404);
  });

  it('redirects the old slug of a published case study', async () => {
    const [old, current] = [slug('case-1'), slug('case-2')];
    const created = await request(server())
      .post('/v1/admin/portfolio')
      .set('Authorization', auth)
      .send({
        slug: old,
        status: 'PUBLISHED',
        technologies: ['Next.js'],
        sortOrder: 0,
        translations: portfolioTranslations,
      })
      .expect(201);
    const id = created.body.id as string;
    expect(created.body.oldSlugs).toEqual([]);

    const renamed = await request(server())
      .patch(`/v1/admin/portfolio/${id}`)
      .set('Authorization', auth)
      .send({ slug: current })
      .expect(200);
    expect(renamed.body.oldSlugs).toEqual([old]);
    const found = await request(server())
      .get(`/v1/admin/portfolio/${id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(found.body.oldSlugs).toEqual([old]);

    const answer = await request(server()).get(`/v1/portfolio/redirects/${old}`).expect(200);
    expect(answer.body).toEqual({ slug: current });
    await request(server()).get(`/v1/portfolio/redirects/${current}`).expect(404);

    // Unpublished: 404. Deleted: the redirect goes with it.
    await request(server())
      .patch(`/v1/admin/portfolio/${id}`)
      .set('Authorization', auth)
      .send({ status: 'DRAFT' })
      .expect(200);
    await request(server()).get(`/v1/portfolio/redirects/${old}`).expect(404);
    await request(server())
      .delete(`/v1/admin/portfolio/${id}`)
      .set('Authorization', auth)
      .expect(204);
    expect(await prisma.portfolioSlugRedirect.count({ where: { portfolioItemId: id } })).toBe(0);
  });
});
