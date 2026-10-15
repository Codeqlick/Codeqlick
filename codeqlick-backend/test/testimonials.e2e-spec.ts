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
const admin = { email: `e2e-testimonials-${tag}@codeqlick.test`, password: 'testimonials-pass-1' };
const slug = `e2e-testimonial-${tag}`;

describe('Case study testimonials (e2e)', () => {
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
        name: 'E2E Testimonials',
        role: Role.ADMIN,
        passwordHash: await argon2.hash(admin.password, { type: argon2.argon2id }),
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.portfolioItem.deleteMany({ where: { slug } });
      await prisma.user.deleteMany({ where: { email: admin.email } });
    }
    await app?.close();
  });

  it('shows a testimonial in the languages that have its quote, and filters by it', async () => {
    const server = app.getHttpServer();
    const login = await request(server).post('/v1/auth/login').send(admin).expect(200);
    const auth = `Bearer ${login.body.accessToken as string}`;

    const created = await request(server)
      .post('/v1/admin/portfolio')
      .set('Authorization', auth)
      .send({
        slug,
        status: 'PUBLISHED',
        clientName: 'Acme',
        testimonialAuthor: 'Marta Ruiz',
        technologies: ['Next.js'],
        sortOrder: -100_000,
        translations: [
          { locale: 'en', title: 'Acme shop', summary: 'A shop.', content: 'Body.' },
          {
            locale: 'es',
            title: 'Tienda Acme',
            summary: 'Una tienda.',
            content: 'Cuerpo.',
            testimonialQuote: 'Entendieron el negocio desde el primer día.',
            testimonialRole: 'Fundadora, Acme',
          },
        ],
      })
      .expect(201);
    expect(created.body.testimonialAuthor).toBe('Marta Ruiz');
    expect(created.body.translations).toMatchObject([
      { locale: 'en', testimonialQuote: null, testimonialRole: null },
      { locale: 'es', testimonialRole: 'Fundadora, Acme' },
    ]);

    const es = await request(server).get(`/v1/portfolio/${slug}?locale=es`).expect(200);
    expect(es.body.testimonial).toEqual({
      quote: 'Entendieron el negocio desde el primer día.',
      author: 'Marta Ruiz',
      role: 'Fundadora, Acme',
    });
    const en = await request(server).get(`/v1/portfolio/${slug}?locale=en`).expect(200);
    expect(en.body.testimonial).toBeNull();

    const slugs = async (locale: string) =>
      (
        await request(server)
          .get(`/v1/portfolio?locale=${locale}&testimonials=true&pageSize=50`)
          .expect(200)
      ).body.items.map((item: { slug: string }) => item.slug);
    expect(await slugs('es')).toContain(slug);
    expect(await slugs('en')).not.toContain(slug);

    // Without an author there is no testimonial, even with a quote.
    await request(server)
      .patch(`/v1/admin/portfolio/${created.body.id as string}`)
      .set('Authorization', auth)
      .send({ testimonialAuthor: null })
      .expect(200);
    const after = await request(server).get(`/v1/portfolio/${slug}?locale=es`).expect(200);
    expect(after.body.testimonial).toBeNull();
    expect(await slugs('es')).not.toContain(slug);
  });
});
