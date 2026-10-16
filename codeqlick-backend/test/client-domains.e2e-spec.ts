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
import { DomainsService } from '../src/modules/domains/domains.service.js';
import { SiteBuilderClient } from '../src/modules/managed-sites/site-builder.client.js';
import { SiteDomainsService } from '../src/modules/managed-sites/site-domains.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'client-domain-password-1';
const admin = { email: `e2e-cdom-admin-${tag}@codeqlick.test`, password };
const client = { email: `e2e-cdom-client-${tag}@codeqlick.test`, password };
const other = { email: `e2e-cdom-other-${tag}@codeqlick.test`, password };

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

describe('Client domains (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const sent: MailMessage[] = [];
  const builds: Array<{ domains: string[]; content: Record<string, unknown> }> = [];
  const ids: Record<string, string> = {};
  const domain = `marta-${tag}.es`;
  /** What the registry, DNS and HTTPS say about the domain at each step. */
  const world = { registered: false as boolean | null, addresses: [] as string[], https: false };

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
      return Promise.resolve({ ok: true, release: `r${builds.length}`, ms: 10 });
    });
    vi.spyOn(app.get(MailService), 'send').mockImplementation((message: MailMessage) => {
      sent.push(message);
      return Promise.resolve();
    });
    const domains = app.get(DomainsService);
    vi.spyOn(domains, 'connect').mockImplementation(() =>
      Promise.resolve({ managed: false, registered: world.registered }),
    );
    vi.spyOn(domains, 'availability').mockImplementation((name: string) =>
      Promise.resolve(
        name === '---'
          ? null
          : [
              { domain: `${name}.es`, available: true },
              { domain: `${name}.com`, available: false },
            ],
      ),
    );
    vi.spyOn(app.get(SiteDomainsService), 'probe').mockImplementation(() =>
      Promise.resolve({ addresses: world.addresses, https: world.https }),
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
    await prisma.user.create({
      data: { email: other.email, name: 'Ada', role: Role.CLIENT, passwordHash },
    });
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
      await prisma.lead.deleteMany({ where: { email: client.email } });
    }
    await app?.close();
  });

  it('answers availability publicly and refuses names without a label', async () => {
    const server = app.getHttpServer();
    const ok = await request(server)
      .get('/v1/domains/availability')
      .query({ name: 'marta' })
      .expect(200);
    expect(ok.body.results).toEqual([
      { domain: 'marta.es', available: true },
      { domain: 'marta.com', available: false },
    ]);
    await request(server).get('/v1/domains/availability').query({ name: '---' }).expect(400);
    await request(server).get('/v1/domains/availability').expect(400);
  });

  it('keeps the domain of a website request', async () => {
    const server = app.getHttpServer();
    const created = await request(server)
      .post('/v1/site-requests')
      .send({
        preset: 'peluqueria',
        business: { name: 'Peluquería Marta', kind: 'Peluquería', city: 'Sevilla' },
        domain: { name: domain, owned: false },
        name: 'Marta',
        email: client.email,
        locale: 'es',
      })
      .expect(201);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(lead.siteRequest).toMatchObject({ domain: { name: domain, owned: false } });
    expect(lead.message).toContain(`Domain: ${domain} (they want to register it)`);
  });

  it('follows the domain from unregistered to live, and the address with it', async () => {
    const server = app.getHttpServer();
    const bearer = async (user: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`,
    });
    const adminAuth = await bearer(admin);
    const clientAuth = await bearer(client);
    const otherAuth = await bearer(other);
    const portal = `/v1/portal/projects/${ids.project}/site`;
    const check = `/v1/admin/projects/${ids.project}/site/domain/check`;
    const preview = `https://marta-${tag}.demo.codeqlick.com`;

    await request(server)
      .post(`/v1/admin/projects/${ids.project}/site`)
      .set(adminAuth)
      .send({ slug: `marta-${tag}`, preset: 'peluqueria' })
      .expect(201);

    // Codeqlick's own names aren't a client's to take.
    await request(server)
      .put(`${portal}/domain`)
      .set(clientAuth)
      .send({ name: `otra.demo.codeqlick.com` })
      .expect(400);
    await request(server).put(`${portal}/domain`).set(otherAuth).send({ name: domain }).expect(404);

    const chosen = await request(server)
      .put(`${portal}/domain`)
      .set(clientAuth)
      .send({ name: domain })
      .expect(200);
    expect(chosen.body).toMatchObject({
      domain: { name: domain },
      url: preview,
      previewUrl: preview,
    });
    expect(builds.at(-1)!.domains).toEqual([
      `marta-${tag}.demo.codeqlick.com`,
      domain,
      `www.${domain}`,
    ]);
    expect(builds.at(-1)!.content.url).toBe(preview);

    // Nobody has it yet.
    let site = await request(server).post(check).set(adminAuth).expect(200);
    expect(site.body).toMatchObject({ domainState: 'UNREGISTERED', url: preview });

    // Registered, but it still points somewhere else.
    world.registered = true;
    world.addresses = ['213.186.33.5'];
    site = await request(server).post(check).set(adminAuth).expect(200);
    expect(site.body).toMatchObject({ domainState: 'ELSEWHERE', url: preview });

    // It points here and serves HTTPS: the site is rebuilt on its domain and the client told.
    world.addresses = ['54.37.159.171'];
    world.https = true;
    const buildsBefore = builds.length;
    site = await request(server).post(check).set(adminAuth).expect(200);
    expect(site.body).toMatchObject({ domainState: 'LIVE', url: `https://${domain}` });
    expect(builds.length).toBe(buildsBefore + 1);
    expect(builds.at(-1)!.content.url).toBe(`https://${domain}`);
    expect(
      sent.find((message) => message.subject === `Your website is live at ${domain}`),
    ).toBeDefined();
    const project = await prisma.clientProject.findUniqueOrThrow({ where: { id: ids.project } });
    expect(project).toMatchObject({ productionUrl: `https://${domain}`, domainName: domain });
    const monitor = await prisma.siteMonitor.findUnique({ where: { projectId: ids.project } });
    expect(monitor?.enabled).toBe(true);

    // A second check changes nothing.
    await request(server).post(check).set(adminAuth).expect(200);
    expect(builds.length).toBe(buildsBefore + 1);

    const own = await request(server).get(portal).set(clientAuth).expect(200);
    expect(own.body.domain).toMatchObject({ name: domain, state: 'LIVE' });
    expect(own.body.url).toBe(`https://${domain}`);
  });
});
