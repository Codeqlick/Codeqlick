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
import { AppConfigService } from '../src/config/app-config.service.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { SiteBuilderClient } from '../src/modules/managed-sites/site-builder.client.js';
import { SitePreviewsRepository } from '../src/modules/managed-sites/site-previews.repository.js';
import { SitePreviewsService } from '../src/modules/managed-sites/site-previews.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'manage-password-1';
const admin = { email: `e2e-mg-admin-${tag}@codeqlick.test`, password };
const DAY_MS = 86_400_000;

/** A preset as site-builder returns it (a demo's content, with the fields the API replaces). */
const preset = {
  demo: true,
  url: 'https://peluqueria.demo.codeqlick.com',
  form: { demo: true },
  footerNote: 'Web de demostración',
  business: { name: 'Alba Estudio', description: 'Peluquería en Triana.', schemaType: 'HairSalon' },
  theme: {
    primary: '#A84A33',
    primaryText: '#FFFFFF',
    background: '#FBF7F4',
    surface: '#F4ECE6',
    text: '#2A1F1C',
    muted: '#6B5A54',
    headingFont: 'playfair',
    bodyFont: 'inter',
    corners: 'round',
  },
  contact: { phone: '954 00 00 00' },
  hero: {
    title: 'Tu pelo, en las mejores manos',
    text: 'Cortes, color y peinados.',
    image: { file: 'hero.jpg', alt: 'Peluquera' },
    primary: { label: 'Pedir cita', href: '#contacto' },
  },
  contactSection: { title: 'Pide tu cita' },
  legal: { owner: 'Alba', taxId: '0', address: 'Sevilla', email: 'hola@alba.example' },
};

describe('Managing previews, leads, users and managed sites from the admin (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let auth: { Authorization: string };
  let adminId: string;
  const sent: MailMessage[] = [];
  const builds: Array<{ slug: string; content: Record<string, unknown> }> = [];
  const removed: string[] = [];

  const settle = async (leadId: string) => {
    for (let i = 0; i < 50; i++) {
      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (lead?.previewStatus !== 'BUILDING') return lead;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Preview still building');
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    vi.spyOn(app.get(AppConfigService), 'siteBuilder', 'get').mockReturnValue({
      url: 'http://site-builder.test',
      token: 'test',
    });
    const builder = app.get(SiteBuilderClient);
    vi.spyOn(builder, 'presets').mockResolvedValue([{ key: 'peluqueria', content: preset }]);
    vi.spyOn(builder, 'build').mockImplementation((input) => {
      builds.push(input);
      return Promise.resolve({ ok: true, release: `r${builds.length}`, ms: 10 });
    });
    vi.spyOn(builder, 'remove').mockImplementation((slug: string) => {
      removed.push(slug);
      return Promise.resolve();
    });
    // Previews of other test files don't count toward this file's cap.
    vi.spyOn(app.get(SitePreviewsRepository), 'countSince').mockResolvedValue(0);
    vi.spyOn(app.get(MailService), 'send').mockImplementation((message: MailMessage) => {
      sent.push(message);
      return Promise.resolve();
    });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    adminId = (
      await prisma.user.create({
        data: { email: admin.email, name: 'Luis', role: Role.ADMIN, passwordHash },
      })
    ).id;
    const login = await request(app.getHttpServer()).post('/v1/auth/login').send(admin).expect(200);
    auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.lead.deleteMany({ where: { createdById: adminId } });
      await prisma.lead.deleteMany({ where: { email: { contains: `-${tag}@` } } });
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

  it('builds a prospect’s preview without emailing anyone, and edits, rebuilds and deletes it', async () => {
    const server = app.getHttpServer();
    const before = sent.length;
    const created = await request(server)
      .post('/v1/admin/previews')
      .set(auth)
      .send({
        preset: 'peluqueria',
        business: { name: `Taller Pepe ${tag}`, kind: 'Taller de bicis', city: 'Sevilla' },
      })
      .expect(201);
    const leadId = created.body.leadId as string;
    const ready = await settle(leadId);
    expect(ready).toMatchObject({ previewStatus: 'READY', email: null, createdById: adminId });
    const slug = ready!.previewSlug!;
    expect(builds.at(-1)).toMatchObject({ slug });
    expect(sent.length).toBe(before);

    const list = await request(server).get('/v1/admin/previews').set(auth).expect(200);
    expect(list.body).toContainEqual(
      expect.objectContaining({
        leadId,
        business: `Taller Pepe ${tag}`,
        status: 'READY',
        prospect: true,
        email: null,
      }),
    );
    const lead = await request(server).get(`/v1/admin/leads/${leadId}`).set(auth).expect(200);
    expect(lead.body).toMatchObject({ prospect: true, email: null, company: `Taller Pepe ${tag}` });

    // Without an email it can't be answered or become a client.
    await request(server).post(`/v1/admin/leads/${leadId}/convert`).set(auth).send({}).expect(400);
    await request(server)
      .post(`/v1/admin/leads/${leadId}/replies`)
      .set(auth)
      .send({ subject: 'Hola', body: 'Hola' })
      .expect(400);
    const email = `e2e-mg-pepe-${tag}@codeqlick.test`;
    const edited = await request(server)
      .patch(`/v1/admin/leads/${leadId}`)
      .set(auth)
      .send({ name: 'Pepe Ruiz', email: email.toUpperCase(), company: 'Bicis Pepe' })
      .expect(200);
    expect(edited.body).toMatchObject({ name: 'Pepe Ruiz', email, company: 'Bicis Pepe' });

    // Even with an email, a prospect never gets the follow-up.
    await prisma.lead.update({
      where: { id: leadId },
      data: { previewBuiltAt: new Date(Date.now() - 5 * DAY_MS) },
    });
    await app.get(SitePreviewsService).sendFollowUps();
    expect(sent.some((message) => message.to === email)).toBe(false);

    // Editing the request rebuilds the preview on its address.
    const request2 = {
      preset: 'peluqueria',
      business: {
        name: `Bicis Pepe ${tag}`,
        kind: 'Taller de bicis',
        city: 'Sevilla',
        services: 'Puesta a punto — 30 €',
      },
    };
    await request(server).put(`/v1/admin/leads/${leadId}/request`).set(auth).send({}).expect(400);
    const replaced = await request(server)
      .put(`/v1/admin/leads/${leadId}/request`)
      .set(auth)
      .send(request2)
      .expect(200);
    expect(replaced.body.siteRequest).toMatchObject(request2);
    expect(replaced.body.message).toContain(`Bicis Pepe ${tag}`);
    await settle(leadId);
    expect(builds.at(-1)?.slug).toBe(slug);
    expect(builds.at(-1)?.content).toMatchObject({ business: { name: `Bicis Pepe ${tag}` } });

    // Taken down, it is rebuilt on a new address.
    await request(server).delete(`/v1/admin/leads/${leadId}/preview`).set(auth).expect(200);
    expect(removed).toContain(slug);
    await request(server).post(`/v1/admin/leads/${leadId}/preview`).set(auth).expect(200);
    const rebuilt = await settle(leadId);
    expect(rebuilt?.previewStatus).toBe('READY');
    expect(rebuilt?.previewSlug).not.toBe(slug);
    expect(sent.some((message) => message.to === email)).toBe(false);

    // Deleting the lead takes its preview down.
    await request(server).delete(`/v1/admin/leads/${leadId}`).set(auth).expect(204);
    expect(removed).toContain(rebuilt!.previewSlug);
    expect(await prisma.lead.count({ where: { id: leadId } })).toBe(0);
    expect(
      await prisma.activityLog.count({ where: { action: 'lead.deleted', targetId: leadId } }),
    ).toBe(1);
    await request(server).delete(`/v1/admin/leads/${leadId}`).set(auth).expect(404);
  });

  it('keeps the email of a lead from the website', async () => {
    const server = app.getHttpServer();
    const lead = await prisma.lead.create({
      data: {
        name: 'Ana',
        email: `e2e-mg-form-${tag}@codeqlick.test`,
        message: 'Quiero una web',
        locale: Locale.ES,
      },
    });
    await request(server)
      .patch(`/v1/admin/leads/${lead.id}`)
      .set(auth)
      .send({ email: null })
      .expect(400);
    await request(server).post(`/v1/admin/leads/${lead.id}/preview`).set(auth).expect(400);
    await request(server).delete(`/v1/admin/leads/${lead.id}`).set(auth).expect(204);
    expect(await prisma.lead.count({ where: { id: lead.id } })).toBe(0);
  });

  it('deletes a user and what hangs from it, but not one that owns projects', async () => {
    const server = app.getHttpServer();
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const owner = await prisma.user.create({
      data: { email: `e2e-mg-owner-${tag}@codeqlick.test`, name: 'Marta', passwordHash },
    });
    const member = await prisma.user.create({
      data: {
        email: `e2e-mg-member-${tag}@codeqlick.test`,
        name: 'Leo',
        passwordHash,
        memberOfId: owner.id,
      },
    });
    const project = await prisma.clientProject.create({
      data: { clientId: owner.id, name: 'Web de Marta' },
    });
    await prisma.proposal.create({
      data: { clientId: owner.id, title: 'Web', summary: 'x' },
    });

    const shown = await request(server).get(`/v1/admin/users/${owner.id}`).set(auth).expect(200);
    expect(shown.body).toMatchObject({
      email: owner.email,
      owns: { projects: 1, members: 1, proposals: 1, tickets: 0 },
    });
    await request(server).delete(`/v1/admin/users/${owner.id}`).set(auth).expect(409);
    await request(server).delete(`/v1/admin/users/${adminId}`).set(auth).expect(400);

    await request(server).delete(`/v1/admin/projects/${project.id}`).set(auth).expect(204);
    await request(server).delete(`/v1/admin/users/${owner.id}`).set(auth).expect(204);
    expect(await prisma.user.count({ where: { id: { in: [owner.id, member.id] } } })).toBe(0);
    expect(await prisma.proposal.count({ where: { clientId: owner.id } })).toBe(0);
    expect(
      await prisma.activityLog.count({ where: { action: 'user.deleted', targetId: owner.id } }),
    ).toBe(1);
    await request(server).get(`/v1/admin/users/${owner.id}`).set(auth).expect(404);
  });

  it('takes a managed site down, and deleting a project takes its site down first', async () => {
    const server = app.getHttpServer();
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const client = await prisma.user.create({
      data: { email: `e2e-mg-site-${tag}@codeqlick.test`, name: 'Rocío', passwordHash },
    });
    const project = await prisma.clientProject.create({
      data: { clientId: client.id, name: 'Fisio Rocío', monitor: { create: {} } },
    });
    const slug = `mg-${tag}`;
    await request(server)
      .post(`/v1/admin/projects/${project.id}/site`)
      .set(auth)
      .send({ slug, preset: 'peluqueria' })
      .expect(201);
    expect(
      await prisma.clientProject.findUniqueOrThrow({ where: { id: project.id } }),
    ).toMatchObject({ stagingUrl: expect.stringContaining(slug) });

    await request(server).delete(`/v1/admin/projects/${project.id}/site`).set(auth).expect(204);
    expect(removed).toContain(slug);
    expect(await prisma.managedSite.count({ where: { projectId: project.id } })).toBe(0);
    expect(
      await prisma.clientProject.findUniqueOrThrow({
        where: { id: project.id },
        include: { monitor: true },
      }),
    ).toMatchObject({ stagingUrl: null, productionUrl: null, monitor: { enabled: false } });
    await request(server).delete(`/v1/admin/projects/${project.id}/site`).set(auth).expect(404);
    expect(
      await prisma.activityLog.count({
        where: { action: 'project.site_deleted', targetId: project.id },
      }),
    ).toBe(1);

    // The same name is free again, and deleting the project unpublishes its site.
    await request(server)
      .post(`/v1/admin/projects/${project.id}/site`)
      .set(auth)
      .send({ slug, preset: 'peluqueria' })
      .expect(201);
    const removals = removed.length;
    await request(server).delete(`/v1/admin/projects/${project.id}`).set(auth).expect(204);
    expect(removed.slice(removals)).toEqual([slug]);
  });
});
