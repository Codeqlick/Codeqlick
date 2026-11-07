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
const tag = randomUUID().slice(0, 8);
const password = 'drafts-password-1';
const admin = { email: `e2e-drafts-admin-${tag}@codeqlick.test`, password };
const client = { email: `e2e-drafts-client-${tag}@codeqlick.test`, password };
const other = { email: `e2e-drafts-other-${tag}@codeqlick.test`, password };

describe('Draft updates (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const sent: MailMessage[] = [];
  const ids: Record<string, string> = {};

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
      await prisma.clientProject.deleteMany({
        where: { clientId: { in: [ids.client!, ids.other!] } },
      });
      await prisma.user.deleteMany({
        where: { email: { in: [admin.email, client.email, other.email] } },
      });
    }
    await app?.close();
  });

  it('takes drafts with the release key and lets the team review and publish them', async () => {
    const server = app.getHttpServer();
    const bearer = async (user: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`,
    });
    const adminAuth = await bearer(admin);
    const clientAuth = await bearer(client);
    const projectPath = `/v1/admin/projects/${ids.project}`;
    const { key } = (
      await request(server).post(`${projectPath}/release-key`).set(adminAuth).expect(201)
    ).body as { key: string };
    const withKey = { Authorization: `Bearer ${key}` };

    await request(server).post('/v1/drafts').send({ title: 't', body: 'b' }).expect(401);
    await request(server)
      .post('/v1/drafts')
      .set(withKey)
      .send({ title: 'Semana 1', body: 'b', version: 'v0.2.0' })
      .expect(400);
    const before = sent.length;
    const draft = await request(server)
      .post('/v1/drafts')
      .set(withKey)
      .send({
        title: 'Catálogo terminado',
        body: '- Filtros por categoría\n- Paginación',
        version: 'v0.2.0',
        environment: 'STAGING',
        url: 'https://preview.tienda.test',
      })
      .expect(201);
    expect(draft.body).toMatchObject({ version: 'v0.2.0', project: { name: 'Tienda online' } });
    await vi.waitFor(() => expect(sent.length).toBe(before + 1));
    expect(sent.at(-1)?.subject).toBe(
      'Tienda online: draft ready to review — v0.2.0 · Catálogo terminado',
    );
    await request(server)
      .post('/v1/drafts')
      .set(withKey)
      .send({ title: 'Notas internas', body: 'No publicar' })
      .expect(201);

    // Invisible to the client; listed for the team, here and across projects.
    const portal = await request(server)
      .get(`/v1/portal/projects/${ids.project}`)
      .set(clientAuth)
      .expect(200);
    expect(portal.body.updates).toEqual([]);
    const drafts = await request(server).get(`${projectPath}/drafts`).set(adminAuth).expect(200);
    expect(drafts.body.map((d: { title: string }) => d.title)).toEqual([
      'Catálogo terminado',
      'Notas internas',
    ]);
    const all = await request(server).get('/v1/admin/projects/drafts').set(adminAuth).expect(200);
    expect(all.body.length).toBeGreaterThanOrEqual(2);
    const stats = await request(server).get('/v1/admin/stats').set(adminAuth).expect(200);
    expect(stats.body.drafts.pending).toBeGreaterThanOrEqual(2);

    // Published as reviewed (edited title), as a release; the client is told.
    const draftId = draft.body.id as string;
    const published = await request(server)
      .post(`${projectPath}/drafts/${draftId}/publish`)
      .set(adminAuth)
      .send({
        title: 'Catálogo de productos',
        body: '- Filtros por categoría\n- Paginación',
        version: 'v0.2.0',
        environment: 'STAGING',
        url: 'https://preview.tienda.test',
        notifyClient: true,
      })
      .expect(201);
    expect(published.body).toMatchObject({
      title: 'Catálogo de productos',
      release: { version: 'v0.2.0' },
      clientNotified: true,
      author: { name: 'Luis' },
    });
    await request(server)
      .post(`${projectPath}/drafts/${draftId}/publish`)
      .set(adminAuth)
      .send({ title: 'x', body: 'y' })
      .expect(404);

    // The other one is discarded.
    const otherDraft = drafts.body[1].id as string;
    await request(server).delete(`${projectPath}/drafts/${otherDraft}`).set(adminAuth).expect(204);
    const left = await request(server).get(`${projectPath}/drafts`).set(adminAuth).expect(200);
    expect(left.body).toEqual([]);
    const after = await request(server)
      .get(`/v1/portal/projects/${ids.project}`)
      .set(clientAuth)
      .expect(200);
    expect(after.body.updates.map((u: { title: string }) => u.title)).toEqual([
      'Catálogo de productos',
    ]);
  });
});
