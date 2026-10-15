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
const password = 'releases-password-1';
const admin = { email: `e2e-releases-admin-${tag}@codeqlick.test`, password };
const client = { email: `e2e-releases-client-${tag}@codeqlick.test`, password };
const other = { email: `e2e-releases-other-${tag}@codeqlick.test`, password };

describe('Releases (e2e)', () => {
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

  it('publishes releases from the admin panel and from a deploy pipeline with the project key', async () => {
    const server = app.getHttpServer();
    const bearer = async (user: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`,
    });
    const adminAuth = await bearer(admin);
    const clientAuth = await bearer(client);
    const projectPath = `/v1/admin/projects/${ids.project}`;

    // From the admin panel: the client is emailed in Spanish, with the version.
    const fromPanel = await request(server)
      .post(`${projectPath}/releases`)
      .set(adminAuth)
      .send({
        version: 'v0.1.0',
        environment: 'STAGING',
        url: 'https://preview.tienda.test',
        title: 'Primera versión navegable',
        body: '- Portada\n- Catálogo',
        notifyClient: true,
        requestApproval: true,
      })
      .expect(201);
    expect(fromPanel.body).toMatchObject({
      release: { version: 'v0.1.0', environment: 'STAGING', url: 'https://preview.tienda.test' },
      approvalRequested: true,
      clientNotified: true,
      author: { name: 'Luis' },
    });
    expect(sent.at(-1)?.text).toContain(
      'Hemos publicado la versión v0.1.0 en el entorno de pruebas',
    );
    expect(sent.at(-1)?.text).toContain('https://preview.tienda.test');

    // A deploy pipeline: no key, a wrong key, then the project's key.
    const release = {
      version: 'v1.0.0',
      environment: 'PRODUCTION',
      url: 'https://tienda.test',
      title: 'Lanzamiento',
      body: 'La tienda ya está en producción.',
    };
    await request(server).post('/v1/releases').send(release).expect(401);
    await request(server)
      .post('/v1/releases')
      .set('Authorization', 'Bearer cqr_wrong')
      .send(release)
      .expect(401);
    await request(server).post(`${projectPath}/release-key`).set(clientAuth).expect(403);
    const { key } = (
      await request(server).post(`${projectPath}/release-key`).set(adminAuth).expect(201)
    ).body as { key: string };
    expect(key).toMatch(/^cqr_/);
    const published = await request(server)
      .post('/v1/releases')
      .set('Authorization', `Bearer ${key}`)
      .send(release)
      .expect(201);
    expect(published.body).toMatchObject({
      release: { version: 'v1.0.0', environment: 'PRODUCTION' },
      author: { name: 'Codeqlick' },
    });

    // The project now points at both addresses; the client sees the releases among the updates.
    const project = await request(server).get(projectPath).set(adminAuth).expect(200);
    expect(project.body).toMatchObject({
      stagingUrl: 'https://preview.tienda.test',
      productionUrl: 'https://tienda.test',
      releaseKeyCreatedAt: expect.any(String),
    });
    const portal = await request(server)
      .get(`/v1/portal/projects/${ids.project}`)
      .set(clientAuth)
      .expect(200);
    expect(
      portal.body.updates.map((u: { release: { version: string } | null }) => u.release?.version),
    ).toEqual(['v1.0.0', 'v0.1.0']);

    // A new key replaces the old one; revoking leaves none.
    const second = (
      await request(server).post(`${projectPath}/release-key`).set(adminAuth).expect(201)
    ).body.key as string;
    await request(server)
      .post('/v1/releases')
      .set('Authorization', `Bearer ${key}`)
      .send(release)
      .expect(401);
    await request(server).delete(`${projectPath}/release-key`).set(adminAuth).expect(204);
    await request(server)
      .post('/v1/releases')
      .set('Authorization', `Bearer ${second}`)
      .send(release)
      .expect(401);

    const actions = await prisma.activityLog.findMany({
      where: { targetId: ids.project },
      select: { action: true, actorName: true },
    });
    expect(actions).toEqual(
      expect.arrayContaining([
        { action: 'project.release_published', actorName: 'Luis' },
        { action: 'project.release_published', actorName: 'Despliegue automático' },
        { action: 'project.release_key_revoked', actorName: 'Luis' },
      ]),
    );
  });
});
