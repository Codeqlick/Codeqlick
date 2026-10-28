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
const password = 'site-editor-password-1';
const admin = { email: `e2e-sed-admin-${tag}@codeqlick.test`, password };
const client = { email: `e2e-sed-client-${tag}@codeqlick.test`, password };
const other = { email: `e2e-sed-other-${tag}@codeqlick.test`, password };

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

const restaurante = {
  ...preset,
  theme: { ...preset.theme, primary: '#1F5C4A', headingFont: 'fraunces', corners: 'square' },
  hero: { ...preset.hero, image: { file: 'plato.jpg', alt: 'Un plato' } },
  sections: ['gallery', 'services', 'about', 'testimonials'],
};

describe('The website editor: a draft with its preview, then published (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const sent: MailMessage[] = [];
  const builds: Array<{ content: Record<string, unknown>; preset: string }> = [];
  const drafts: Array<{
    slug: string;
    preset: string;
    base: string;
    content: Record<string, unknown>;
  }> = [];
  const removedDrafts: string[] = [];
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const builder = app.get(SiteBuilderClient);
    vi.spyOn(builder, 'presets').mockResolvedValue([
      { key: 'peluqueria', content: preset },
      { key: 'restaurante', content: restaurante },
    ]);
    vi.spyOn(builder, 'build').mockImplementation((input) => {
      builds.push(input);
      return Promise.resolve({ ok: true, release: `r${builds.length}`, ms: 10 });
    });
    vi.spyOn(builder, 'buildDraft').mockImplementation((input) => {
      drafts.push(input);
      return Promise.resolve({ ok: true, ms: 10 });
    });
    vi.spyOn(builder, 'draftFile').mockImplementation((slug: string, path: string) =>
      Promise.resolve(
        drafts.some((draft) => draft.slug === slug) && !removedDrafts.includes(slug)
          ? new Response(`<html>${path || 'index'}</html>`, {
              headers: { 'Content-Type': 'text/html' },
            })
          : null,
      ),
    );
    vi.spyOn(builder, 'removeDraft').mockImplementation((slug: string) => {
      removedDrafts.push(slug);
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
    }
    await app?.close();
  });

  it('saves a draft of everything, previews it, publishes it and discards the next one', async () => {
    const server = app.getHttpServer();
    const bearer = async (user: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`,
    });
    const adminAuth = await bearer(admin);
    const clientAuth = await bearer(client);
    const otherAuth = await bearer(other);
    const slug = `sed-${tag}`;
    await request(server)
      .post(`/v1/admin/projects/${ids.project}/site`)
      .set(adminAuth)
      .send({ slug, preset: 'peluqueria' })
      .expect(201);
    const editor = `/v1/portal/projects/${ids.project}/site/draft`;

    const start = await request(server).get(editor).set(clientAuth).expect(200);
    expect(start.body).toMatchObject({ draft: null, preset: 'peluqueria' });
    expect(start.body.presets.map((item: { key: string }) => item.key)).toEqual([
      'peluqueria',
      'restaurante',
    ]);
    await request(server).get(editor).set(otherAuth).expect(404);
    type Content = {
      hero: Record<string, unknown>;
      theme: Record<string, unknown>;
      legal: Record<string, unknown>;
    } & Record<string, unknown>;
    const content = start.body.content as Content;

    // Every issue comes back with its path, and nothing is saved.
    const invalid = await request(server)
      .put(editor)
      .set(clientAuth)
      .send({
        content: {
          ...content,
          hero: { ...content.hero, title: '' },
          theme: { ...content.theme, primary: 'red' },
        },
      })
      .expect(400);
    expect(invalid.body.errors.map((error: { path: string }) => error.path)).toEqual(
      expect.arrayContaining(['hero.title', 'theme.primary']),
    );
    expect((await request(server).get(editor).set(clientAuth).expect(200)).body.draft).toBeNull();

    // Design, legal data and texts: the first save builds the preview.
    const edited = {
      ...content,
      theme: { ...content.theme, primary: '#123456' },
      hero: { ...content.hero, title: 'Peinados para bodas', eyebrow: 'Triana · Sevilla' },
      legal: { ...content.legal, owner: 'Marta Ruiz López', taxId: '12345678Z' },
      banner: { title: 'Pide tu cita', link: { label: 'Reservar', href: '#contacto' } },
    };
    const saved = await request(server)
      .put(editor)
      .set(clientAuth)
      .send({ content: edited })
      .expect(200);
    expect(saved.body.draft).toMatchObject({ previewStatus: 'READY' });
    const previewUrl = saved.body.draft.previewUrl as string;
    expect(previewUrl).toMatch(/^\/site-draft\/[\w-]{16,}\/$/);
    expect(drafts.at(-1)).toMatchObject({
      slug,
      preset: 'peluqueria',
      base: previewUrl.replace(/\/$/, ''),
      content: { hero: { title: 'Peinados para bodas' }, demo: false },
    });
    expect(builds).toHaveLength(1);

    // Typing more without asking for a rebuild doesn't build again.
    const drafted = drafts.length;
    await request(server)
      .put(editor)
      .set(clientAuth)
      .send({ content: { ...edited, hero: { ...edited.hero, text: 'Recogidos y color.' } } })
      .expect(200);
    expect(drafts).toHaveLength(drafted);

    // Its preview is served by its key; the live site hasn't changed.
    const file = await request(server)
      .get(`/v1${previewUrl.replace('/site-draft/', '/site-drafts/')}`)
      .expect(200);
    expect(file.text).toContain('<html>index</html>');
    expect(file.headers['content-security-policy']).toBe('sandbox allow-scripts');
    await request(server)
      .get(`/v1${previewUrl.replace('/site-draft/', '/site-drafts/')}_astro/x.css`)
      .expect(200);
    await request(server).get('/v1/site-drafts/nope-nope-nope-nope-nope/').expect(404);
    const live = await request(server)
      .get(`/v1/portal/projects/${ids.project}/site`)
      .set(clientAuth)
      .expect(200);
    expect(live.body.editable.hero.title).toBe('Tu pelo, en las mejores manos');

    // Another style: its colours, fonts, order and photos; every text stays.
    const styled = await request(server)
      .post(`${editor}/style`)
      .set(clientAuth)
      .send({ preset: 'restaurante' })
      .expect(200);
    expect(styled.body).toMatchObject({
      preset: 'restaurante',
      content: {
        theme: { primary: '#1F5C4A', headingFont: 'fraunces' },
        hero: { title: 'Peinados para bodas', image: { file: 'plato.jpg' } },
        sections: ['gallery', 'services', 'about', 'testimonials'],
      },
    });
    expect(drafts.at(-1)?.preset).toBe('restaurante');

    // Published: online, a revision kept, the team told.
    const before = sent.length;
    const published = await request(server).post(`${editor}/publish`).set(clientAuth).expect(200);
    expect(published.body).toMatchObject({ draft: null, preset: 'restaurante' });
    expect(builds.at(-1)).toMatchObject({
      preset: 'restaurante',
      content: {
        hero: { title: 'Peinados para bodas', text: 'Recogidos y color.' },
        legal: { taxId: '12345678Z' },
      },
    });
    expect(removedDrafts).toContain(slug);
    await vi.waitFor(() => expect(sent.length).toBe(before + 1));
    expect(sent.at(-1)?.text).toMatch(/Design/);
    expect(sent.at(-1)?.text).toMatch(/Legal data/);
    const site = await prisma.managedSite.findUniqueOrThrow({
      where: { projectId: ids.project },
      include: { revisions: true },
    });
    expect(site).toMatchObject({ preset: 'restaurante', draftContent: null, draftKey: null });
    expect(site.revisions.length).toBeGreaterThan(0);
    await request(server).post(`${editor}/publish`).set(clientAuth).expect(409);
    await request(server)
      .get(`/v1${previewUrl.replace('/site-draft/', '/site-drafts/')}`)
      .expect(404);

    // A new draft, discarded: back to what is online.
    await request(server)
      .put(editor)
      .set(adminAuth)
      .send({ content: { ...published.body.content, footerNote: 'Fotos: Marta' } })
      .expect(200);
    await request(server).delete(editor).set(clientAuth).expect(204);
    const after = await request(server).get(editor).set(clientAuth).expect(200);
    expect(after.body.draft).toBeNull();
    expect(after.body.content.footerNote).toBeUndefined();
  });
});
