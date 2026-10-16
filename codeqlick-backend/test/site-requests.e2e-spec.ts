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
const password = 'request-password-1';
const admin = { email: `e2e-req-admin-${tag}@codeqlick.test`, password };

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

describe('Basic-website requests (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const sent: MailMessage[] = [];
  const builds: Array<{ content: Record<string, unknown> }> = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const builder = app.get(SiteBuilderClient);
    vi.spyOn(builder, 'presets').mockResolvedValue([{ key: 'peluqueria', content: preset }]);
    vi.spyOn(builder, 'build').mockImplementation((input) => {
      builds.push(input);
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

  it('turns a public request into a lead, and the lead into a site with its details', async () => {
    const server = app.getHttpServer();
    const email = `e2e-req-paco-${tag}@codeqlick.test`;
    const body = {
      preset: 'peluqueria',
      business: {
        name: 'Barbería Paco',
        kind: 'Barbería',
        city: 'Málaga',
        address: 'Calle Larios 5, 29005 Málaga',
        whatsapp: '600 11 22 33',
        email: '',
        hours: 'Lunes a viernes: 9:00–20:00',
        services: 'Corte — 15 €',
        about: 'Barbería de toda la vida.',
      },
      name: 'Paco',
      email,
      locale: 'es',
    };

    await request(server)
      .post('/v1/site-requests')
      .send({ ...body, business: { ...body.business, name: '' } })
      .expect(400);
    // The honeypot: "created", nothing stored.
    await request(server)
      .post('/v1/site-requests')
      .send({ ...body, website: 'x' })
      .expect(201);
    const created = await request(server).post('/v1/site-requests').send(body).expect(201);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: created.body.id as string } });
    expect(lead).toMatchObject({ company: 'Barbería Paco', projectType: 'web', status: 'NEW' });
    expect(lead.message).toContain('Business: Barbería Paco (Barbería, Málaga)');
    expect(lead.siteRequest).toMatchObject({
      preset: 'peluqueria',
      business: { kind: 'Barbería' },
    });
    expect(await prisma.lead.count({ where: { email } })).toBe(1);
    await vi.waitFor(() => expect(sent.some((message) => message.to === email)).toBe(true));

    const login = await request(server).post('/v1/auth/login').send(admin).expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
    const leadView = await request(server).get(`/v1/admin/leads/${lead.id}`).set(auth).expect(200);
    expect(leadView.body.siteRequest).toMatchObject({ business: { name: 'Barbería Paco' } });

    const result = await request(server)
      .post('/v1/admin/sites/onboard')
      .set(auth)
      .send({
        name: 'Paco',
        email,
        businessName: 'Barbería Paco',
        slug: `paco-${tag}`,
        preset: 'peluqueria',
        leadId: lead.id,
      })
      .expect(201);
    expect(result.body.site.content).toMatchObject({
      business: { name: 'Barbería Paco', tagline: 'Barbería · Málaga' },
      contact: { whatsapp: '34600112233', address: { postalCode: '29005' } },
      hours: [{ days: 'Lunes a viernes', hours: '9:00–20:00' }],
      services: { items: [{ name: 'Corte', price: '15 €' }] },
      about: { paragraphs: ['Barbería de toda la vida.'] },
    });
    expect(builds.at(-1)?.content).toMatchObject({ business: { name: 'Barbería Paco' } });
  });
});
