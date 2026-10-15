import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Locale, PublishStatus, Role } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const tag = randomUUID().slice(0, 8);
const tech = `E2E Tech ${tag}`;
const admin = { email: `e2e-filters-${tag}@codeqlick.test`, password: 'filters-password-1' };
const slug = (name: string) => `e2e-filters-${name}-${tag}`;

describe('Case study filters (e2e)', () => {
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
        name: 'E2E Filters',
        role: Role.ADMIN,
        passwordHash: await argon2.hash(admin.password, { type: argon2.argon2id }),
      },
    });
    const item = (name: string, technologies: string[], services: string[], live = true) =>
      prisma.portfolioItem.create({
        data: {
          slug: slug(name),
          status: live ? PublishStatus.PUBLISHED : PublishStatus.DRAFT,
          publishedAt: live ? new Date(Date.now() - 60_000) : null,
          technologies,
          services,
          translations: {
            create: [{ locale: Locale.EN, title: name, summary: 'Summary.', content: 'Body.' }],
          },
        },
      });
    await item('shop', [tech, 'Next.js'], ['web', 'design']);
    await item('app', [tech], ['mobile']);
    await item('draft', [tech], ['design'], false);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.portfolioItem.deleteMany({ where: { slug: { startsWith: 'e2e-filters-' } } });
      await prisma.user.deleteMany({ where: { email: admin.email } });
    }
    await app?.close();
  });

  it('lists the filters in use and narrows the list by technology and service', async () => {
    const server = app.getHttpServer();
    const filters = await request(server).get('/v1/portfolio/filters').expect(200);
    // Drafts don't count.
    expect(filters.body.technologies).toContainEqual({ name: tech, count: 2 });
    expect(filters.body.services.map((s: { key: string }) => s.key)).toEqual(
      expect.arrayContaining(['web', 'design', 'mobile']),
    );

    const slugs = async (query: Record<string, string>) =>
      (
        await request(server)
          .get('/v1/portfolio')
          .query({ locale: 'en', pageSize: 50, ...query })
          .expect(200)
      ).body.items
        .map((item: { slug: string }) => item.slug)
        .filter((found: string) => found.endsWith(tag))
        .toSorted();
    expect(await slugs({ technology: tech })).toEqual([slug('app'), slug('shop')]);
    expect(await slugs({ technology: tech, service: 'design' })).toEqual([slug('shop')]);
    expect(await slugs({ service: 'mobile' })).toEqual([slug('app')]);
    await request(server)
      .get('/v1/portfolio')
      .query({ locale: 'en', service: 'gardening' })
      .expect(400);

    const detail = await request(server)
      .get(`/v1/portfolio/${slug('shop')}?locale=en`)
      .expect(200);
    expect(detail.body.services).toEqual(['web', 'design']);
  });

  it('only accepts the known services when saving', async () => {
    const server = app.getHttpServer();
    const login = await request(server).post('/v1/auth/login').send(admin).expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
    const item = await prisma.portfolioItem.findUniqueOrThrow({ where: { slug: slug('app') } });
    await request(server)
      .patch(`/v1/admin/portfolio/${item.id}`)
      .set(auth)
      .send({ services: ['mobile', 'gardening'] })
      .expect(400);
    const saved = await request(server)
      .patch(`/v1/admin/portfolio/${item.id}`)
      .set(auth)
      .send({ services: ['mobile', 'support', 'mobile'] })
      .expect(200);
    expect(saved.body.services).toEqual(['mobile', 'support']);
  });
});
