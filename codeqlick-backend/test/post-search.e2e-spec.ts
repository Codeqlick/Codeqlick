import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Locale, PublishStatus } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const tag = randomUUID().slice(0, 8);
const slug = (name: string) => `e2e-search-${name}-${tag}`;

describe('Blog search (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const published = {
      status: PublishStatus.PUBLISHED,
      publishedAt: new Date(Date.now() - 60_000),
    };
    await prisma.post.create({
      data: {
        slug: slug('versions'),
        ...published,
        translations: {
          create: [
            {
              locale: Locale.EN,
              title: `Choosing versions ${tag}`,
              excerpt: 'Exact pins.',
              content: 'Body.',
            },
            {
              locale: Locale.ES,
              title: `Cómo elegimos versiones ${tag}`,
              excerpt: 'Versión exacta.',
              content: 'Cuerpo con 100% de cobertura.',
            },
          ],
        },
      },
    });
    await prisma.post.create({
      data: {
        slug: slug('english'),
        ...published,
        translations: {
          create: [
            {
              locale: Locale.EN,
              title: `Only in English ${tag}`,
              excerpt: 'Cookies.',
              content: 'HttpOnly.',
            },
          ],
        },
      },
    });
    await prisma.post.create({
      data: {
        slug: slug('draft'),
        status: PublishStatus.DRAFT,
        translations: {
          create: [
            { locale: Locale.EN, title: `Draft versions ${tag}`, excerpt: 'x', content: 'x' },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    if (prisma) await prisma.post.deleteMany({ where: { slug: { startsWith: 'e2e-search-' } } });
    await app?.close();
  });

  it('finds live posts by text, ignoring case and accents, in the language or its fallback', async () => {
    const server = app.getHttpServer();
    const search = async (locale: string, q: string) =>
      (
        await request(server).get('/v1/posts').query({ locale, q, pageSize: 50 }).expect(200)
      ).body.items
        .map((post: { slug: string }) => post.slug)
        .filter((found: string) => found.endsWith(tag));

    // Accents and case don't matter; drafts never show.
    expect(await search('es', `VERSION ${tag}`)).toEqual([]);
    expect(await search('es', `elegimos versiones ${tag}`.toUpperCase())).toEqual([
      slug('versions'),
    ]);
    expect(await search('es', 'versión exacta')).toEqual([slug('versions')]);
    expect(await search('es', 'version exacta')).toEqual([slug('versions')]);
    // A post without Spanish is found through its English text, as the list shows it.
    expect(await search('es', `only in english ${tag}`)).toEqual([slug('english')]);
    // `%` is a literal character, not a wildcard.
    expect(await search('es', '100% de cobertura')).toEqual([slug('versions')]);
    expect(await search('es', '%')).toEqual([slug('versions')]);
    // An empty search lists everything.
    expect((await search('en', '')).length).toBe(2);
    await request(server)
      .get('/v1/posts')
      .query({ locale: 'en', q: 'x'.repeat(101) })
      .expect(400);
  });
});
