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
const password = 'brief-password-1';
const admin = { email: `e2e-brief-admin-${tag}@codeqlick.test`, password };
const client = { email: `e2e-brief-client-${tag}@codeqlick.test`, password };
const other = { email: `e2e-brief-other-${tag}@codeqlick.test`, password };

describe('Project brief (e2e)', () => {
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

  it('asks for the brief, lets the client fill it in and send it, and the repository read it', async () => {
    const server = app.getHttpServer();
    const bearer = async (user: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`,
    });
    const adminAuth = await bearer(admin);
    const clientAuth = await bearer(client);
    const otherAuth = await bearer(other);
    const portal = `/v1/portal/projects/${ids.project}/brief`;

    // Not asked for yet; another client can't see it.
    const none = await request(server).get(portal).set(clientAuth).expect(200);
    expect(none.body).toMatchObject({ status: 'NONE', answers: {} });
    await request(server).get(portal).set(otherAuth).expect(404);

    // The team asks for it: the client is emailed in Spanish with the link.
    const before = sent.length;
    await request(server)
      .post(`/v1/admin/projects/${ids.project}/brief/request`)
      .set(adminAuth)
      .expect(200);
    await vi.waitFor(() => expect(sent.length).toBe(before + 1));
    expect(sent.at(-1)).toMatchObject({
      to: client.email,
      subject: 'Tienda online: cuéntanos tu proyecto',
    });
    expect(sent.at(-1)?.text).toContain(`/es/portal/projects/${ids.project}/brief`);

    // Saved as they go; sending needs the essential answers.
    const draft = await request(server)
      .put(portal)
      .set(clientAuth)
      .send({ answers: { business: 'Vendemos cerámica artesanal.', brandStatus: 'partial' } })
      .expect(200);
    expect(draft.body).toMatchObject({ status: 'REQUESTED', answers: { brandStatus: 'partial' } });
    const refused = await request(server)
      .put(portal)
      .set(clientAuth)
      .send({ answers: draft.body.answers, submit: true })
      .expect(400);
    expect(refused.body.errors.map((e: { path: string }) => e.path).toSorted()).toEqual([
      'answers.audience',
      'answers.goals',
      'answers.mustHave',
    ]);
    await request(server)
      .put(portal)
      .set(clientAuth)
      .send({ answers: { brandTone: 'loud' } })
      .expect(400);
    const answers = {
      ...draft.body.answers,
      goals: 'Vender online en España.',
      audience: 'Particulares de 30 a 60 años.',
      mustHave: '- Catálogo\n- Pago con tarjeta',
      deadline: '2026-12-01',
    };
    const teamBefore = sent.length;
    const sentBrief = await request(server)
      .put(portal)
      .set(clientAuth)
      .send({ answers, submit: true })
      .expect(200);
    expect(sentBrief.body).toMatchObject({ status: 'SUBMITTED', submittedAt: expect.any(String) });
    await vi.waitFor(() => expect(sent.length).toBe(teamBefore + 1));
    expect(sent.at(-1)).toMatchObject({
      replyTo: client.email,
      subject: 'Tienda online: brief received',
    });

    // Asking again doesn't email once it was sent; the team reads it.
    const quiet = sent.length;
    await request(server)
      .post(`/v1/admin/projects/${ids.project}/brief/request`)
      .set(adminAuth)
      .expect(200);
    const team = await request(server)
      .get(`/v1/admin/projects/${ids.project}/brief`)
      .set(adminAuth)
      .expect(200);
    expect(team.body.answers).toMatchObject({
      goals: 'Vender online en España.',
      deadline: '2026-12-01',
    });
    expect(sent.length).toBe(quiet);

    // From the repository, with the project's release key.
    const { key } = (
      await request(server)
        .post(`/v1/admin/projects/${ids.project}/release-key`)
        .set(adminAuth)
        .expect(201)
    ).body as { key: string };
    await request(server).get('/v1/brief').expect(401);
    const fromRepo = await request(server)
      .get('/v1/brief')
      .set('Authorization', `Bearer ${key}`)
      .expect(200);
    expect(fromRepo.body).toMatchObject({
      project: { name: 'Tienda online' },
      status: 'SUBMITTED',
      answers: { mustHave: '- Catálogo\n- Pago con tarjeta' },
    });
  });
});
