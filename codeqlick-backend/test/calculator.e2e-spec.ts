import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Locale, Role, type Prisma } from '../src/generated/prisma/client.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'calculator-password-1';
const admin = { email: `e2e-calculator-admin-${tag}@codeqlick.test`, password };
const client = { email: `e2e-calculator-client-${tag}@codeqlick.test`, password };
const other = { email: `e2e-calculator-other-${tag}@codeqlick.test`, password };

describe('Cost calculator (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const sent: MailMessage[] = [];
  const ids: Record<string, string> = {};
  let saved: Prisma.InputJsonValue | null = null;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    saved =
      ((await prisma.setting.findUnique({ where: { key: 'calculator' } }))
        ?.value as Prisma.InputJsonValue) ?? null;
    await prisma.setting.deleteMany({ where: { key: 'calculator' } });
    vi.spyOn(app.get(MailService), 'send').mockImplementation((message: MailMessage) => {
      sent.push(message);
      return Promise.resolve();
    });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.create({
      data: { email: admin.email, name: 'Luis', role: Role.ADMIN, passwordHash },
    });
    ids.client = (
      await prisma.user.create({
        data: {
          email: client.email,
          name: 'Grace',
          role: Role.CLIENT,
          locale: Locale.ES,
          passwordHash,
        },
      })
    ).id;
    ids.other = (
      await prisma.user.create({
        data: { email: other.email, name: 'Ada', role: Role.CLIENT, passwordHash },
      })
    ).id;
    ids.project = (
      await prisma.clientProject.create({ data: { clientId: ids.client, name: 'Tienda online' } })
    ).id;
    ids.otherProject = (
      await prisma.clientProject.create({ data: { clientId: ids.other, name: 'Otra' } })
    ).id;
  });

  afterAll(async () => {
    if (prisma) {
      // The calculator is one shared setting: put back whatever was there.
      if (saved === null) await prisma.setting.deleteMany({ where: { key: 'calculator' } });
      else await prisma.setting.update({ where: { key: 'calculator' }, data: { value: saved } });
      await prisma.supportTicket.deleteMany({
        where: { clientId: { in: [ids.client!, ids.other!] } },
      });
      await prisma.clientProject.deleteMany({
        where: { clientId: { in: [ids.client!, ids.other!] } },
      });
      await prisma.user.deleteMany({
        where: { email: { in: [admin.email, client.email, other.email] } },
      });
    }
    await app?.close();
  });

  it('keeps the calculator private until the team sets its prices and publishes it', async () => {
    const server = app.getHttpServer();
    const adminAuth = {
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(admin).expect(200)).body.accessToken as string}`,
    };
    await request(server).get('/v1/calculator').expect(404);
    const defaults = await request(server).get('/v1/admin/calculator').set(adminAuth).expect(200);
    expect(defaults.body).toMatchObject({ enabled: false, sizes: { medium: 1 } });

    // Publishing without prices, or with a maximum below the minimum, is refused.
    await request(server)
      .put('/v1/admin/calculator')
      .set(adminAuth)
      .send({ ...defaults.body, enabled: true })
      .expect(400);
    const priced = {
      ...defaults.body,
      types: {
        ...defaults.body.types,
        web: { min: 2000, max: 4000, weeksMin: 3, weeksMax: 5 },
      },
      extras: { ...defaults.body.extras, payments: { min: 600, max: 1200 } },
    };
    await request(server)
      .put('/v1/admin/calculator')
      .set(adminAuth)
      .send({
        ...priced,
        types: { ...priced.types, web: { min: 5000, max: 4000, weeksMin: 3, weeksMax: 5 } },
      })
      .expect(400);
    await request(server)
      .put('/v1/admin/calculator')
      .set(adminAuth)
      .send({ ...priced, enabled: true })
      .expect(200);

    const published = await request(server).get('/v1/calculator').expect(200);
    expect(published.body).toMatchObject({
      enabled: true,
      types: { web: { min: 2000, max: 4000 } },
      extras: { payments: { min: 600 } },
    });

    await request(server)
      .put('/v1/admin/calculator')
      .set(adminAuth)
      .send({ ...priced, enabled: false })
      .expect(200);
    await request(server).get('/v1/calculator').expect(404);
    const logged = await prisma.activityLog.count({
      where: { action: 'settings.calculator_updated' },
    });
    expect(logged).toBeGreaterThanOrEqual(2);
  });
});
