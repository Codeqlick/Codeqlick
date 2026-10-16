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
import { SiteBuilderClient } from '../src/modules/managed-sites/site-builder.client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'site-password-1';
const admin = { email: `e2e-site-admin-${tag}@codeqlick.test`, password };

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

describe('Managed sites (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const ids: Record<string, string> = {};
  const builds: Array<{ slug: string; domains: string[]; content: Record<string, unknown> }> = [];
  let failNext = false;

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
      if (failNext) {
        failNext = false;
        return Promise.resolve({ ok: false, error: 'astro build failed' });
      }
      return Promise.resolve({ ok: true, release: `r${builds.length}`, ms: 10 });
    });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.create({
      data: { email: admin.email, name: 'Luis', role: Role.ADMIN, passwordHash },
    });
    ids.client = (
      await prisma.user.create({
        data: {
          email: `e2e-site-client-${tag}@codeqlick.test`,
          name: 'Marta',
          role: Role.CLIENT,
          passwordHash,
        },
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

  it('creates a site from a preset, builds every change and keeps revisions', async () => {
    const server = app.getHttpServer();
    const login = await request(server).post('/v1/auth/login').send(admin).expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
    const site = `/v1/admin/projects/${ids.project}/site`;
    const slug = `marta-${tag}`;

    expect((await request(server).get(site).set(auth).expect(200)).body).toEqual({ exists: false });
    await request(server)
      .post(site)
      .set(auth)
      .send({ slug: 'Bad Slug', preset: 'peluqueria' })
      .expect(400);

    const created = await request(server)
      .post(site)
      .set(auth)
      .send({ slug, preset: 'peluqueria' })
      .expect(201);
    expect(created.body).toMatchObject({
      slug,
      status: 'LIVE',
      release: 'r1',
      url: `https://${slug}.demo.codeqlick.com`,
    });
    // The project's name and client go in; the demo's fields don't.
    expect(created.body.content.business.name).toBe('Peluquería Marta');
    expect(created.body.content.legal).toMatchObject({ owner: 'Marta', taxId: '' });
    expect(created.body.content).not.toHaveProperty('footerNote');
    // Built with the URL, demo off and the project's new form.
    const form = await prisma.siteForm.findUniqueOrThrow({ where: { projectId: ids.project } });
    expect(builds.at(-1)).toMatchObject({
      slug,
      domains: [`${slug}.demo.codeqlick.com`],
      content: { url: `https://${slug}.demo.codeqlick.com`, demo: false, form: { key: form.key } },
    });
    expect(form.recipients).toEqual([`e2e-site-client-${tag}@codeqlick.test`]);
    const project = await prisma.clientProject.findUniqueOrThrow({ where: { id: ids.project } });
    expect(project.productionUrl).toBe(`https://${slug}.demo.codeqlick.com`);

    await request(server)
      .post(site)
      .set(auth)
      .send({ slug: `${slug}-2`, preset: 'peluqueria' })
      .expect(409);

    // Content: validated, saved with a revision, built.
    const content = { ...created.body.content, hours: [{ days: 'Lunes', hours: 'Cerrado' }] };
    await request(server)
      .put(`${site}/content`)
      .set(auth)
      .send({ content: { ...content, theme: { ...content.theme, primary: 'red' } } })
      .expect(400);
    const updated = await request(server)
      .put(`${site}/content`)
      .set(auth)
      .send({ content })
      .expect(200);
    expect(updated.body.content.hours).toEqual([{ days: 'Lunes', hours: 'Cerrado' }]);
    const revisions = await request(server).get(`${site}/revisions`).set(auth).expect(200);
    expect(revisions.body).toHaveLength(1);

    // A failed build keeps the content and reports it.
    failNext = true;
    const failed = await request(server).post(`${site}/build`).set(auth).expect(200);
    expect(failed.body).toMatchObject({ status: 'FAILED', lastBuildError: 'astro build failed' });

    const restored = await request(server)
      .post(`${site}/revisions/${revisions.body[0].id as string}/restore`)
      .set(auth)
      .expect(200);
    expect(restored.body).toMatchObject({ status: 'LIVE', lastBuildError: null });
    expect(restored.body.content).not.toHaveProperty('hours');

    // A domain of its own: served there too, and it becomes the live address.
    const withDomain = await request(server)
      .patch(site)
      .set(auth)
      .send({ domain: `marta-${tag}.es` })
      .expect(200);
    expect(withDomain.body.url).toBe(`https://marta-${tag}.es`);
    expect(builds.at(-1)?.domains).toEqual([`${slug}.demo.codeqlick.com`, `marta-${tag}.es`]);

    const list = await request(server).get('/v1/admin/sites').set(auth).expect(200);
    expect(list.body.some((item: { slug: string }) => item.slug === slug)).toBe(true);
  });
});
