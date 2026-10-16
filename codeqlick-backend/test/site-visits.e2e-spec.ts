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
import { SiteBuilderClient } from '../src/modules/managed-sites/site-builder.client.js';
import { UmamiClient } from '../src/modules/stats/umami.client.js';
import { AppConfigService } from '../src/config/app-config.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'visits-password-1';
const admin = { email: `e2e-vis-admin-${tag}@codeqlick.test`, password };
const client = { email: `e2e-vis-client-${tag}@codeqlick.test`, password };

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

describe('Website visits in the portal (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const builds: Array<{ content: Record<string, unknown> }> = [];
  const ids: Record<string, string> = {};
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

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
    vi.spyOn(app.get(MailService), 'send').mockResolvedValue();
    // Umami set up: the site gets a website on its first build, and reports visits.
    vi.spyOn(app.get(AppConfigService), 'umamiApi', 'get').mockReturnValue({
      url: 'http://umami.test',
      username: 'admin',
      password: 'x',
    });
    const umami = app.get(UmamiClient);
    vi.spyOn(umami, 'createWebsite').mockResolvedValue('umami-site-1');
    vi.spyOn(umami, 'visits').mockImplementation((days, _now, websiteId) =>
      Promise.resolve({
        enabled: websiteId === 'umami-site-1',
        available: true,
        days,
        totals: { visitors: 42, visits: 50, pageviews: 120, bounceRate: 0.4, avgVisitSeconds: 30 },
        previousVisitors: 30,
        daily: [{ date: today, pageviews: 12, visitors: 5 }],
        topPages: [],
        referrers: [{ source: 'google.com', visitors: 20 }],
        countries: [],
        contactsSent: 0,
      }),
    );
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.create({
      data: { email: admin.email, name: 'Luis', role: Role.ADMIN, passwordHash },
    });
    ids.client = (
      await prisma.user.create({
        data: { email: client.email, name: 'Marta', role: Role.CLIENT, passwordHash },
      })
    ).id;
    ids.project = (
      await prisma.clientProject.create({
        data: { clientId: ids.client, name: 'Peluquería Marta' },
      })
    ).id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.clientProject.deleteMany({ where: { clientId: ids.client! } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
  });

  it('builds with the tracker and shows visits with the form messages', async () => {
    const server = app.getHttpServer();
    const bearer = async (user: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`,
    });
    const adminAuth = await bearer(admin);
    const clientAuth = await bearer(client);
    const visits = `/v1/portal/projects/${ids.project}/visits`;

    await request(server).get(visits).set(clientAuth).expect(404);
    await request(server)
      .post(`/v1/admin/projects/${ids.project}/site`)
      .set(adminAuth)
      .send({ slug: `marta-${tag}`, preset: 'peluqueria' })
      .expect(201);
    expect(builds.at(-1)?.content).toMatchObject({
      analytics: { websiteId: 'umami-site-1', scriptUrl: 'https://stats.codeqlick.com/script.js' },
    });
    const site = await prisma.managedSite.findUniqueOrThrow({ where: { projectId: ids.project } });
    expect(site.umamiWebsiteId).toBe('umami-site-1');

    // A message through the site's form counts on today's bar.
    const form = await prisma.siteForm.findUniqueOrThrow({ where: { projectId: ids.project } });
    await request(server)
      .post(`/v1/forms/${form.key}`)
      .send({ name: 'Ana', email: 'ana@example.com', message: 'Hola' })
      .expect(200);

    const result = await request(server).get(`${visits}?days=7`).set(clientAuth).expect(200);
    expect(result.body).toMatchObject({
      enabled: true,
      available: true,
      days: 7,
      visitors: 42,
      pageviews: 120,
      messages: 1,
      daily: [{ date: today, visitors: 5, pageviews: 12, messages: 1 }],
      referrers: [{ source: 'google.com', visitors: 20 }],
    });
    await request(server).get(`${visits}?days=5`).set(clientAuth).expect(400);
    await request(server)
      .get(`/v1/admin/projects/${ids.project}/visits`)
      .set(adminAuth)
      .expect(200);
  });
});
