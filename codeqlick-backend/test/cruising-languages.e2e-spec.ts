import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AppConfigService } from '../src/config/app-config.service.js';
import { Role } from '../src/generated/prisma/client.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'languages-password-1';
const email = `e2e-lang-fr-${tag}@codeqlick.test`;
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';

describe('Cruising in more languages (decision 103, e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let userId: string;
  let token: string;
  let adminAuth: { Authorization: string };
  const sent: MailMessage[] = [];
  const server = () => app.getHttpServer();
  const mine = () => sent.filter((message) => message.to === email);

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
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await prisma.user.create({
      data: { email, name: 'Fabien', role: Role.CLIENT, passwordHash },
    });
    userId = user.id;
    const login = await request(server())
      .post('/v1/auth/login')
      .send({ email, password })
      .expect(200);
    token = (login.body as { accessToken: string }).accessToken;
    const adminEmail = `e2e-lang-admin-${tag}@codeqlick.test`;
    const admin = await prisma.user.create({
      data: { email: adminEmail, name: 'Admin', role: Role.ADMIN, passwordHash },
    });
    const adminToken = await app
      .get(JwtService)
      .signAsync({ sub: admin.id, email: adminEmail, name: 'Admin', role: Role.ADMIN });
    adminAuth = { Authorization: `Bearer ${adminToken}` };
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cruisingSpot.deleteMany({ where: { name: { contains: tag } } });
      await prisma.signupToken.deleteMany({ where: { email: { contains: `-${tag}@` } } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
  });

  it('sets the account to French, and refuses a language nobody speaks', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    await request(server()).patch('/v1/auth/me').set(auth).send({ locale: 'nl' }).expect(400);
    await request(server()).patch('/v1/auth/me').set(auth).send({ locale: 'fr' }).expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).locale).toBe('FR');
    const status = await request(server()).get('/v1/cruising/me').set(auth).expect(200);
    expect((status.body as { locale: string }).locale).toBe('fr');
  });

  it("writes Cruising's emails in French", async () => {
    const version = app.get(AppConfigService).cruisingTermsVersion;
    await prisma.cruisingProfile.create({
      data: { userId, birthYear: 1990, termsVersion: version, acceptedAt: new Date() },
    });
    const spot = await prisma.cruisingSpot.create({
      data: {
        slug: `lang-${tag}`,
        name: `Lang ${tag}`,
        type: 'BEACH',
        lat: 10.9,
        lng: -149.1,
        countryCode: 'ES',
        city: `Playa ${tag}`,
        citySlug: `playa-${tag}`,
        description: 'A quiet place at the end of the beach.',
        status: 'PENDING',
        createdById: userId,
      },
    });
    await request(server())
      .post(`/v1/admin/cruising/spots/${spot.id}/approve`)
      .set(adminAuth)
      .expect(204);
    const mail = mine().at(-1);
    expect(mail?.subject).toBe('Ton lieu est en ligne — Cruising');
    expect(mail?.html).toContain('lang="fr"');
    expect(mail?.text).toContain('/fr/my-spots');
  });

  it('writes every other email in English', async () => {
    sent.length = 0;
    await request(server())
      .post('/v1/auth/login')
      .set('User-Agent', FIREFOX_LINUX)
      .send({ email, password })
      .expect(200);
    const mail = mine().at(-1);
    expect(mail?.subject).toBe('New sign-in to your account — Codeqlick');
    expect(mail?.html).toContain('lang="en"');
    expect(mail?.text).toContain('account.localhost:3000/en/security');
  });

  it('signs up from Cruising in French: account in French, email in English, link back to Cruising', async () => {
    sent.length = 0;
    const newcomer = `e2e-lang-new-${tag}@codeqlick.test`;
    await request(server())
      .post('/v1/auth/register')
      .set('X-Forwarded-For', '203.0.113.103')
      .send({
        email: newcomer,
        name: 'Nouveau',
        password: 'a-long-password-for-signup-9',
        locale: 'fr',
        acceptPrivacy: true,
        app: 'cruising',
      })
      .expect(202);
    const mail = sent.find((message) => message.to === newcomer);
    expect(mail?.html).toContain('lang="en"');
    expect(mail?.text).toMatch(
      /account\.[^/\s]+\/fr\/register\/confirm\?token=[\w-]+&app=cruising/,
    );
    const pending = await prisma.signupToken.findFirstOrThrow({ where: { email: newcomer } });
    expect(pending.locale).toBe('FR');
  });
});
