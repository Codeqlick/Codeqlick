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
const password = 'milestones-password-1';
const admin = { email: `e2e-milestones-admin-${tag}@codeqlick.test`, password };
const client = { email: `e2e-milestones-client-${tag}@codeqlick.test`, password };
const other = { email: `e2e-milestones-other-${tag}@codeqlick.test`, password };

describe('Project milestones (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let clientId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.create({
      data: { email: admin.email, name: 'E2E Milestones', role: Role.ADMIN, passwordHash },
    });
    clientId = (
      await prisma.user.create({
        data: { email: client.email, name: 'Grace', role: Role.CLIENT, passwordHash },
      })
    ).id;
    await prisma.user.create({
      data: { email: other.email, name: 'Ada', role: Role.CLIENT, passwordHash },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.clientProject.deleteMany({ where: { clientId } });
      await prisma.user.deleteMany({
        where: { email: { in: [admin.email, client.email, other.email] } },
      });
    }
    await app?.close();
  });

  it('lets the admin plan, tick off and reorder milestones that the client sees', async () => {
    const server = app.getHttpServer();
    const bearer = async (user: { email: string; password: string }) =>
      `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`;
    const auth = await bearer(admin);

    const project = await request(server)
      .post('/v1/admin/projects')
      .set('Authorization', auth)
      .send({ clientId, name: 'Tienda online', phase: 'DESIGN', progress: 10 })
      .expect(201);
    const projectId = project.body.id as string;
    expect(project.body.milestones).toEqual([]);
    const base = `/v1/admin/projects/${projectId}/milestones`;

    await request(server).post(base).set('Authorization', auth).send({ title: ' ' }).expect(400);
    const ids: string[] = [];
    for (const body of [
      { title: 'Diseño aprobado', dueDate: '2026-11-01' },
      { title: 'Versión de pruebas', description: 'Con el catálogo completo.' },
      { title: 'Lanzamiento', dueDate: '2026-12-15' },
    ]) {
      const created = await request(server)
        .post(base)
        .set('Authorization', auth)
        .send(body)
        .expect(201);
      expect(created.body.completedAt).toBeNull();
      ids.push(created.body.id as string);
    }
    const [design, staging, launch] = ids as [string, string, string];

    const done = await request(server)
      .patch(`${base}/${design}`)
      .set('Authorization', auth)
      .send({ completed: true })
      .expect(200);
    expect(done.body.completedAt).toEqual(expect.any(String));
    // Marking it done again keeps the original date.
    const again = await request(server)
      .patch(`${base}/${design}`)
      .set('Authorization', auth)
      .send({ completed: true, title: 'Diseño cerrado' })
      .expect(200);
    expect(again.body).toMatchObject({
      title: 'Diseño cerrado',
      completedAt: done.body.completedAt,
    });

    // The order must name every milestone once.
    await request(server)
      .put(`${base}/order`)
      .set('Authorization', auth)
      .send({ ids: [launch, design] })
      .expect(400);
    await request(server)
      .put(`${base}/order`)
      .set('Authorization', auth)
      .send({ ids: [design, design, launch] })
      .expect(400);
    const reordered = await request(server)
      .put(`${base}/order`)
      .set('Authorization', auth)
      .send({ ids: [design, launch, staging] })
      .expect(200);
    expect(reordered.body.map((m: { id: string }) => m.id)).toEqual([design, launch, staging]);

    await request(server).delete(`${base}/${staging}`).set('Authorization', auth).expect(204);
    await request(server).delete(`${base}/${staging}`).set('Authorization', auth).expect(404);
    await request(server)
      .patch(`/v1/admin/projects/${randomUUID()}/milestones/${design}`)
      .set('Authorization', auth)
      .send({ completed: false })
      .expect(404);

    // The client sees them in order on the portal; another client doesn't see the project.
    const clientAuth = await bearer(client);
    const portal = await request(server)
      .get(`/v1/portal/projects/${projectId}`)
      .set('Authorization', clientAuth)
      .expect(200);
    expect(portal.body.milestones).toMatchObject([
      { title: 'Diseño cerrado', completedAt: expect.any(String) },
      { title: 'Lanzamiento', dueDate: '2026-12-15T00:00:00.000Z', completedAt: null },
    ]);
    const outsider = await bearer(other);
    await request(server)
      .get(`/v1/portal/projects/${projectId}`)
      .set('Authorization', outsider)
      .expect(404);
    await request(server)
      .post(base)
      .set('Authorization', outsider)
      .send({ title: 'x' })
      .expect(403);

    const actions = await prisma.activityLog.findMany({
      where: { targetId: projectId, action: { startsWith: 'project.milestone' } },
      select: { action: true },
    });
    expect(actions.map((entry) => entry.action).toSorted()).toEqual([
      'project.milestone_added',
      'project.milestone_added',
      'project.milestone_added',
      'project.milestone_completed',
      'project.milestone_deleted',
      'project.milestone_updated',
    ]);
  });
});
