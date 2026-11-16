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
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'site-english-password-1';
const admin = { email: `e2e-sen-admin-${tag}@codeqlick.test`, password };
const client = { email: `e2e-sen-client-${tag}@codeqlick.test`, password };

/** A preset as site-builder returns it; a style's English texts never reach a new site. */
const preset = {
  demo: true,
  url: 'https://peluqueria.demo.codeqlick.com',
  form: { demo: true },
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
  hours: [{ days: 'Martes a viernes', hours: '9:30–20:00' }],
  hero: {
    title: 'Tu pelo, en las mejores manos',
    text: 'Cortes, color y peinados.',
    image: { file: 'hero.jpg', alt: 'Peluquera' },
    primary: { label: 'Pedir cita', href: '#contacto' },
  },
  services: { title: 'Servicios', items: [{ name: 'Corte' }, { name: 'Color' }] },
  contactSection: { title: 'Pide tu cita' },
  legal: { owner: 'Alba', taxId: '0', address: 'Sevilla', email: 'hola@alba.example' },
  english: true,
  en: { hero: { title: 'Demo English' } },
};

type Build = { content: Record<string, unknown>; preset: string };

describe('A basic website in Spanish and English (e2e, decision 106)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const builds: Build[] = [];
  const drafts: Build[] = [];
  const ids: Record<string, string> = {};
  /** The first news post of the last live build. */
  const firstPost = () =>
    (builds.at(-1)!.content.news as { posts: Array<Record<string, unknown>> }).posts[0];

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
    vi.spyOn(builder, 'buildDraft').mockImplementation((input) => {
      drafts.push(input);
      return Promise.resolve({ ok: true, ms: 10 });
    });
    vi.spyOn(builder, 'isConfigured').mockReturnValue(true);
    vi.spyOn(builder, 'draftFile').mockResolvedValue(null);
    vi.spyOn(builder, 'removeDraft').mockResolvedValue();
    vi.spyOn(app.get(MailService), 'send').mockResolvedValue();
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

  it('switches it on, saves the English texts, builds them with the news and switches it off', async () => {
    const server = app.getHttpServer();
    const bearer = async (user: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`,
    });
    const adminAuth = await bearer(admin);
    const clientAuth = await bearer(client);
    await request(server)
      .post(`/v1/admin/projects/${ids.project}/site`)
      .set(adminAuth)
      .send({ slug: `sen-${tag}`, preset: 'peluqueria' })
      .expect(201);
    const project = `/v1/portal/projects/${ids.project}/site`;
    const editor = `${project}/draft`;

    // A new site starts in Spanish only, whatever its style had.
    const start = await request(server).get(editor).set(clientAuth).expect(200);
    const content = start.body.content as Record<string, unknown>;
    expect(content).not.toHaveProperty('english');
    expect(content).not.toHaveProperty('en');
    expect(builds.at(-1)?.content).not.toHaveProperty('english');
    expect(builds.at(-1)?.content).not.toHaveProperty('en');

    // Only texts can have an English twin, with their Spanish limits.
    const invalid = await request(server)
      .put(editor)
      .set(clientAuth)
      .send({
        content: {
          ...content,
          english: true,
          en: { hero: { primary: { href: '/x' }, title: 'x'.repeat(121) } },
        },
      })
      .expect(400);
    expect(invalid.body.errors.map((error: { path: string }) => error.path)).toEqual(
      expect.arrayContaining(['en.hero.primary', 'en.hero.title']),
    );

    // On, with some texts written (and some left empty): the preview gets them.
    const en = {
      hero: { title: 'Your hair, in the best hands', text: '' },
      services: { items: [{}, { name: 'Colour' }] },
      hours: [{ days: 'Tuesday to Friday' }],
    };
    await request(server)
      .put(editor)
      .set(clientAuth)
      .send({ content: { ...content, english: true, en }, rebuild: true })
      .expect(200);
    expect(drafts.at(-1)?.content).toMatchObject({ english: true, en });

    // A post with its English title, published: the live build carries it once published.
    await request(server)
      .put(`${project}/news-settings`)
      .set(clientAuth)
      .send({ enabled: true })
      .expect(200);
    const created = await request(server)
      .post(`${project}/news`)
      .set(clientAuth)
      .send({ title: 'Oferta', summary: 'Resumen', body: 'Texto', titleEn: 'Offer', bodyEn: ' ' })
      .expect(201);
    expect(created.body).toMatchObject({ titleEn: 'Offer', summaryEn: null, bodyEn: null });
    const postId = created.body.id as string;
    await request(server).post(`${project}/news/${postId}/publish`).set(clientAuth).expect(200);
    // The published content is still Spanish only: no English in the build yet.
    expect(builds.at(-1)?.content).not.toHaveProperty('en');
    expect(firstPost()).not.toHaveProperty('en');

    await request(server).post(`${editor}/publish`).set(clientAuth).expect(200);
    const published = builds.at(-1)!.content;
    expect(published).toMatchObject({ english: true, en });
    expect((published.news as { posts: unknown[] }).posts[0]).toMatchObject({
      title: 'Oferta',
      en: { title: 'Offer' },
    });

    // Editing the post's English title rebuilds the live site with it; null removes it.
    await request(server)
      .patch(`${project}/news/${postId}`)
      .set(clientAuth)
      .send({ summaryEn: 'Summary' })
      .expect(200);
    expect(firstPost()?.en).toEqual({ title: 'Offer', summary: 'Summary' });
    const cleared = await request(server)
      .patch(`${project}/news/${postId}`)
      .set(clientAuth)
      .send({ titleEn: null })
      .expect(200);
    expect(cleared.body.titleEn).toBeNull();

    // Off: builds get no English at all, but the texts stay in the content for later.
    const current = (await request(server).get(editor).set(clientAuth).expect(200)).body
      .content as Record<string, unknown>;
    await request(server)
      .put(editor)
      .set(clientAuth)
      .send({ content: { ...current, english: false } })
      .expect(200);
    await request(server).post(`${editor}/publish`).set(clientAuth).expect(200);
    const off = builds.at(-1)!.content;
    expect(off).not.toHaveProperty('english');
    expect(off).not.toHaveProperty('en');
    expect((off.news as { posts: unknown[] }).posts[0]).not.toHaveProperty('en');
    const site = await prisma.managedSite.findUniqueOrThrow({ where: { projectId: ids.project } });
    expect(site.content).toMatchObject({ english: false, en });
  });
});
