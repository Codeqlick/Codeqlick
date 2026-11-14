import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Locale, Role } from '../src/generated/prisma/client.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const email = `e2e-new-device-${randomUUID().slice(0, 8)}@codeqlick.test`;
const password = 'new-device-password-1';

const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

describe('New-device sign-in email (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const sent: MailMessage[] = [];

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
        email,
        name: 'E2E New Device',
        role: Role.CLIENT,
        locale: Locale.ES,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      },
    });
  });

  afterAll(async () => {
    if (prisma) await prisma.user.deleteMany({ where: { email } });
    await app?.close();
  });

  it('emails once per new browser and system, never for a known one', async () => {
    const server = app.getHttpServer();
    const signIn = (userAgent: string) =>
      request(server)
        .post('/v1/auth/login')
        .set('User-Agent', userAgent)
        .send({ email, password })
        .expect(200);
    const mine = () => sent.filter((message) => message.to === email);

    await signIn(FIREFOX_LINUX);
    expect(mine()).toHaveLength(1);
    expect(mine()[0]?.subject).toBe('Nuevo inicio de sesión en tu cuenta — Codeqlick');
    expect(mine()[0]?.text).toContain('Firefox en Linux');
    expect(mine()[0]?.text).toContain('/es/portal/account');

    // Same browser and system, newer version: known.
    await signIn(FIREFOX_LINUX.replaceAll('140.0', '141.0'));
    expect(mine()).toHaveLength(1);

    await signIn(SAFARI_IPHONE);
    expect(mine()).toHaveLength(2);
    expect(mine()[1]?.text).toContain('Safari en iOS');

    // An agent that names neither: nothing to compare, nothing sent.
    await signIn('curl/8.7.1');
    expect(mine()).toHaveLength(2);
  });
});
