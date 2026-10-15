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
const password = 'team-password-1';
const admin = { email: `e2e-team-admin-${tag}@codeqlick.test`, password };
const client = { email: `e2e-team-client-${tag}@codeqlick.test`, password };
const member = { email: `e2e-team-member-${tag}@codeqlick.test`, password };
const nested = { email: `e2e-team-nested-${tag}@codeqlick.test`, password };
const other = { email: `e2e-team-other-${tag}@codeqlick.test`, password };

describe('Client company team (e2e)', () => {
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
      await prisma.user.deleteMany({ where: { email: { in: [member.email, nested.email] } } });
      await prisma.user.deleteMany({
        where: { email: { in: [admin.email, client.email, other.email] } },
      });
    }
    await app?.close();
  });

  it('lets the people of a client company see and act on its account', async () => {
    const server = app.getHttpServer();
    const bearer = async (user: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`,
    });
    const adminAuth = await bearer(admin);

    // The admin adds a person to the client's account (here with a password, to sign in).
    const added = await request(server)
      .post('/v1/admin/users')
      .set(adminAuth)
      .send({ ...member, name: 'Hedy', role: 'CLIENT', locale: 'en', memberOfId: ids.client })
      .expect(201);
    expect(added.body).toMatchObject({ memberOfId: ids.client });
    await request(server)
      .post('/v1/admin/users')
      .set(adminAuth)
      .send({ ...nested, name: 'X', role: 'CLIENT', memberOfId: added.body.id })
      .expect(400);
    await request(server)
      .post('/v1/admin/users')
      .set(adminAuth)
      .send({ ...nested, name: 'X', role: 'ADMIN', memberOfId: ids.client })
      .expect(400);
    const people = await request(server)
      .get(`/v1/admin/users?memberOf=${ids.client}`)
      .set(adminAuth)
      .expect(200);
    expect(people.body.items.map((u: { name: string }) => u.name)).toEqual(['Hedy']);
    const accounts = await request(server)
      .get('/v1/admin/users?role=CLIENT&accounts=true&pageSize=100')
      .set(adminAuth)
      .expect(200);
    expect(accounts.body.items.map((u: { id: string }) => u.id)).not.toContain(added.body.id);
    await request(server)
      .post('/v1/admin/projects')
      .set(adminAuth)
      .send({ clientId: added.body.id, name: 'No', phase: 'DESIGN', progress: 0 })
      .expect(400);

    // The member sees the company's project and acts on it.
    const memberAuth = await bearer(member);
    const otherAuth = await bearer(other);
    const projects = await request(server).get('/v1/portal/projects').set(memberAuth).expect(200);
    expect(projects.body.map((p: { name: string }) => p.name)).toEqual(['Tienda online']);
    await request(server).get(`/v1/portal/projects/${ids.project}`).set(memberAuth).expect(200);
    await request(server).get(`/v1/portal/projects/${ids.project}`).set(otherAuth).expect(404);

    // A request opened by the member belongs to the company and shows who wrote it.
    const ticket = await request(server)
      .post('/v1/portal/tickets')
      .set(memberAuth)
      .send({ type: 'QUESTION', title: '¿Cuándo sale?', body: 'Hola', projectId: ids.project })
      .expect(201);
    expect(ticket.body).toMatchObject({
      client: { id: ids.client },
      messages: [{ author: { name: 'Hedy', team: false } }],
    });
    expect(sent.at(-1)).toMatchObject({ replyTo: member.email });
    const ownerAuth = await bearer(client);
    const mine = await request(server).get('/v1/portal/tickets').set(ownerAuth).expect(200);
    expect(mine.body.items.map((t: { id: string }) => t.id)).toContain(ticket.body.id);

    // The team's answer reaches both people of the company, each in their language.
    const before = sent.length;
    await request(server)
      .post(`/v1/admin/tickets/${ticket.body.id as string}/messages`)
      .set(adminAuth)
      .send({ body: 'La semana que viene.' })
      .expect(201);
    await vi.waitFor(() => expect(sent.length).toBe(before + 2));
    const to = sent.slice(before).map((m) => [m.to, m.subject]);
    expect(to).toEqual(
      expect.arrayContaining([
        [client.email, expect.stringContaining('Respuesta a tu petición')],
        [member.email, expect.stringContaining('Reply to your request')],
      ]),
    );

    // A deactivated member loses access to the emails.
    await request(server)
      .patch(`/v1/admin/users/${added.body.id as string}`)
      .set(adminAuth)
      .send({ isActive: false })
      .expect(200);
    const after = sent.length;
    await request(server)
      .post(`/v1/admin/tickets/${ticket.body.id as string}/messages`)
      .set(adminAuth)
      .send({ body: 'Confirmado.' })
      .expect(201);
    await vi.waitFor(() => expect(sent.length).toBe(after + 1));
    expect(sent.at(-1)?.to).toBe(client.email);
  });
});
