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
import { madridDayOf } from '../src/modules/managed-sites/site-news.js';
import { SiteNewsService } from '../src/modules/managed-sites/site-news.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'site-news-password-1';
const admin = { email: `e2e-news-admin-${tag}@codeqlick.test`, password };
const client = { email: `e2e-news-client-${tag}@codeqlick.test`, password };
const other = { email: `e2e-news-other-${tag}@codeqlick.test`, password };

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

// A 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

type Built = { content: { news?: { posts: Array<Record<string, unknown>> } } };

describe('News of a managed site (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const builds: Built[] = [];
  let hold: Promise<void> | undefined;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const builder = app.get(SiteBuilderClient);
    vi.spyOn(builder, 'presets').mockResolvedValue([{ key: 'peluqueria', content: preset }]);
    vi.spyOn(builder, 'isConfigured').mockReturnValue(true);
    vi.spyOn(builder, 'build').mockImplementation(async (input) => {
      builds.push(input as unknown as Built);
      await hold;
      return { ok: true, release: `r${builds.length}`, ms: 10 };
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

  it('keeps posts apart from the site, builds on publish and hides expired offers', async () => {
    const server = app.getHttpServer();
    const bearer = async (user: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`,
    });
    const adminAuth = await bearer(admin);
    const clientAuth = await bearer(client);
    const otherAuth = await bearer(other);
    const portal = `/v1/portal/projects/${ids.project}/site`;
    const news = `${portal}/news`;
    const lastPosts = () => builds.at(-1)?.content.news?.posts;

    await request(server).get(news).set(clientAuth).expect(404);
    await request(server)
      .post(`/v1/admin/projects/${ids.project}/site`)
      .set(adminAuth)
      .send({ slug: `news-${tag}`, preset: 'peluqueria' })
      .expect(201);
    const site = await prisma.managedSite.findUniqueOrThrow({ where: { projectId: ids.project } });

    // The section starts off and empty; the editor says so.
    const start = await request(server).get(news).set(clientAuth).expect(200);
    expect(start.body).toMatchObject({ enabled: false, items: [], total: 0 });
    const editor = await request(server).get(`${portal}/draft`).set(clientAuth).expect(200);
    expect(editor.body.newsEnabled).toBe(false);
    await request(server).get(news).set(otherAuth).expect(404);
    await request(server)
      .post(news)
      .set(otherAuth)
      .send({ title: 'Hola', summary: 'Hola', body: 'Hola' })
      .expect(404);

    // Drafts: created and edited without building anything.
    const built = builds.length;
    const a = await request(server)
      .post(news)
      .set(clientAuth)
      .send({ title: 'Menú de Navidad', summary: 'Reserva ya.', body: 'Hola **amigos**' })
      .expect(201);
    expect(a.body).toMatchObject({
      slug: 'menu-de-navidad',
      status: 'DRAFT',
      publishedAt: null,
      expiresAt: null,
      photo: null,
      url: null,
    });
    const twin = await request(server)
      .post(news)
      .set(clientAuth)
      .send({ title: 'Menú de Navidad', summary: 'Otra vez.', body: 'Hola' })
      .expect(201);
    expect(twin.body.slug).toBe('menu-de-navidad-2');
    const digits = await request(server)
      .post(news)
      .set(clientAuth)
      .send({ title: '2024', summary: 'Un año.', body: 'Hola' })
      .expect(201);
    expect(digits.body.slug).toBe('2024-noticia');

    // Validation: lengths, link schemes, photos of the uploads, dates.
    const post = (body: Record<string, unknown>) =>
      request(server)
        .post(news)
        .set(clientAuth)
        .send({ title: 'Valid', summary: 'Valid', body: 'Valid', ...body });
    await post({ title: '' }).expect(400);
    await post({ summary: 'x'.repeat(301) }).expect(400);
    await post({ body: 'x'.repeat(10_001) }).expect(400);
    await post({ body: '[clic](javascript:alert(1))' }).expect(400);
    await post({ body: '[clic](https://example.com) y [mail](mailto:a@b.es)' }).expect(201);
    await post({ expiresAt: '24/12/2026' }).expect(400);
    await post({ slug: 'mine' }).expect(400);
    await post({ photo: 'media/0f8b2c1e-1234-4abc-8def-0123456789ab.png' }).expect(400);
    expect(builds).toHaveLength(built);

    // A photo from the site's uploads.
    const uploaded = await request(server)
      .post(`${portal}/images`)
      .set(clientAuth)
      .attach('file', PNG, 'foto.png')
      .expect(201);
    const b = await request(server)
      .post(news)
      .set(clientAuth)
      .send({
        title: 'Rebajas de invierno',
        summary: 'Hasta el 50 %.',
        body: 'Pasa a vernos.',
        photo: uploaded.body.file,
      })
      .expect(201);
    expect(b.body.photo).toMatchObject({ file: uploaded.body.file });

    // The slug never changes; a draft's edits build nothing.
    const edited = await request(server)
      .patch(`${news}/${a.body.id}`)
      .set(clientAuth)
      .send({ title: 'Menú de Navidad 2026', body: 'Texto nuevo' })
      .expect(200);
    expect(edited.body).toMatchObject({ slug: 'menu-de-navidad', title: 'Menú de Navidad 2026' });
    await request(server)
      .patch(`${news}/${a.body.id}`)
      .set(clientAuth)
      .send({ slug: 'x' })
      .expect(400);
    expect(builds).toHaveLength(built);

    // Another client sees nothing of it; the admin sees and edits it all.
    await request(server).get(`${news}/${a.body.id}`).set(otherAuth).expect(404);
    await request(server)
      .patch(`${news}/${a.body.id}`)
      .set(otherAuth)
      .send({ title: 'x' })
      .expect(404);
    await request(server).delete(`${news}/${a.body.id}`).set(otherAuth).expect(404);
    await request(server).post(`${news}/${a.body.id}/publish`).set(otherAuth).expect(404);
    await request(server)
      .put(`${portal}/news-settings`)
      .set(otherAuth)
      .send({ enabled: true })
      .expect(404);
    await request(server).get(news).set({ Authorization: 'Bearer nope' }).expect(401);
    const admins = await request(server)
      .get(`/v1/admin/projects/${ids.project}/site/news?status=DRAFT`)
      .set(adminAuth)
      .expect(200);
    expect(admins.body.total).toBeGreaterThanOrEqual(5);
    await request(server)
      .patch(`/v1/admin/projects/${ids.project}/site/news/${twin.body.id}`)
      .set(adminAuth)
      .send({ summary: 'Del equipo.' })
      .expect(200);
    await request(server)
      .get(`/v1/admin/projects/${ids.project}/site/news`)
      .set(clientAuth)
      .expect(403);

    // Publishing with the section off builds the site without news.
    const published = await request(server)
      .post(`${news}/${a.body.id}/publish`)
      .set(clientAuth)
      .expect(200);
    expect(published.body).toMatchObject({ status: 'PUBLISHED', build: 'OK' });
    expect(published.body.url).toMatch(/\/noticias\/menu-de-navidad\/$/);
    expect(builds).toHaveLength(built + 1);
    expect(lastPosts()).toBeUndefined();

    // Switching it on rebuilds with the published posts.
    const on = await request(server)
      .put(`${portal}/news-settings`)
      .set(clientAuth)
      .send({ enabled: true })
      .expect(200);
    expect(on.body).toEqual({ enabled: true });
    expect(builds).toHaveLength(built + 2);
    expect(lastPosts()).toEqual([
      expect.objectContaining({
        slug: 'menu-de-navidad',
        title: 'Menú de Navidad 2026',
        summary: 'Reserva ya.',
        body: 'Texto nuevo',
        publishedAt: published.body.publishedAt,
      }),
    ]);
    expect(lastPosts()?.[0]).not.toHaveProperty('photo');
    expect(lastPosts()?.[0]).not.toHaveProperty('expiresAt');
    expect(
      (await request(server).get(`${portal}/draft`).set(clientAuth).expect(200)).body.newsEnabled,
    ).toBe(true);

    // Editing a published post rebuilds; editing a draft still doesn't.
    await request(server)
      .patch(`${news}/${a.body.id}`)
      .set(clientAuth)
      .send({ title: 'Menú 2026' })
      .expect(200);
    expect(builds).toHaveLength(built + 3);
    expect(lastPosts()?.[0]).toMatchObject({ slug: 'menu-de-navidad', title: 'Menú 2026' });
    await request(server)
      .patch(`${news}/${b.body.id}`)
      .set(clientAuth)
      .send({ summary: 'Hasta el 60 %.' })
      .expect(200);
    expect(builds).toHaveLength(built + 3);

    // The photo goes to the builder as a content image; newest post first.
    await request(server).post(`${news}/${b.body.id}/publish`).set(clientAuth).expect(200);
    expect(builds).toHaveLength(built + 4);
    expect(lastPosts()?.map((item) => item.slug)).toEqual([
      'rebajas-de-invierno',
      'menu-de-navidad',
    ]);
    expect(lastPosts()?.[0]).toMatchObject({
      photo: { file: uploaded.body.file, alt: 'Rebajas de invierno' },
    });
    const live = await request(server).get(`${news}?status=PUBLISHED`).set(clientAuth).expect(200);
    expect(live.body.total).toBe(2);

    // The editor's preview gets the published posts too.
    const builder = app.get(SiteBuilderClient);
    const previews: Array<{ content: Record<string, unknown> }> = [];
    vi.spyOn(builder, 'buildDraft').mockImplementation((input) => {
      previews.push(input);
      return Promise.resolve({ ok: true, ms: 1 });
    });
    const draft = (await request(server).get(`${portal}/draft`).set(clientAuth).expect(200)).body;
    await request(server)
      .put(`${portal}/draft`)
      .set(clientAuth)
      .send({ content: draft.content })
      .expect(200);
    expect(previews.at(-1)?.content.news).toMatchObject({
      posts: [{ slug: 'rebajas-de-invierno' }, { slug: 'menu-de-navidad' }],
    });

    // Unpublishing rebuilds once; doing it again changes nothing.
    const unpublished = await request(server)
      .post(`/v1/admin/projects/${ids.project}/site/news/${a.body.id}/unpublish`)
      .set(adminAuth)
      .expect(200);
    expect(unpublished.body).toMatchObject({ status: 'DRAFT', publishedAt: null, build: 'OK' });
    expect(builds).toHaveLength(built + 5);
    expect(lastPosts()?.map((item) => item.slug)).toEqual(['rebajas-de-invierno']);
    const again = await request(server)
      .post(`${news}/${a.body.id}/unpublish`)
      .set(clientAuth)
      .expect(200);
    expect(again.body).not.toHaveProperty('build');
    expect(builds).toHaveLength(built + 5);

    // An offer expires: the hourly job rebuilds once and the post shows as EXPIRED.
    const offer = await request(server)
      .post(news)
      .set(clientAuth)
      .send({
        title: 'Oferta de hoy',
        summary: 'Solo hoy.',
        body: '2x1',
        expiresAt: madridDayOf(new Date()),
      })
      .expect(201);
    expect(offer.body.expiresAt).not.toBeNull();
    await request(server).post(`${news}/${offer.body.id}/publish`).set(clientAuth).expect(200);
    expect(lastPosts()?.map((item) => item.slug)).toEqual(['oferta-de-hoy', 'rebajas-de-invierno']);
    expect(lastPosts()?.[0]).toHaveProperty('expiresAt');
    const afterOffer = builds.length;
    const newsService = app.get(SiteNewsService);
    const buildAt = (await prisma.managedSite.findUniqueOrThrow({ where: { id: site.id } }))
      .lastBuildAt!;
    await prisma.siteNewsPost.update({
      where: { id: offer.body.id },
      data: { expiresAt: new Date(buildAt.getTime() + 1) },
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(await newsService.rebuildExpired()).toBe(1);
    expect(builds).toHaveLength(afterOffer + 1);
    expect(lastPosts()?.map((item) => item.slug)).toEqual(['rebajas-de-invierno']);
    expect(await newsService.rebuildExpired()).toBe(0);
    expect(builds).toHaveLength(afterOffer + 1);
    const expired = await request(server).get(`${news}?status=EXPIRED`).set(clientAuth).expect(200);
    expect(expired.body.items.map((item: { id: string }) => item.id)).toEqual([offer.body.id]);
    expect(expired.body.items[0]).toMatchObject({ status: 'EXPIRED', url: null });
    // It can't be published again until the expiry is extended.
    await request(server).post(`${news}/${offer.body.id}/unpublish`).set(clientAuth).expect(200);
    await request(server).post(`${news}/${offer.body.id}/publish`).set(clientAuth).expect(409);

    // A failed builder: nothing changes.
    const configured = vi.spyOn(builder, 'isConfigured');
    configured.mockReturnValueOnce(false);
    await request(server).post(`${news}/${a.body.id}/publish`).set(clientAuth).expect(503);
    expect(
      (await request(server).get(`${news}/${a.body.id}`).set(clientAuth).expect(200)).body.status,
    ).toBe('DRAFT');

    // Several changes while a build runs fold into one more build.
    const folded = await Promise.all(
      ['uno', 'dos', 'tres'].map(
        async (word) =>
          (await post({ title: `Fold ${word}`, summary: word }).expect(201)).body as { id: string },
      ),
    );
    const before = builds.length;
    let release!: () => void;
    hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requests = folded.map((item) =>
      request(server)
        .post(`${news}/${item.id}/publish`)
        .set(clientAuth)
        .then((response) => response),
    );
    await vi.waitFor(() => expect(builds).toHaveLength(before + 1));
    await vi.waitFor(async () =>
      expect(
        await prisma.siteNewsPost.count({
          where: { siteId: site.id, slug: { startsWith: 'fold-' }, publishedAt: { not: null } },
        }),
      ).toBe(3),
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    release();
    const answers = await Promise.all(requests);
    hold = undefined;
    expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200]);
    expect(answers.map((answer) => answer.body.build)).toEqual(['OK', 'OK', 'OK']);
    expect(builds).toHaveLength(before + 2);
    expect(lastPosts()?.filter((item) => String(item.slug).startsWith('fold-'))).toHaveLength(3);

    // Deleting a published post rebuilds; deleting a draft doesn't.
    const afterFold = builds.length;
    await request(server).delete(`${news}/${folded[0]!.id}`).set(clientAuth).expect(204);
    expect(builds).toHaveLength(afterFold + 1);
    expect(lastPosts()?.map((item) => item.slug)).not.toContain('fold-uno');
    await request(server).delete(`${news}/${a.body.id}`).set(clientAuth).expect(204);
    expect(builds).toHaveLength(afterFold + 1);
    await request(server).get(`${news}/${a.body.id}`).set(clientAuth).expect(404);

    // Switched off, the builds leave the news out and the posts stay.
    await request(server)
      .put(`${portal}/news-settings`)
      .set(clientAuth)
      .send({ enabled: false })
      .expect(200);
    expect(lastPosts()).toBeUndefined();
    expect(
      await prisma.siteNewsPost.count({ where: { siteId: site.id, publishedAt: { not: null } } }),
    ).toBeGreaterThan(0);

    // A site keeps up to 200 posts.
    const have = await prisma.siteNewsPost.count({ where: { siteId: site.id } });
    await prisma.siteNewsPost.createMany({
      data: Array.from({ length: 200 - have }, (_, index) => ({
        siteId: site.id,
        slug: `relleno-${index}`,
        title: `Relleno ${index}`,
        summary: 'x',
        body: 'x',
      })),
    });
    const full = await post({ title: 'Una de más' }).expect(400);
    expect(JSON.stringify(full.body)).toContain('200');

    // The log names who did what.
    const actions = await prisma.activityLog.findMany({
      where: {
        action: { startsWith: 'site_news.' },
        details: { path: ['projectId'], equals: ids.project },
      },
    });
    const kinds = new Set(actions.map((entry) => entry.action));
    expect([...kinds]).toEqual(
      expect.arrayContaining([
        'site_news.created',
        'site_news.updated',
        'site_news.published',
        'site_news.unpublished',
        'site_news.deleted',
      ]),
    );
    expect(actions.find((entry) => entry.action === 'site_news.created')).toMatchObject({
      actorName: 'Marta',
    });
    expect(
      await prisma.activityLog.count({
        where: { action: 'site_news.switched', targetId: ids.project },
      }),
    ).toBe(2);
  });
});
