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
const password = 'tasks-password-1';
const admin = { email: `e2e-tasks-admin-${tag}@codeqlick.test`, password };
const client = { email: `e2e-tasks-client-${tag}@codeqlick.test`, password };
const other = { email: `e2e-tasks-other-${tag}@codeqlick.test`, password };

describe('Project tasks (e2e)', () => {
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

  it('turns requests into tasks, resolves them when done and lets the repository follow them', async () => {
    const server = app.getHttpServer();
    const bearer = async (user: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`,
    });
    const adminAuth = await bearer(admin);
    const clientAuth = await bearer(client);
    const otherAuth = await bearer(other);
    const tasksPath = `/v1/admin/projects/${ids.project}/tasks`;

    // A request from the client becomes a task on its project; the request moves on.
    const ticket = await request(server)
      .post('/v1/portal/tickets')
      .set(clientAuth)
      .send({
        type: 'CHANGE',
        title: 'Botón de WhatsApp en la ficha',
        body: 'Queremos un botón para preguntar por el producto.',
        projectId: ids.project,
      })
      .expect(201);
    const ticketId = ticket.body.id as string;
    await request(server)
      .post(`/v1/admin/tickets/${ticketId}/task`)
      .set(adminAuth)
      .send({ projectId: ids.otherProject })
      .expect(400);
    const fromTicket = await request(server)
      .post(`/v1/admin/tickets/${ticketId}/task`)
      .set(adminAuth)
      .send({})
      .expect(201);
    expect(fromTicket.body).toMatchObject({
      title: 'Botón de WhatsApp en la ficha',
      description: 'Queremos un botón para preguntar por el producto.',
      status: 'TODO',
      ticket: { id: ticketId },
    });
    const inProgress = await request(server)
      .get(`/v1/admin/tickets/${ticketId}`)
      .set(adminAuth)
      .expect(200);
    expect(inProgress.body).toMatchObject({
      status: 'IN_PROGRESS',
      tasks: [
        {
          title: 'Botón de WhatsApp en la ficha',
          status: 'TODO',
          project: { name: 'Tienda online' },
        },
      ],
    });

    // Planned work, added by the team.
    await request(server).post(tasksPath).set(adminAuth).send({ title: '' }).expect(400);
    await request(server)
      .post(tasksPath)
      .set(adminAuth)
      .send({ title: 'Optimizar imágenes', description: 'Nota interna' })
      .expect(201);

    // The client sees titles and statuses, not descriptions; other clients nothing.
    const clientView = await request(server)
      .get(`/v1/portal/projects/${ids.project}/tasks`)
      .set(clientAuth)
      .expect(200);
    expect(clientView.body).toHaveLength(2);
    expect(clientView.body[0]).not.toHaveProperty('description');
    await request(server)
      .get(`/v1/portal/projects/${ids.project}/tasks`)
      .set(otherAuth)
      .expect(404);

    // From the repository, with the project's release key.
    const { key } = (
      await request(server)
        .post(`/v1/admin/projects/${ids.project}/release-key`)
        .set(adminAuth)
        .expect(201)
    ).body as { key: string };
    const withKey = { Authorization: `Bearer ${key}` };
    await request(server).get('/v1/tasks').expect(401);
    const open = await request(server).get('/v1/tasks?status=open').set(withKey).expect(200);
    expect(open.body.map((t: { title: string }) => t.title).toSorted()).toEqual([
      'Botón de WhatsApp en la ficha',
      'Optimizar imágenes',
    ]);
    const taskId = fromTicket.body.id as string;
    await request(server)
      .patch('/v1/tasks/not-a-uuid')
      .set(withKey)
      .send({ status: 'DONE' })
      .expect(400);
    await request(server)
      .patch(`/v1/tasks/${taskId}`)
      .set(withKey)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);

    // Done: the request is resolved and the client is told.
    const before = sent.length;
    const done = await request(server)
      .patch(`/v1/tasks/${taskId}`)
      .set(withKey)
      .send({ status: 'DONE' })
      .expect(200);
    expect(done.body).toMatchObject({ status: 'DONE', doneAt: expect.any(String) });
    const resolved = await request(server)
      .get(`/v1/admin/tickets/${ticketId}`)
      .set(adminAuth)
      .expect(200);
    expect(resolved.body.status).toBe('RESOLVED');
    await vi.waitFor(() => expect(sent.length).toBeGreaterThan(before));
    expect(sent.at(-1)).toMatchObject({ to: client.email });

    // Done tasks go last; deleting one.
    const list = await request(server).get(tasksPath).set(adminAuth).expect(200);
    expect(list.body.map((t: { status: string }) => t.status)).toEqual(['TODO', 'DONE']);
    await request(server)
      .delete(`${tasksPath}/${list.body[0].id as string}`)
      .set(adminAuth)
      .expect(204);

    const actions = await prisma.activityLog.findMany({
      where: { targetId: ids.project, action: { startsWith: 'project.task_' } },
      select: { action: true, actorName: true },
    });
    expect(actions).toEqual(
      expect.arrayContaining([
        { action: 'project.task_created', actorName: 'Luis' },
        { action: 'project.task_updated', actorName: 'Despliegue automático' },
        { action: 'project.task_deleted', actorName: 'Luis' },
      ]),
    );
  });
});
