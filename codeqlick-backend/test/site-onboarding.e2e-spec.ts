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
import { SiteBuilderClient } from '../src/modules/managed-sites/site-builder.client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'onboard-password-1';
const admin = { email: `e2e-onb-admin-${tag}@codeqlick.test`, password };

/** A preset as site-builder returns it (a demo's content, with the fields the API replaces). */
const preset = {
  demo: true,
  url: 'https://peluqueria.demo.codeqlick.com',
  form: { demo: true },
  footerNote: 'Web de demostración',
  business: {
    name: 'Alba Estudio',
    description: 'Peluquería en Triana.',
    schemaType: 'HairSalon',
  },
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

describe('Basic-website onboarding (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const sent: MailMessage[] = [];
  const builds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const builder = app.get(SiteBuilderClient);
    vi.spyOn(builder, 'presets').mockResolvedValue([{ key: 'peluqueria', content: preset }]);
    vi.spyOn(builder, 'build').mockImplementation((input) => {
      builds.push(input.slug);
      return Promise.resolve({ ok: true, release: 'r1', ms: 10 });
    });
    vi.spyOn(app.get(MailService), 'send').mockImplementation((message: MailMessage) => {
      sent.push(message);
      return Promise.resolve();
    });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.create({
      data: { email: admin.email, name: 'Luis', role: Role.ADMIN, passwordHash },
    });
  });

  afterAll(async () => {
    if (prisma) {
      const clients = await prisma.user.findMany({
        where: { email: { contains: `-${tag}@` }, role: Role.CLIENT },
        select: { id: true },
      });
      await prisma.clientProject.deleteMany({
        where: { clientId: { in: clients.map((c) => c.id) } },
      });
      await prisma.lead.deleteMany({ where: { email: { contains: `-${tag}@` } } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
  });

  it('creates the account, project, site, form and monitor in one step', async () => {
    const server = app.getHttpServer();
    const login = await request(server).post('/v1/auth/login').send(admin).expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
    const email = `e2e-onb-marta-${tag}@codeqlick.test`;

    const result = await request(server)
      .post('/v1/admin/sites/onboard')
      .set(auth)
      .send({
        name: 'Marta',
        email,
        businessName: 'Peluquería Marta',
        slug: `marta-${tag}`,
        preset: 'peluqueria',
      })
      .expect(201);
    expect(result.body).toMatchObject({
      client: { created: true, invitationSent: true },
      site: { slug: `marta-${tag}`, status: 'LIVE' },
      monitoring: true,
    });
    const projectId = result.body.projectId as string;
    const project = await prisma.clientProject.findUniqueOrThrow({
      where: { id: projectId },
      include: { client: true, form: true, monitor: true },
    });
    expect(project).toMatchObject({ name: 'Peluquería Marta', phase: 'DESIGN' });
    expect(project.client).toMatchObject({ email, locale: 'ES' });
    expect(project.form?.recipients).toEqual([email]);
    expect(project.monitor?.enabled).toBe(true);
    expect(sent.some((message) => message.to === email)).toBe(true);
    expect(builds).toContain(`marta-${tag}`);

    // The same name again: refused before anything is created.
    const projects = await prisma.clientProject.count();
    await request(server)
      .post('/v1/admin/sites/onboard')
      .set(auth)
      .send({
        name: 'Otra',
        email: `e2e-onb-otra-${tag}@codeqlick.test`,
        businessName: 'Otra',
        slug: `marta-${tag}`,
        preset: 'peluqueria',
      })
      .expect(409);
    expect(await prisma.clientProject.count()).toBe(projects);
  });

  it('turns a lead into the client, with a domain and no monitor yet', async () => {
    const server = app.getHttpServer();
    const login = await request(server).post('/v1/auth/login').send(admin).expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
    const lead = await prisma.lead.create({
      data: {
        name: 'Lola',
        email: `e2e-onb-lola-${tag}@codeqlick.test`,
        message: 'Quiero una web para mi restaurante.',
        locale: 'ES',
      },
    });

    const result = await request(server)
      .post('/v1/admin/sites/onboard')
      .set(auth)
      .send({
        name: 'Lola',
        email: lead.email,
        businessName: 'Casa Lola',
        slug: `lola-${tag}`,
        preset: 'peluqueria',
        domain: `lola-${tag}.es`,
        leadId: lead.id,
      })
      .expect(201);
    expect(result.body).toMatchObject({
      monitoring: false,
      site: { url: `https://lola-${tag}.es` },
    });
    const updated = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updated).toMatchObject({ status: 'WON', clientId: result.body.client.id });
    const project = await prisma.clientProject.findUniqueOrThrow({
      where: { id: result.body.projectId as string },
      include: { monitor: true },
    });
    expect(project).toMatchObject({ name: 'Casa Lola', productionUrl: `https://lola-${tag}.es` });
    expect(project.monitor).toBeNull();
  });
});
