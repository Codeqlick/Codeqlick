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
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const tag = randomUUID().slice(0, 8);
const password = 'invoice-password-1';
const people = {
  admin: `e2e-inv-admin-${tag}@codeqlick.test`,
  client: `e2e-inv-client-${tag}@codeqlick.test`,
  other: `e2e-inv-other-${tag}@codeqlick.test`,
};
const pdf = Buffer.from('%PDF-1.4\n% test invoice\n%%EOF\n');

describe('Invoices (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let projectId = '';
  let invoiceId = '';
  const sent: MailMessage[] = [];
  const tokens: Record<string, string> = {};

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
      data: { email: people.admin, name: 'Adam', role: Role.ADMIN, passwordHash },
    });
    const client = await prisma.user.create({
      data: { email: people.client, name: 'Clara', role: Role.CLIENT, passwordHash, locale: 'ES' },
    });
    await prisma.user.create({
      data: { email: people.other, name: 'Otto', role: Role.CLIENT, passwordHash },
    });
    projectId = (
      await prisma.clientProject.create({ data: { clientId: client.id, name: `Web ${tag}` } })
    ).id;
    for (const [who, email] of Object.entries(people)) {
      const login = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password })
        .expect(200);
      tokens[who] = (login.body as { accessToken: string }).accessToken;
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.projectInvoice.deleteMany({ where: { number: { startsWith: `${tag}-` } } });
      await prisma.clientProject.deleteMany({ where: { name: `Web ${tag}` } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
  });

  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

  it('uploads an invoice and tells the client', async () => {
    const server = app.getHttpServer();
    const upload = () =>
      request(server)
        .post(`/v1/admin/projects/${projectId}/invoices`)
        .set(auth('admin'))
        .field('number', `${tag}-001`)
        .field('issuedOn', '2026-11-01')
        .field('dueOn', '2026-11-15')
        .field('amount', '1210,50')
        .field('notify', 'true');

    await upload().attach('file', Buffer.from('not a pdf'), 'factura.pdf').expect(400);
    const res = await upload().attach('file', pdf, 'factura.pdf').expect(201);
    expect(res.body).toMatchObject({
      source: 'team',
      number: `${tag}-001`,
      issuedOn: '2026-11-01',
      dueOn: '2026-11-15',
      amountCents: 121_050,
      currency: 'eur',
      paidAt: null,
    });
    invoiceId = (res.body as { id: string }).id;
    await upload().attach('file', pdf, 'factura.pdf').expect(409);

    const mail = sent.find((message) => message.to === people.client);
    expect(mail?.subject).toBe(`Factura ${tag}-001 de Web ${tag} — Codeqlick`);
    expect(mail?.text).toContain('/es/portal/invoices');
  });

  it('shows it to its client only, and in what waits on them', async () => {
    const server = app.getHttpServer();
    const list = await request(server).get('/v1/portal/invoices').set(auth('client')).expect(200);
    expect((list.body as { items: { id: string }[] }).items.map((i) => i.id)).toEqual([invoiceId]);
    const others = await request(server).get('/v1/portal/invoices').set(auth('other')).expect(200);
    expect((others.body as { items: unknown[] }).items).toEqual([]);

    const file = await request(server)
      .get(`/v1/portal/invoices/${invoiceId}/file`)
      .set(auth('client'))
      .expect(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    await request(server)
      .get(`/v1/portal/invoices/${invoiceId}/file`)
      .set(auth('other'))
      .expect(404);

    const todo = await request(server).get('/v1/portal/todo').set(auth('client')).expect(200);
    expect((todo.body as { items: { kind: string; id: string }[] }).items).toContainEqual(
      expect.objectContaining({ kind: 'invoice', id: invoiceId, title: `${tag}-001` }),
    );
  });

  it('marks it paid, and keeps the project from being deleted', async () => {
    const server = app.getHttpServer();
    const res = await request(server)
      .patch(`/v1/admin/invoices/${invoiceId}`)
      .set(auth('admin'))
      .send({ paid: true })
      .expect(200);
    expect(res.body).toMatchObject({ status: 'PAID' });
    const todo = await request(server).get('/v1/portal/todo').set(auth('client')).expect(200);
    expect(
      (todo.body as { items: { kind: string }[] }).items.some((i) => i.kind === 'invoice'),
    ).toBe(false);

    await request(server).delete(`/v1/admin/projects/${projectId}`).set(auth('admin')).expect(409);
    await request(server).delete(`/v1/admin/invoices/${invoiceId}`).set(auth('admin')).expect(204);
    await request(server)
      .get(`/v1/portal/invoices/${invoiceId}/file`)
      .set(auth('client'))
      .expect(404);
  });
});
