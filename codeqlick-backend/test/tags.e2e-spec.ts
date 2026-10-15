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
const admin = { email: `e2e-tags-${tag}@codeqlick.test`, password: 'tags-password-1' };
const slugs = ['both', 'one', 'none'].map((name) => `e2e-tags-${name}-${tag}`);

describe('Blog tags (e2e)', () => {
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
        name: 'E2E Tags',
        role: Role.ADMIN,
        passwordHash: await argon2.hash(admin.password, { type: argon2.argon2id }),
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.post.deleteMany({ where: { slug: { in: slugs } } });
      await prisma.tag.deleteMany({ where: { slug: { startsWith: `e2e-${tag}` } } });
      await prisma.user.deleteMany({ where: { email: admin.email } });
    }
    await app?.close();
  });

  it('tags posts, filters by tag, lists tags and suggests related posts', async () => {
    const server = app.getHttpServer();
    const login = await request(server).post('/v1/auth/login').send(admin).expect(200);
    const auth = `Bearer ${login.body.accessToken as string}`;

    const createTag = async (suffix: string, nameEn: string, nameEs: string) =>
      (
        await request(server)
          .post('/v1/admin/tags')
          .set('Authorization', auth)
          .send({ slug: `e2e-${tag}-${suffix}`, nameEn, nameEs })
          .expect(201)
      ).body as { id: string; slug: string };
    const architecture = await createTag('architecture', 'Architecture', 'Arquitectura');
    const security = await createTag('security', 'Security', 'Seguridad');
    await request(server)
      .post('/v1/admin/tags')
      .set('Authorization', auth)
      .send({ slug: architecture.slug, nameEn: 'Again', nameEs: 'Otra vez' })
      .expect(409);

    // Minutes ago, so they are the newest live posts even in a database with other content.
    const createPost = (slug: string, tagIds: string[], minutesAgo: number) =>
      request(server)
        .post('/v1/admin/posts')
        .set('Authorization', auth)
        .send({
          slug,
          status: 'PUBLISHED',
          publishedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
          tagIds,
          translations: [{ locale: 'en', title: slug, excerpt: 'x', content: 'x' }],
        });
    const [both, one, none] = slugs as [string, string, string];
    await createPost(both, [architecture.id, security.id], 1).expect(201);
    await createPost(one, [architecture.id], 3).expect(201);
    await createPost(none, [], 2).expect(201);
    await createPost(`e2e-tags-bad-${tag}`, [randomUUID()], 0).expect(400);

    const filtered = await request(server)
      .get(`/v1/posts?locale=es&tag=${architecture.slug}&pageSize=100`)
      .expect(200);
    expect((filtered.body.items as { slug: string }[]).map((post) => post.slug)).toEqual([
      both,
      one,
    ]);
    expect(filtered.body.items[0].tags).toEqual([
      { slug: architecture.slug, name: 'Arquitectura' },
      { slug: security.slug, name: 'Seguridad' },
    ]);

    const tags = await request(server).get('/v1/posts/tags?locale=es').expect(200);
    const mine = (tags.body as { slug: string; name: string; count: number }[]).filter((item) =>
      item.slug.startsWith(`e2e-${tag}`),
    );
    expect(mine).toEqual([
      { slug: architecture.slug, name: 'Arquitectura', count: 2 },
      { slug: security.slug, name: 'Seguridad', count: 1 },
    ]);

    // Sharing a tag comes first; then the latest posts, of which ours are the newest.
    const related = await request(server)
      .get(`/v1/posts/${both}/related?locale=en&limit=2`)
      .expect(200);
    expect((related.body as { slug: string }[]).map((post) => post.slug)).toEqual([one, none]);

    // Deleting a tag just removes it from the posts.
    await request(server)
      .delete(`/v1/admin/tags/${security.id}`)
      .set('Authorization', auth)
      .expect(204);
    const after = await request(server).get(`/v1/posts/${both}?locale=en`).expect(200);
    expect(after.body.tags).toEqual([{ slug: architecture.slug, name: 'Architecture' }]);
  });
});
