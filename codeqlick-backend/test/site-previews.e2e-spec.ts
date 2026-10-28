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
import { AppConfigService } from '../src/config/app-config.service.js';
import { SiteBuilderClient } from '../src/modules/managed-sites/site-builder.client.js';
import {
  DAILY_PREVIEWS,
  SitePreviewsService,
} from '../src/modules/managed-sites/site-previews.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'preview-password-1';
const admin = { email: `e2e-prev-admin-${tag}@codeqlick.test`, password };
const client = { email: `e2e-prev-client-${tag}@codeqlick.test`, password };

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
  hours: [{ days: 'Martes a viernes', hours: '9:30–20:00' }],
  openingHoursSpec: ['Tu-Fr 09:30-20:00'],
  hero: {
    title: 'Tu pelo, en las mejores manos',
    text: 'Cortes, color y peinados.',
    image: { file: 'hero.jpg', alt: 'Peluquera' },
    primary: { label: 'Pedir cita', href: '#contacto' },
  },
  contactSection: { title: 'Pide tu cita' },
  legal: { owner: 'Alba', taxId: '0', address: 'Sevilla', email: 'hola@alba.example' },
};

const requestBody = (business: string) => ({
  preset: 'peluqueria',
  business: { name: business, kind: 'Peluquería', city: 'Sevilla', services: 'Corte — 15 €' },
  name: 'Marta',
  email: client.email,
  locale: 'es',
});

describe('Instant previews of website requests (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const sent: MailMessage[] = [];
  const builds: Array<{ slug: string; domains: string[]; content: Record<string, unknown> }> = [];
  const removed: string[] = [];

  const settle = async () => {
    for (let i = 0; i < 50; i++) {
      const building = await prisma.lead.count({
        where: { email: client.email, previewStatus: 'BUILDING' },
      });
      if (building === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
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
    vi.spyOn(app.get(MailService), 'send').mockImplementation((message: MailMessage) => {
      sent.push(message);
      return Promise.resolve();
    });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.create({
      data: { email: admin.email, name: 'Luis', role: Role.ADMIN, passwordHash },
    });
    // Previews from other test files count towards the cap; start clean.
    await prisma.lead.updateMany({
      where: { previewSlug: { not: null } },
      data: { createdAt: new Date(Date.now() - 2 * 86_400_000) },
    });
    await prisma.lead.updateMany({
      where: { previewSlug: { not: null }, previewBuiltAt: { not: null } },
      data: { previewBuiltAt: new Date(Date.now() - 2 * 86_400_000) },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.lead.deleteMany({ where: { email: client.email } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
  });

  it('builds a demo-mode preview of the request and emails the link', async () => {
    const server = app.getHttpServer();
    const created = await request(server)
      .post('/v1/site-requests')
      .send(requestBody('Peluquería Marta'))
      .expect(201);
    expect(created.body.previewUrl).toMatch(
      /^https:\/\/peluqueria-marta-[a-z0-9]{6}\.demo\.codeqlick\.com$/,
    );
    await settle();

    const build = builds.at(-1)!;
    expect(`https://${build.domains[0]}`).toBe(created.body.previewUrl);
    expect(build.content).toMatchObject({
      url: created.body.previewUrl,
      demo: true,
      preview: true,
      form: { demo: true },
      business: { name: 'Peluquería Marta' },
      legal: { owner: 'Peluquería Marta' },
    });
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(lead).toMatchObject({ previewStatus: 'READY' });
    expect(lead.message).toContain(
      `Preview: ${app.get(AppConfigService).siteUrl}/es/basic-website/request/preview/${lead.previewSlug}`,
    );
    const email = sent.find(
      (message) => message.subject === 'La vista previa de la web de Peluquería Marta',
    );
    expect(email?.to).toBe(client.email);
    expect(email?.text).toContain(created.body.previewUrl);
    const slug = new URL(created.body.previewUrl as string).hostname.split('.')[0]!;
    const status = await request(server).get(`/v1/site-requests/previews/${slug}`).expect(200);
    expect(status.body).toEqual({
      status: 'READY',
      url: created.body.previewUrl,
      business: 'Peluquería Marta',
      // Buying online is off without Stripe's keys.
      purchase: null,
    });
    await request(server).get('/v1/site-requests/previews/nope-000000').expect(404);

    const auth = {
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(admin).expect(200)).body.accessToken as string}`,
    };
    const shown = await request(server).get(`/v1/admin/leads/${lead.id}`).set(auth).expect(200);
    expect(shown.body.preview).toMatchObject({ url: created.body.previewUrl, status: 'READY' });

    const gone = await request(server)
      .delete(`/v1/admin/leads/${lead.id}/preview`)
      .set(auth)
      .expect(200);
    expect(gone.body).toEqual({ status: 'REMOVED' });
    expect(removed).toContain(lead.previewSlug);
  });

  it('builds a request whose address has no postcode, and fails one never served', async () => {
    const server = app.getHttpServer();
    const body = requestBody('Barbería Easy');
    const created = await request(server)
      .post('/v1/site-requests')
      .set('X-Forwarded-For', '203.0.113.7')
      .send({ ...body, business: { ...body.business, address: 'Calle Feria 12' } })
      .expect(201);
    await settle();
    expect(builds.at(-1)!.content).toMatchObject({
      contact: { address: { street: 'Calle Feria 12', city: 'Sevilla' } },
    });
    expect(await prisma.lead.findUniqueOrThrow({ where: { id: created.body.id } })).toMatchObject({
      previewStatus: 'READY',
    });

    // In production the link is only sent once the host serves the preview over HTTPS.
    const config = app.get(AppConfigService);
    const previews = app.get(SitePreviewsService);
    const production = vi.spyOn(config, 'isProduction', 'get').mockReturnValue(true);
    const live = vi.spyOn(previews, 'waitLive').mockResolvedValue(false);
    const before = sent.length;
    const never = await request(server)
      .post('/v1/site-requests')
      .set('X-Forwarded-For', '203.0.113.8')
      .send(requestBody('Bar Nunca'))
      .expect(201);
    await settle();
    production.mockRestore();
    live.mockRestore();
    expect(await prisma.lead.findUniqueOrThrow({ where: { id: never.body.id } })).toMatchObject({
      previewStatus: 'FAILED',
    });
    expect(
      sent.slice(before).some((message) => message.subject.startsWith('La vista previa')),
    ).toBe(false);
  });

  it('stops making previews past the daily cap, and takes old ones down', async () => {
    const server = app.getHttpServer();
    const already = await prisma.lead.count({
      where: {
        previewSlug: { not: null },
        OR: [
          { createdAt: { gte: new Date(Date.now() - 86_400_000) } },
          { previewBuiltAt: { gte: new Date(Date.now() - 86_400_000) } },
        ],
      },
    });
    for (let i = already; i < DAILY_PREVIEWS; i++) {
      await prisma.lead.create({
        data: {
          name: 'Cap',
          email: client.email,
          message: 'x',
          previewSlug: `cap-${tag}-${i}`,
          previewStatus: 'READY',
        },
      });
    }
    const created = await request(server)
      .post('/v1/site-requests')
      .set('X-Forwarded-For', '203.0.113.9')
      .send(requestBody('Bar Pepe'))
      .expect(201);
    expect(created.body.previewUrl).toBeUndefined();

    // A month later every one of them is taken down.
    await app.get(SitePreviewsService).removeDue(new Date(Date.now() + 31 * 86_400_000));
    expect(removed).toContain(`cap-${tag}-${DAILY_PREVIEWS - 1}`);
    const left = await prisma.lead.count({
      where: { email: client.email, previewStatus: { in: ['BUILDING', 'READY', 'FAILED'] } },
    });
    expect(left).toBe(0);
  });
});
