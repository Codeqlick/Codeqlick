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
const password = 'template-password-1';
const admin = { email: `e2e-tpl-admin-${tag}@codeqlick.test`, password };
const name = `Web básica ${tag}`;

describe('Proposal templates (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.create({
      data: { email: admin.email, name: 'Luis', role: Role.ADMIN, passwordHash },
    });
    ids.client = (
      await prisma.user.create({
        data: {
          email: `e2e-tpl-client-${tag}@codeqlick.test`,
          name: 'Marta',
          role: Role.CLIENT,
          passwordHash,
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.proposalTemplate.deleteMany({ where: { name: { contains: tag } } });
      await prisma.proposal.deleteMany({ where: { clientId: ids.client! } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
  });

  it('saves a proposal as a template and manages templates', async () => {
    const server = app.getHttpServer();
    const login = await request(server).post('/v1/auth/login').send(admin).expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken as string}` };

    const proposal = await request(server)
      .post('/v1/admin/proposals')
      .set(auth)
      .send({
        clientId: ids.client,
        title: 'Web para Peluquería Marta',
        summary: 'Web de una página.',
        terms: '50 % al empezar.',
        validUntil: new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10),
        items: [
          { description: 'Web básica', quantity: 1, unitPrice: 25_000 },
          { description: 'Mantenimiento (mes)', quantity: 3, unitPrice: 1_900 },
        ],
      })
      .expect(201);

    const saved = await request(server)
      .post(`/v1/admin/proposals/${proposal.body.id as string}/template`)
      .set(auth)
      .send({ name })
      .expect(200);
    expect(saved.body).toMatchObject({
      name,
      title: 'Web para Peluquería Marta',
      terms: '50 % al empezar.',
      items: [
        { description: 'Web básica', quantity: 1, unitPrice: 25_000 },
        { description: 'Mantenimiento (mes)', quantity: 3, unitPrice: 1_900 },
      ],
    });
    expect(saved.body.validDays).toBeGreaterThanOrEqual(14);

    // Saving again under the same name replaces it.
    const again = await request(server)
      .post(`/v1/admin/proposals/${proposal.body.id as string}/template`)
      .set(auth)
      .send({ name })
      .expect(200);
    expect(again.body.id).toBe(saved.body.id);

    const list = await request(server).get('/v1/admin/proposal-templates').set(auth).expect(200);
    expect(list.body.filter((t: { name: string }) => t.name === name)).toHaveLength(1);

    const updated = await request(server)
      .put(`/v1/admin/proposal-templates/${saved.body.id as string}`)
      .set(auth)
      .send({ name, title: 'Web básica', summary: 'Todo incluido.', items: saved.body.items })
      .expect(200);
    expect(updated.body).toMatchObject({ title: 'Web básica', terms: null, validDays: null });

    await request(server)
      .post('/v1/admin/proposal-templates')
      .set(auth)
      .send({ name: `${name} 2`, title: 'X', summary: 'Y', items: [] })
      .expect(400);

    await request(server)
      .delete(`/v1/admin/proposal-templates/${saved.body.id as string}`)
      .set(auth)
      .expect(204);
    await request(server)
      .delete(`/v1/admin/proposal-templates/${saved.body.id as string}`)
      .set(auth)
      .expect(404);
  });
});
