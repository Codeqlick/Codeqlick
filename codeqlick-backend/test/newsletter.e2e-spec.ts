import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Role } from '../src/generated/prisma/client.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { NewsletterService } from '../src/modules/newsletter/newsletter.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: sign-ups are limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'newsletter-password-1';
const admin = { email: `e2e-nl-admin-${tag}@codeqlick.test`, password };
const reader = `e2e-nl-reader-${tag}@codeqlick.test`;
const postSlug = `e2e-nl-post-${tag}`;

const confirmToken = (message: MailMessage | undefined) =>
  /newsletter\/confirm\?token=([\w-]+)/.exec(message?.text ?? '')?.[1];

describe('Newsletter (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let auth: { Authorization: string };
  const sent: MailMessage[] = [];
  const to = (email: string) => sent.filter((message) => message.to === email);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    vi.spyOn(app.get(MailService), 'send').mockImplementation((message: MailMessage) => {
      sent.push(message);
      return Promise.resolve();
    });
    await prisma.user.create({
      data: {
        email: admin.email,
        name: 'Luis',
        role: Role.ADMIN,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      },
    });
    const login = await request(app.getHttpServer()).post('/v1/auth/login').send(admin).expect(200);
    auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.newsletterSubscriber.deleteMany({ where: { email: { contains: `-${tag}@` } } });
      await prisma.post.deleteMany({ where: { slug: postSlug } });
      await prisma.user.deleteMany({ where: { email: admin.email } });
    }
    await app?.close();
  });

  it('refuses a disposable address and ignores the honeypot', async () => {
    const server = app.getHttpServer();
    const response = await request(server)
      .post('/v1/newsletter')
      .set('X-Forwarded-For', '203.0.113.51')
      .send({ email: `bot-${tag}@mailinator.com`, locale: 'en', acceptPrivacy: true })
      .expect(400);
    expect(response.body.errors).toEqual([{ path: 'email', message: 'disposable' }]);

    await request(server)
      .post('/v1/newsletter')
      .set('X-Forwarded-For', '203.0.113.51')
      .send({ email: `bot2-${tag}@example.com`, locale: 'en', acceptPrivacy: true, website: 'x' })
      .expect(202);
    expect(
      await prisma.newsletterSubscriber.count({ where: { email: { contains: `-${tag}@` } } }),
    ).toBe(0);
  });

  it('signs up with a confirmed email, one email per 10 minutes, and unsubscribes in one click', async () => {
    const server = app.getHttpServer();
    const body = { email: reader.toUpperCase(), locale: 'es', acceptPrivacy: true };
    const ip = '203.0.113.52';

    await request(server).post('/v1/newsletter').set('X-Forwarded-For', ip).send(body).expect(202);
    expect(to(reader)).toHaveLength(1);
    // Inside 10 minutes: the same answer, no second email.
    await request(server).post('/v1/newsletter').set('X-Forwarded-For', ip).send(body).expect(202);
    expect(to(reader)).toHaveLength(1);
    const pending = await prisma.newsletterSubscriber.findUniqueOrThrow({
      where: { email: reader },
    });
    expect(pending).toMatchObject({ status: 'PENDING', locale: 'ES' });

    await request(server)
      .post('/v1/newsletter/confirm')
      .send({ token: 'not-a-real-token' })
      .expect(400);
    const token = confirmToken(to(reader)[0]);
    expect(token).toBeDefined();
    const confirmed = await request(server)
      .post('/v1/newsletter/confirm')
      .send({ token })
      .expect(200);
    expect(confirmed.body).toEqual({ email: reader, locale: 'es' });
    // The token works once.
    await request(server).post('/v1/newsletter/confirm').send({ token }).expect(400);

    // An active address is told nothing and sent nothing.
    await request(server).post('/v1/newsletter').set('X-Forwarded-For', ip).send(body).expect(202);
    expect(to(reader)).toHaveLength(1);

    // Admin list.
    const list = await request(server)
      .get('/v1/admin/newsletter')
      .query({ status: 'ACTIVE', q: `reader-${tag}` })
      .set(auth)
      .expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ email: reader, status: 'ACTIVE', locale: 'es' });
    expect(list.body.counts.active).toBeGreaterThanOrEqual(1);
    await request(server).get('/v1/admin/newsletter').expect(401);

    // A new post goes out once.
    await prisma.post.updateMany({
      where: { newsletterSentAt: null, slug: { not: postSlug } },
      data: { newsletterSentAt: new Date() },
    });
    await prisma.post.create({
      data: {
        slug: postSlug,
        status: 'PUBLISHED',
        publishedAt: new Date(Date.now() - 60_000),
        translations: {
          create: [
            { locale: 'EN', title: 'English title', excerpt: 'English excerpt', content: 'Body' },
            { locale: 'ES', title: 'Título', excerpt: 'Extracto', content: 'Cuerpo' },
          ],
        },
      },
    });
    const newsletter = app.get(NewsletterService);
    await newsletter.sendNewPosts();
    await newsletter.sendNewPosts();
    const posts = to(reader).slice(1);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ subject: 'Título' });
    expect(posts[0]?.text).toContain(`/es/blog/${postSlug}`);
    expect(posts[0]?.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    const oneClick = /<[^>]*\/newsletter\/unsubscribe\/([\w-]+)>/.exec(
      posts[0]?.headers?.['List-Unsubscribe'] ?? '',
    )?.[1];
    expect(oneClick).toBeDefined();
    const marked = await prisma.post.findUniqueOrThrow({ where: { slug: postSlug } });
    expect(marked.newsletterSentAt).not.toBeNull();

    // The footer link opened with a GET only redirects to the page with the button.
    await request(server)
      .get(`/v1/newsletter/unsubscribe/${oneClick}`)
      .redirects(0)
      .expect(302)
      .expect('Location', /\/es\/newsletter\/unsubscribe\?token=/);
    expect(
      (await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email: reader } })).status,
    ).toBe('ACTIVE');
    await request(server)
      .get('/v1/newsletter/unsubscribe/unknown-token')
      .redirects(0)
      .expect(302)
      .expect('Location', /\/en\/newsletter\/unsubscribe\?token=unknown-token/);

    // One-click unsubscribe (RFC 8058): a urlencoded form, no sign-in.
    await request(server)
      .post(`/v1/newsletter/unsubscribe/${oneClick}`)
      .type('form')
      .send({ 'List-Unsubscribe': 'One-Click' })
      .expect(200, { email: reader });
    // Idempotent, also with the JSON route.
    await request(server)
      .post('/v1/newsletter/unsubscribe')
      .send({ token: oneClick })
      .expect(200, { email: reader });
    await request(server).post('/v1/newsletter/unsubscribe').send({ token: 'unknown' }).expect(404);
    const left = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email: reader } });
    expect(left.status).toBe('UNSUBSCRIBED');
    expect(left.unsubscribedAt).not.toBeNull();
  });

  it('deletes a subscriber on request and logs it', async () => {
    const server = app.getHttpServer();
    const row = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email: reader } });

    await request(server).delete(`/v1/admin/newsletter/${row.id}`).expect(401);
    await request(server).delete(`/v1/admin/newsletter/${row.id}`).set(auth).expect(204);
    await request(server).delete(`/v1/admin/newsletter/${row.id}`).set(auth).expect(404);

    const log = await request(server)
      .get('/v1/admin/activity')
      .query({ targetType: 'newsletter' })
      .set(auth)
      .expect(200);
    const entries = log.body.items as Array<{ action: string; target: { id: string } }>;
    expect(
      entries.some(
        (entry) => entry.action === 'newsletter.subscriber_deleted' && entry.target.id === row.id,
      ),
    ).toBe(true);
  });
});
