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
const password = 'comments-password-1';
const admin = { email: `e2e-comments-admin-${tag}@codeqlick.test`, password };
const client = { email: `e2e-comments-client-${tag}@codeqlick.test`, password };
const other = { email: `e2e-comments-other-${tag}@codeqlick.test`, password };

describe('Comments and approvals on project updates (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let clientId: string;
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
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.create({
      data: { email: admin.email, name: 'Luis', role: Role.ADMIN, passwordHash },
    });
    clientId = (
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

  it('lets the client comment and approve, and the team answer', async () => {
    const server = app.getHttpServer();
    const bearer = async (user: { email: string; password: string }) =>
      `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`;
    const adminAuth = await bearer(admin);
    const clientAuth = await bearer(client);
    const otherAuth = await bearer(other);

    const project = await request(server)
      .post('/v1/admin/projects')
      .set('Authorization', adminAuth)
      .send({ clientId, name: 'Tienda online', phase: 'DESIGN', progress: 30 })
      .expect(201);
    const projectId = project.body.id as string;

    const posted = await request(server)
      .post(`/v1/admin/projects/${projectId}/updates`)
      .set('Authorization', adminAuth)
      .send({
        title: 'Diseño de portada',
        body: 'Aquí está.',
        notifyClient: true,
        requestApproval: true,
      })
      .expect(201);
    const updateId = posted.body.id as string;
    expect(posted.body).toMatchObject({
      approvalRequested: true,
      approvedAt: null,
      approvedBy: null,
      comments: [],
    });
    expect(sent.at(-1)?.subject).toBe(
      'Tienda online: Diseño de portada (pendiente de tu aprobación)',
    );

    const plain = await request(server)
      .post(`/v1/admin/projects/${projectId}/updates`)
      .set('Authorization', adminAuth)
      .send({ title: 'Nota', body: 'Sin aprobación.' })
      .expect(201);

    const portal = `/v1/portal/projects/${projectId}/updates`;
    const beforeClient = sent.length;

    // The client comments: the team is emailed, in English, with the client as reply-to.
    await request(server)
      .post(`${portal}/${updateId}/comments`)
      .set('Authorization', clientAuth)
      .send({ body: '  ' })
      .expect(400);
    const comment = await request(server)
      .post(`${portal}/${updateId}/comments`)
      .set('Authorization', clientAuth)
      .send({ body: '¿Podemos probar otro color?' })
      .expect(201);
    expect(comment.body).toMatchObject({
      body: '¿Podemos probar otro color?',
      author: { name: 'Grace', team: false },
    });
    await vi.waitFor(() => expect(sent.length).toBe(beforeClient + 1));
    expect(sent.at(-1)).toMatchObject({
      replyTo: client.email,
      subject: 'Tienda online: Grace commented on "Diseño de portada"',
    });

    // The team answers from the admin panel: the client is emailed in Spanish.
    const answer = await request(server)
      .post(`/v1/admin/projects/${projectId}/updates/${updateId}/comments`)
      .set('Authorization', adminAuth)
      .send({ body: 'Claro, te mandamos dos opciones.' })
      .expect(201);
    expect(answer.body).toMatchObject({
      author: { name: 'Luis', team: true },
      clientNotified: true,
    });
    expect(sent.at(-1)).toMatchObject({
      to: client.email,
      subject: 'Tienda online: nuevo comentario',
    });
    expect(sent.at(-1)?.text).toContain(`/es/portal/projects/${projectId}#update-${updateId}`);

    // Only the client approves, only updates that ask for it, and only once.
    await request(server)
      .post(`${portal}/${updateId}/approval`)
      .set('Authorization', adminAuth)
      .expect(403);
    await request(server)
      .post(`${portal}/${updateId}/approval`)
      .set('Authorization', otherAuth)
      .expect(404);
    await request(server)
      .post(`${portal}/${plain.body.id as string}/approval`)
      .set('Authorization', clientAuth)
      .expect(400);
    const approved = await request(server)
      .post(`${portal}/${updateId}/approval`)
      .set('Authorization', clientAuth)
      .expect(200);
    expect(approved.body).toMatchObject({
      approvedBy: { name: 'Grace' },
      approvedAt: expect.any(String),
    });
    await vi.waitFor(() =>
      expect(sent.at(-1)?.subject).toBe('Tienda online: Grace approved "Diseño de portada"'),
    );
    const again = await request(server)
      .post(`${portal}/${updateId}/approval`)
      .set('Authorization', clientAuth)
      .expect(200);
    expect(again.body.approvedAt).toBe(approved.body.approvedAt);

    // Another client can't comment; an unknown update is a 404.
    await request(server)
      .post(`${portal}/${updateId}/comments`)
      .set('Authorization', otherAuth)
      .send({ body: 'Hola' })
      .expect(404);
    await request(server)
      .post(`${portal}/${randomUUID()}/comments`)
      .set('Authorization', clientAuth)
      .send({ body: 'Hola' })
      .expect(404);

    // The project shows the thread in order, for both sides.
    const view = await request(server)
      .get(`/v1/portal/projects/${projectId}`)
      .set('Authorization', clientAuth)
      .expect(200);
    const thread = view.body.updates.find((u: { id: string }) => u.id === updateId);
    expect(thread.comments.map((c: { author: { name: string } }) => c.author.name)).toEqual([
      'Grace',
      'Luis',
    ]);

    const actions = await prisma.activityLog.findMany({
      where: {
        targetId: projectId,
        action: { in: ['project.comment_added', 'project.update_approved'] },
      },
      select: { action: true },
    });
    expect(actions.map((entry) => entry.action).toSorted()).toEqual([
      'project.comment_added',
      'project.comment_added',
      'project.update_approved',
    ]);
  });
});
