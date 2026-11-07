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
import { SitePreviewsService } from '../src/modules/managed-sites/site-previews.service.js';
import { SiteReportsService } from '../src/modules/managed-sites/site-reports.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'followup-password-1';
const admin = { email: `e2e-fu-admin-${tag}@codeqlick.test`, password };
const requester = `e2e-fu-req-${tag}@codeqlick.test`;
const answered = `e2e-fu-talk-${tag}@codeqlick.test`;
const owner = `e2e-fu-owner-${tag}@codeqlick.test`;
const member = `e2e-fu-member-${tag}@codeqlick.test`;
const DAY_MS = 86_400_000;

const siteRequest = {
  preset: 'peluqueria',
  business: {
    name: 'Peluquería Marta',
    kind: 'Peluquería',
    city: 'Sevilla',
    wishes: 'Que se vean mis precios',
  },
  domain: { name: 'peluqueriamarta.es', owned: false },
};

describe('Sales follow-ups: preview follow-up, proposal from a request, monthly report (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let auth: { Authorization: string };
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
    const login = await request(app.getHttpServer()).post('/v1/auth/login').send(admin).expect(200);
    auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.lead.deleteMany({ where: { email: { contains: `-${tag}@` } } });
      await prisma.proposal.deleteMany({ where: { client: { email: { contains: `-${tag}@` } } } });
      await prisma.clientProject.deleteMany({
        where: { client: { email: { contains: `-${tag}@` } } },
      });
      await prisma.user.deleteMany({
        where: { memberOfId: { not: null }, email: { contains: `-${tag}@` } },
      });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
  });

  it('asks a requester nobody answered what they think of the preview, once', async () => {
    const builtAt = new Date(Date.now() - 4 * DAY_MS);
    const lead = await prisma.lead.create({
      data: {
        name: 'Marta',
        email: requester,
        company: 'Peluquería Marta',
        message: 'x',
        locale: Locale.ES,
        previewSlug: `fu-${tag}`,
        previewStatus: 'READY',
        previewBuiltAt: builtAt,
      },
    });
    // Someone already answered this one, and this one is too recent.
    await prisma.lead.create({
      data: {
        name: 'Ana',
        email: answered,
        message: 'x',
        status: 'TALKING',
        previewSlug: `fu-talk-${tag}`,
        previewStatus: 'READY',
        previewBuiltAt: builtAt,
      },
    });
    await prisma.lead.create({
      data: {
        name: 'Ana',
        email: answered,
        message: 'x',
        previewSlug: `fu-new-${tag}`,
        previewStatus: 'READY',
        previewBuiltAt: new Date(),
      },
    });

    const previews = app.get(SitePreviewsService);
    await previews.sendFollowUps();
    const emails = sent.filter((message) => message.subject.startsWith('¿Qué te parece la web'));
    expect(emails.map((message) => message.to)).toEqual([requester]);
    expect(emails[0]!.subject).toBe('¿Qué te parece la web de Peluquería Marta?');
    expect(emails[0]!.text).toContain(`https://fu-${tag}.demo.codeqlick.com`);
    expect(emails[0]!.text).toContain('/es/book');

    const stored = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(stored.previewFollowUpAt).not.toBeNull();
    expect(stored.followUpOn).not.toBeNull();
    const shown = await request(app.getHttpServer())
      .get(`/v1/admin/leads/${lead.id}`)
      .set(auth)
      .expect(200);
    expect(shown.body.preview.followUpAt).toBe(stored.previewFollowUpAt!.toISOString());

    const before = sent.length;
    await previews.sendFollowUps();
    expect(sent.slice(before).some((message) => message.to === requester)).toBe(false);
  });

  it('drafts the proposal of a website request for a new client account', async () => {
    const server = app.getHttpServer();
    const email = `e2e-fu-prop-${tag}@codeqlick.test`;
    const lead = await prisma.lead.create({
      data: {
        name: 'Marta',
        email,
        company: 'Peluquería Marta',
        message: 'x',
        locale: Locale.ES,
        projectType: 'web',
        siteRequest,
      },
    });
    const created = await request(server)
      .post(`/v1/admin/leads/${lead.id}/proposal`)
      .set(auth)
      .expect(201);
    expect(created.body.client).toMatchObject({ created: true });

    const proposal = await request(server)
      .get(`/v1/admin/proposals/${created.body.proposalId as string}`)
      .set(auth)
      .expect(200);
    expect(proposal.body).toMatchObject({
      status: 'DRAFT',
      title: 'Web de Peluquería Marta',
      total: 20_000,
    });
    expect(proposal.body.summary).toContain('peluqueriamarta.es');
    expect(proposal.body.summary).toContain('Que se vean mis precios');

    const shown = await request(server).get(`/v1/admin/leads/${lead.id}`).set(auth).expect(200);
    expect(shown.body).toMatchObject({
      status: 'PROPOSAL',
      proposalId: created.body.proposalId,
      clientId: null,
    });
    await request(server).post(`/v1/admin/leads/${lead.id}/proposal`).set(auth).expect(409);

    // Not a website request.
    const plain = await prisma.lead.create({ data: { name: 'Bo', email, message: 'Hola' } });
    await request(server).post(`/v1/admin/leads/${plain.id}/proposal`).set(auth).expect(400);
  });

  it('emails last month’s website report to the people who want it, once a month', async () => {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const client = await prisma.user.create({
      data: { email: owner, name: 'Marta', role: Role.CLIENT, locale: Locale.ES, passwordHash },
    });
    await prisma.user.create({
      data: {
        email: member,
        name: 'Leo',
        role: Role.CLIENT,
        memberOfId: client.id,
        monthlyReport: false,
        passwordHash,
      },
    });
    // Reported as of 1 March 2027, 10:00 Madrid: the report covers February.
    const now = new Date('2027-03-01T09:00:00Z');
    const project = await prisma.clientProject.create({
      data: {
        clientId: client.id,
        name: 'Peluquería Marta',
        createdAt: new Date('2027-01-10T10:00:00Z'),
        site: {
          create: {
            slug: `fu-site-${tag}`,
            preset: 'peluqueria',
            content: {},
            domain: `fu-${tag}.example`,
            domainState: 'LIVE',
            createdAt: new Date('2027-01-10T10:00:00Z'),
          },
        },
        form: {
          create: {
            key: `fu-form-${tag}`,
            recipients: [owner],
            days: {
              create: [
                { day: new Date('2027-02-03T00:00:00Z'), count: 2 },
                { day: new Date('2027-02-28T00:00:00Z'), count: 1 },
                { day: new Date('2027-03-01T00:00:00Z'), count: 5 },
              ],
            },
          },
        },
        monitor: {
          create: {
            checks: {
              create: [
                { checkedAt: new Date('2027-02-10T10:00:00Z'), ok: true },
                { checkedAt: new Date('2027-02-11T10:00:00Z'), ok: true },
                { checkedAt: new Date('2027-02-12T10:00:00Z'), ok: true },
                { checkedAt: new Date('2027-02-13T10:00:00Z'), ok: false },
              ],
            },
          },
        },
      },
    });

    const reports = app.get(SiteReportsService);
    // Before 09:00 on the 1st nothing goes out.
    await reports.runDue(new Date('2027-03-01T07:00:00Z'));
    expect(sent.some((message) => message.to === owner)).toBe(false);

    await reports.runDue(now);
    const emails = sent.filter((message) => message.to === owner || message.to === member);
    expect(emails.map((message) => message.to)).toEqual([owner]);
    expect(emails[0]!.subject).toBe('Tu web en febrero');
    expect(emails[0]!.text).toContain(`fu-${tag}.example`);
    expect(emails[0]!.text).toMatch(/Mensajes del formulario\W+3/);
    expect(emails[0]!.text).toMatch(/Tiempo en línea\W+75/);
    expect(emails[0]!.text).toContain(`/es/portal/projects/${project.id}`);
    const site = await prisma.managedSite.findUniqueOrThrow({ where: { projectId: project.id } });
    expect(site.reportedMonth).toBe('2027-02');

    await reports.runDue(new Date(now.getTime() + 3_600_000));
    expect(sent.filter((message) => message.to === owner)).toHaveLength(1);

    // The admin's "send now", and the preference.
    const server = app.getHttpServer();
    const now1 = await request(server)
      .post(`/v1/admin/projects/${project.id}/site/report`)
      .set(auth)
      .expect(200);
    expect(now1.body).toEqual({ sent: 1 });
    await request(server)
      .patch(`/v1/admin/users/${client.id}`)
      .set(auth)
      .send({ monthlyReport: false })
      .expect(200);
    const now2 = await request(server)
      .post(`/v1/admin/projects/${project.id}/site/report`)
      .set(auth)
      .expect(200);
    expect(now2.body).toEqual({ sent: 0 });
  });
});
