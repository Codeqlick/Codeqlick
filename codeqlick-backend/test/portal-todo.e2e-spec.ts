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
import { MailService } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'todo-password-1';
const emails = [`e2e-todo-a-${tag}@codeqlick.test`, `e2e-todo-b-${tag}@codeqlick.test`];

describe('What waits on the client (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const ids: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    vi.spyOn(app.get(MailService), 'send').mockResolvedValue(undefined);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    for (const email of emails) {
      const user = await prisma.user.create({
        data: { email, name: 'Todo', role: Role.CLIENT, passwordHash },
      });
      ids.push(user.id);
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.clientProject.deleteMany({ where: { clientId: { in: ids } } });
      await prisma.proposal.deleteMany({ where: { clientId: { in: ids } } });
      await prisma.supportTicket.deleteMany({ where: { clientId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await app?.close();
  });

  it('lists approvals, proposals, requests and the brief waiting on the client, and only theirs', async () => {
    const server = app.getHttpServer();
    const [clientId] = ids as [string, string];
    const project = await prisma.clientProject.create({ data: { clientId, name: 'Tienda' } });
    const update = await prisma.projectUpdate.create({
      data: { projectId: project.id, title: 'Portada', body: 'A o B', approvalRequested: true },
    });
    await prisma.projectUpdate.create({
      data: { projectId: project.id, title: 'Sin aprobación', body: 'Nada' },
    });
    await prisma.proposal.create({
      data: { clientId, title: 'Blog', summary: 'Un blog', status: 'SENT', sentAt: new Date() },
    });
    await prisma.proposal.create({
      data: {
        clientId,
        title: 'Caducada',
        summary: 'Vieja',
        status: 'SENT',
        validUntil: new Date('2020-01-01'),
      },
    });
    await prisma.proposal.create({ data: { clientId, title: 'Borrador', summary: 'x' } });
    await prisma.supportTicket.create({
      data: {
        clientId,
        projectId: project.id,
        type: 'QUESTION',
        title: 'Pedidos',
        status: 'WAITING_CLIENT',
      },
    });
    await prisma.supportTicket.create({
      data: { clientId, type: 'BUG', title: 'Abierta', status: 'OPEN' },
    });
    await prisma.projectBrief.create({ data: { projectId: project.id } });

    const login = await request(server)
      .post('/v1/auth/login')
      .send({ email: emails[0], password })
      .expect(200);
    const auth = `Bearer ${login.body.accessToken as string}`;
    const { body } = await request(server).get('/v1/portal/todo').set('Authorization', auth);
    const items = (body as { items: Array<{ kind: string; title: string; id: string }> }).items;
    expect(items.map((item) => item.kind).sort()).toEqual([
      'approval',
      'brief',
      'proposal',
      'ticket',
    ]);
    expect(items.find((item) => item.kind === 'approval')).toMatchObject({
      id: update.id,
      title: 'Portada',
      projectName: 'Tienda',
    });
    expect(items.find((item) => item.kind === 'ticket')?.title).toMatch(/^#\d+ Pedidos$/);

    // Approved: no longer waiting.
    await request(server)
      .post(`/v1/portal/projects/${project.id}/updates/${update.id}/approval`)
      .set('Authorization', auth)
      .expect(200);
    const after = await request(server).get('/v1/portal/todo').set('Authorization', auth);
    expect(
      (after.body as { items: Array<{ kind: string }> }).items.some(
        (item) => item.kind === 'approval',
      ),
    ).toBe(false);

    // Another client sees none of it.
    const other = await request(server)
      .post('/v1/auth/login')
      .send({ email: emails[1], password })
      .expect(200);
    await request(server)
      .get('/v1/portal/todo')
      .set('Authorization', `Bearer ${other.body.accessToken as string}`)
      .expect(200, { items: [] });
  });
});
