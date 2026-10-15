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
const password = 'proposals-password-1';
const admin = { email: `e2e-proposals-admin-${tag}@codeqlick.test`, password };
const client = { email: `e2e-proposals-client-${tag}@codeqlick.test`, password };
const other = { email: `e2e-proposals-other-${tag}@codeqlick.test`, password };

describe('Proposals (e2e)', () => {
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
      await prisma.proposal.deleteMany({
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

  it('lets the team draft and send a proposal, and the client accept or decline it', async () => {
    const server = app.getHttpServer();
    const bearer = async (user: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`,
    });
    const adminAuth = await bearer(admin);
    const clientAuth = await bearer(client);
    const otherAuth = await bearer(other);
    const draft = {
      clientId: ids.client,
      projectId: ids.project,
      title: 'Tienda online',
      summary: 'Diseño y desarrollo de la tienda.',
      terms: '50 % al empezar, 50 % al entregar.',
      validUntil: '2099-12-31',
      items: [
        { description: 'Diseño', quantity: 1, unitPrice: 120000 },
        { description: 'Desarrollo (horas)', quantity: 40, unitPrice: 5000 },
      ],
    };

    // Only the client's own projects; items are required.
    await request(server)
      .post('/v1/admin/proposals')
      .set(adminAuth)
      .send({ ...draft, projectId: ids.otherProject })
      .expect(400);
    await request(server)
      .post('/v1/admin/proposals')
      .set(adminAuth)
      .send({ ...draft, items: [] })
      .expect(400);
    const created = await request(server)
      .post('/v1/admin/proposals')
      .set(adminAuth)
      .send(draft)
      .expect(201);
    const id = created.body.id as string;
    expect(created.body).toMatchObject({
      status: 'DRAFT',
      total: 320000,
      currency: 'EUR',
      validUntil: '2099-12-31',
      project: { name: 'Tienda online' },
      items: [{ description: 'Diseño', amount: 120000 }, { amount: 200000 }],
    });

    // A draft is invisible to the client and can be edited.
    await request(server).get(`/v1/portal/proposals/${id}`).set(clientAuth).expect(404);
    const mineBefore = await request(server)
      .get('/v1/portal/proposals')
      .set(clientAuth)
      .expect(200);
    expect(mineBefore.body.items).toEqual([]);
    const edited = await request(server)
      .put(`/v1/admin/proposals/${id}`)
      .set(adminAuth)
      .send({ ...draft, clientId: undefined, items: [draft.items[0]] })
      .expect(200);
    expect(edited.body).toMatchObject({ total: 120000, items: [{ description: 'Diseño' }] });

    // Sent: the client is emailed in Spanish, and it can't be edited any more.
    const sentProposal = await request(server)
      .post(`/v1/admin/proposals/${id}/send`)
      .set(adminAuth)
      .expect(200);
    expect(sentProposal.body).toMatchObject({ status: 'SENT', clientNotified: true });
    expect(sent.at(-1)).toMatchObject({
      to: client.email,
      subject: `Propuesta #${created.body.number as number}: Tienda online`,
    });
    // Spanish style: no thousands separator under 10 000, a no-break space before the sign.
    expect(sent.at(-1)?.text).toMatch(/Importe: 1200,00\s€/);
    expect(sent.at(-1)?.text).toContain(`/es/portal/proposals/${id}`);
    await request(server)
      .put(`/v1/admin/proposals/${id}`)
      .set(adminAuth)
      .send({ ...draft, clientId: undefined })
      .expect(409);
    await request(server).delete(`/v1/admin/proposals/${id}`).set(adminAuth).expect(409);

    // Only its client answers it; the name is required.
    await request(server).get(`/v1/portal/proposals/${id}`).set(otherAuth).expect(404);
    await request(server)
      .post(`/v1/portal/proposals/${id}/accept`)
      .set(adminAuth)
      .send({ name: 'Luis' })
      .expect(403);
    await request(server)
      .post(`/v1/portal/proposals/${id}/accept`)
      .set(clientAuth)
      .send({ name: '' })
      .expect(400);
    const accepted = await request(server)
      .post(`/v1/portal/proposals/${id}/accept`)
      .set(clientAuth)
      .send({ name: 'Grace Hopper' })
      .expect(200);
    expect(accepted.body).toMatchObject({
      status: 'ACCEPTED',
      acceptedName: 'Grace Hopper',
      respondedAt: expect.any(String),
    });
    await vi.waitFor(() =>
      expect(sent.at(-1)).toMatchObject({
        replyTo: client.email,
        subject: `Proposal #${created.body.number as number} accepted: Tienda online`,
      }),
    );
    await request(server)
      .post(`/v1/portal/proposals/${id}/decline`)
      .set(clientAuth)
      .send({})
      .expect(409);

    // A new version: duplicate, send, decline with a reason.
    const copy = await request(server)
      .post(`/v1/admin/proposals/${id}/duplicate`)
      .set(adminAuth)
      .expect(201);
    expect(copy.body).toMatchObject({ status: 'DRAFT', total: 120000, validUntil: null });
    await request(server)
      .post(`/v1/admin/proposals/${copy.body.id as string}/send`)
      .set(adminAuth)
      .expect(200);
    const declined = await request(server)
      .post(`/v1/portal/proposals/${copy.body.id as string}/decline`)
      .set(clientAuth)
      .send({ reason: 'Se nos va de presupuesto.' })
      .expect(200);
    expect(declined.body).toMatchObject({
      status: 'DECLINED',
      declineReason: 'Se nos va de presupuesto.',
    });
    await vi.waitFor(() => expect(sent.at(-1)?.text).toContain('Se nos va de presupuesto.'));

    // Withdrawn after sending; an expired one can't be accepted; drafts can be deleted.
    const third = await request(server)
      .post(`/v1/admin/proposals/${id}/duplicate`)
      .set(adminAuth)
      .expect(201);
    const thirdId = third.body.id as string;
    await request(server)
      .post(`/v1/admin/proposals/${thirdId}/withdraw`)
      .set(adminAuth)
      .expect(409);
    await request(server).post(`/v1/admin/proposals/${thirdId}/send`).set(adminAuth).expect(200);
    const withdrawn = await request(server)
      .post(`/v1/admin/proposals/${thirdId}/withdraw`)
      .set(adminAuth)
      .expect(200);
    expect(withdrawn.body.status).toBe('WITHDRAWN');
    await request(server)
      .post(`/v1/portal/proposals/${thirdId}/accept`)
      .set(clientAuth)
      .send({ name: 'Grace Hopper' })
      .expect(409);

    const old = await request(server)
      .post(`/v1/admin/proposals/${id}/duplicate`)
      .set(adminAuth)
      .expect(201);
    await request(server)
      .post(`/v1/admin/proposals/${old.body.id as string}/send`)
      .set(adminAuth)
      .expect(200);
    await prisma.proposal.update({
      where: { id: old.body.id as string },
      data: { validUntil: new Date('2020-01-01T00:00:00Z') },
    });
    const expired = await request(server)
      .get(`/v1/portal/proposals/${old.body.id as string}`)
      .set(clientAuth)
      .expect(200);
    expect(expired.body).toMatchObject({ status: 'SENT', expired: true });
    await request(server)
      .post(`/v1/portal/proposals/${old.body.id as string}/accept`)
      .set(clientAuth)
      .send({ name: 'Grace Hopper' })
      .expect(409);

    const scrap = await request(server)
      .post(`/v1/admin/proposals/${id}/duplicate`)
      .set(adminAuth)
      .expect(201);
    await request(server)
      .delete(`/v1/admin/proposals/${scrap.body.id as string}`)
      .set(adminAuth)
      .expect(204);

    // The client sees everything that was sent to them, drafts left out.
    const mine = await request(server).get('/v1/portal/proposals').set(clientAuth).expect(200);
    expect(mine.body.items.map((p: { status: string }) => p.status).toSorted()).toEqual([
      'ACCEPTED',
      'DECLINED',
      'SENT',
      'WITHDRAWN',
    ]);
    const stats = await request(server).get('/v1/admin/stats').set(adminAuth).expect(200);
    expect(stats.body.proposals.sent).toEqual(expect.any(Number));

    const actions = await prisma.activityLog.findMany({
      where: { targetId: id },
      select: { action: true },
    });
    expect(actions.map((entry) => entry.action).toSorted()).toEqual([
      'proposal.accepted',
      'proposal.created',
      'proposal.sent',
      'proposal.updated',
    ]);
  });
});
