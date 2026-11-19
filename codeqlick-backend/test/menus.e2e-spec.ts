import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Role } from '../src/generated/prisma/client.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { MenusMaintenanceService } from '../src/modules/menus/menus-maintenance.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const tag = randomUUID().slice(0, 8);
const DAY = 86_400_000;

interface Account {
  id: string;
  auth: { Authorization: string };
}

const CONTENT = {
  categories: [
    {
      name: 'Entrantes',
      items: [
        {
          name: 'Croquetas',
          description: 'De jamón',
          price: '8,50',
          allergens: ['milk', 'gluten'],
        },
        { name: 'Ensalada', price: 'desde 7', soldOut: true },
        { name: 'Plato secreto', price: '99', hidden: true },
      ],
    },
    { name: 'Solo ocultos', items: [{ name: 'Oculto', hidden: true }] },
  ],
};

describe('Menu (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let owner: Account;
  let other: Account;
  let admin: Account;
  const sent: MailMessage[] = [];
  let ip = 0;

  async function account(label: string, role: Role): Promise<Account> {
    const email = `e2e-menu-${label}-${tag}@codeqlick.test`;
    const user = await prisma.user.create({
      data: { email, name: `Menu ${label}`, role, passwordHash: 'x', locale: 'ES' },
    });
    const token = await app
      .get(JwtService)
      .signAsync({ sub: user.id, email, name: user.name, role });
    return { id: user.id, auth: { Authorization: `Bearer ${token}` } };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    vi.spyOn(app.get(MailService), 'send').mockImplementation(async (message) => {
      sent.push(message);
    });
    owner = await account('owner', Role.CLIENT);
    other = await account('other', Role.CLIENT);
    admin = await account('admin', Role.ADMIN);
  });

  beforeEach(() => {
    sent.length = 0;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.menuReport.deleteMany({ where: { slug: { contains: tag } } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@codeqlick.test` } } });
    }
    await app?.close();
  });

  const server = () => app.getHttpServer();
  /** Every call comes from its own address: the limits are per IP. */
  const from = () => ({ 'X-Forwarded-For': `10.8.${tag.charCodeAt(0)}.${++ip}` });
  const slug = (name: string) => `${name}-${tag}`;
  const body = (name: string, extra: Record<string, unknown> = {}) => ({
    slug: slug(name),
    kind: 'MENU',
    businessName: 'Bar Pepe',
    language: 'ES',
    ...extra,
  });
  const post = (who: Account, payload: Record<string, unknown>) =>
    request(server()).post('/v1/menus').set(who.auth).set(from()).send(payload);
  const get = (who: Account, path: string) =>
    request(server()).get(`/v1/menus${path}`).set(who.auth).set(from());
  const patch = (who: Account, id: string, payload: Record<string, unknown>) =>
    request(server()).patch(`/v1/menus/${id}`).set(who.auth).set(from()).send(payload);
  const publicGet = (name: string) =>
    request(server()).get(`/v1/menus/p/${name}`).set(from()).redirects(0);

  let menuId = '';

  it('creates a menu for a signed-in account, with defaults and an owner-only view', async () => {
    const created = await post(owner, body('pepe', { content: CONTENT })).expect(201);
    menuId = created.body.id;
    expect(created.body).toMatchObject({
      slug: slug('pepe'),
      kind: 'MENU',
      businessName: 'Bar Pepe',
      language: 'ES',
      currency: 'EUR',
      title: 'Carta',
      intro: '',
      address: '',
      openingNote: '',
      note: '',
      enabled: true,
      indexable: true,
      suspended: false,
      suspendedReason: null,
      revision: 1,
      redirects: [],
    });
    expect(created.body.url.endsWith(`/${slug('pepe')}`)).toBe(true);
    const [first] = created.body.content.categories;
    expect(first.key).toMatch(/^[a-z0-9]{8}$/);
    expect(first.items[0]).toMatchObject({ name: 'Croquetas', allergens: ['gluten', 'milk'] });

    await request(server()).post('/v1/menus').send(body('anon')).expect(401);
  });

  it('lists my menus without content, with the plan limits', async () => {
    const list = await get(owner, '').expect(200);
    expect(list.body).toEqual({
      items: [
        {
          id: menuId,
          slug: slug('pepe'),
          kind: 'MENU',
          businessName: 'Bar Pepe',
          enabled: true,
          suspended: false,
          updatedAt: expect.any(String),
        },
      ],
      limits: { menus: 1, categories: 20, itemsPerCategory: 60, showBadge: true },
    });
    expect((await get(other, '').expect(200)).body.items).toEqual([]);
  });

  it('allows one menu on the free plan, and refuses bad links and texts with 422', async () => {
    const limit = await post(owner, body('segundo')).expect(409);
    expect(limit.body).toMatchObject({ status: 409, code: 'MENU_LIMIT' });

    for (const [payload, path] of [
      [body('x', { slug: 'editar' }), 'slug'],
      [body('x', { slug: 'ab' }), 'slug'],
      [body('x', { slug: 'codeqlick-bar' }), 'slug'],
      [body('otro', { intro: 'Visítanos en www.bar.com' }), 'intro'],
      [body('otro', { content: { categories: [] } }), 'content.categories'],
    ] as const) {
      const refused = await post(other, payload).expect(422);
      expect(refused.body.errors.map((e: { path: string }) => e.path)).toContain(path);
    }
    // Shape errors are 400.
    await post(other, body('otro', { currency: 'JPY' })).expect(400);
    await post(other, { ...body('otro'), extra: 1 }).expect(400);
  });

  it('answers 409 for a slug another menu has', async () => {
    const taken = await post(other, body('pepe')).expect(409);
    expect(taken.body.detail).toBe('That link is taken');
  });

  it('shows the menu to its owner only', async () => {
    const mine = await get(owner, `/${menuId}`).expect(200);
    expect(mine.body.revision).toBe(1);
    await get(other, `/${menuId}`).expect(404);
    await get(owner, '/not-a-uuid').expect(400);
  });

  it('serves the public page without hidden items or empty categories, and no owner data', async () => {
    const page = await publicGet(slug('pepe')).expect(200);
    expect(page.body).toEqual({
      slug: slug('pepe'),
      kind: 'MENU',
      businessName: 'Bar Pepe',
      language: 'ES',
      currency: 'EUR',
      title: 'Carta',
      intro: '',
      address: '',
      openingNote: '',
      note: '',
      indexable: true,
      showBadge: true,
      content: {
        categories: [
          {
            key: expect.any(String),
            name: 'Entrantes',
            items: [
              {
                key: expect.any(String),
                name: 'Croquetas',
                description: 'De jamón',
                price: '8,50',
                allergens: ['gluten', 'milk'],
              },
              { key: expect.any(String), name: 'Ensalada', price: 'desde 7', soldOut: true },
            ],
          },
        ],
      },
    });
    await publicGet(slug('nada')).expect(404);
    await publicGet('AB').expect(404);
  });

  it('saves the whole content with the revision, and answers 409 to a stale one', async () => {
    const saved = await request(server())
      .put(`/v1/menus/${menuId}/content`)
      .set(owner.auth)
      .set(from())
      .send({
        revision: 1,
        content: { categories: [{ name: 'Postres', items: [{ name: 'Flan', price: '4' }] }] },
      })
      .expect(200);
    expect(saved.body.revision).toBe(2);
    expect(saved.body.content.categories[0].name).toBe('Postres');

    const stale = await request(server())
      .put(`/v1/menus/${menuId}/content`)
      .set(owner.auth)
      .set(from())
      .send({ revision: 1, content: { categories: [{ name: 'Otra', items: [] }] } })
      .expect(409);
    expect(stale.body.code).toBe('STALE_REVISION');
    await request(server())
      .put(`/v1/menus/${menuId}/content`)
      .set(owner.auth)
      .set(from())
      .send({
        revision: 2,
        content: { categories: [{ name: 'A', items: [{ name: 'http://x.com' }] }] },
      })
      .expect(422);
    await request(server())
      .put(`/v1/menus/${menuId}/content`)
      .set(other.auth)
      .set(from())
      .send({ revision: 2, content: { categories: [{ name: 'A', items: [] }] } })
      .expect(404);
  });

  it('takes more than 100 KB of content (up to 256 KB of body) and refuses over 200 KB with 422', async () => {
    const category = (c: number, items: number) => ({
      name: `Categoría ${c}`,
      items: Array.from({ length: items }, (_, i) => ({
        name: `Plato ${c}-${i} ${'n'.repeat(60)}`,
        description: 'd'.repeat(150),
        price: '12,50',
      })),
    });
    // About 130 KB: over the global 100 KB body limit, under the content cap.
    const big = { categories: Array.from({ length: 10 }, (_, c) => category(c, 60)) };
    expect(Buffer.byteLength(JSON.stringify(big))).toBeGreaterThan(110_000);
    const saved = await request(server())
      .put(`/v1/menus/${menuId}/content`)
      .set(owner.auth)
      .set(from())
      .send({ revision: 2, content: big })
      .expect(200);
    expect(saved.body.revision).toBe(3);

    // About 225 KB of body: under 256 KB, over the 200 KB cap of the content.
    const huge = { categories: Array.from({ length: 14 }, (_, c) => category(c, 60)) };
    const size = Buffer.byteLength(JSON.stringify(huge));
    expect(size).toBeGreaterThan(200 * 1024);
    expect(size).toBeLessThan(256 * 1024);
    const refused = await request(server())
      .put(`/v1/menus/${menuId}/content`)
      .set(owner.auth)
      .set(from())
      .send({ revision: 3, content: huge })
      .expect(422);
    expect(refused.body.errors[0]).toMatchObject({ path: 'content' });

    // Over 256 KB of body: 413.
    const enormous = { categories: Array.from({ length: 20 }, (_, c) => category(c, 60)) };
    await request(server())
      .put(`/v1/menus/${menuId}/content`)
      .set(owner.auth)
      .set(from())
      .send({ revision: 3, content: enormous, pad: 'x'.repeat(60_000) })
      .expect(413);

    // Back to something small for the next tests.
    await request(server())
      .put(`/v1/menus/${menuId}/content`)
      .set(owner.auth)
      .set(from())
      .send({ revision: 3, content: CONTENT })
      .expect(200);
  });

  it('hides and sells out one item by its key, with no revision, and answers { revision }', async () => {
    const before = (await get(owner, `/${menuId}`).expect(200)).body;
    const croquetas = before.content.categories[0].items[0];
    const quick = await request(server())
      .patch(`/v1/menus/${menuId}/items/${croquetas.key}`)
      .set(owner.auth)
      .set(from())
      .send({ hidden: true })
      .expect(200);
    expect(quick.body).toEqual({ revision: before.revision + 1 });
    const page = (await publicGet(slug('pepe')).expect(200)).body;
    expect(page.content.categories[0].items.map((i: { name: string }) => i.name)).toEqual([
      'Ensalada',
    ]);
    // The owner keeps it, hidden.
    const mine = (await get(owner, `/${menuId}`).expect(200)).body;
    expect(mine.content.categories[0].items[0]).toMatchObject({ name: 'Croquetas', hidden: true });

    await request(server())
      .patch(`/v1/menus/${menuId}/items/${croquetas.key}`)
      .set(owner.auth)
      .set(from())
      .send({ hidden: false, soldOut: true })
      .expect(200);
    await request(server())
      .patch(`/v1/menus/${menuId}/items/zzzzzzzz`)
      .set(owner.auth)
      .set(from())
      .send({ hidden: true })
      .expect(404);
    await request(server())
      .patch(`/v1/menus/${menuId}/items/${croquetas.key}`)
      .set(owner.auth)
      .set(from())
      .send({})
      .expect(400);
    await request(server())
      .patch(`/v1/menus/${menuId}/items/${croquetas.key}`)
      .set(other.auth)
      .set(from())
      .send({ hidden: true })
      .expect(404);
  });

  it('is listed in the sitemap while enabled and indexable, and drops out when paused or noindex', async () => {
    const entries = async () =>
      (
        (await request(server()).get('/v1/menus/sitemap').set(from()).expect(200)).body as {
          items: Array<{ slug: string; language: string; updatedAt: string }>;
        }
      ).items.filter((item) => item.slug === slug('pepe'));
    const listed = await request(server()).get('/v1/menus/sitemap').set(from()).expect(200);
    expect(listed.headers['cache-control']).toBe('public, max-age=3600');
    expect(await entries()).toEqual([
      { slug: slug('pepe'), language: 'ES', updatedAt: expect.any(String) },
    ]);

    let revision = (await get(owner, `/${menuId}`).expect(200)).body.revision;
    const set = async (fields: Record<string, unknown>) => {
      const updated = await patch(owner, menuId, { revision, ...fields }).expect(200);
      revision = updated.body.revision;
      return updated.body;
    };
    await set({ indexable: false });
    expect(await entries()).toEqual([]);
    expect((await publicGet(slug('pepe')).expect(200)).body.indexable).toBe(false);
    await set({ indexable: true, enabled: false });
    expect(await entries()).toEqual([]);
    await publicGet(slug('pepe')).expect(404);
    await set({ enabled: true });
    expect(await entries()).toHaveLength(1);
    await publicGet(slug('pepe')).expect(200);
  });

  it('turns a menu into a catalogue: no allergens any more', async () => {
    const current = (await get(owner, `/${menuId}`).expect(200)).body;
    const catalogue = await patch(owner, menuId, {
      revision: current.revision,
      kind: 'CATALOGUE',
    }).expect(200);
    expect(catalogue.body.kind).toBe('CATALOGUE');
    expect(JSON.stringify(catalogue.body.content)).not.toContain('allergens');
    await request(server())
      .put(`/v1/menus/${menuId}/content`)
      .set(owner.auth)
      .set(from())
      .send({
        revision: catalogue.body.revision,
        content: { categories: [{ name: 'A', items: [{ name: 'x', allergens: ['milk'] }] }] },
      })
      .expect(422);
    await patch(owner, menuId, { revision: catalogue.body.revision, kind: 'MENU' }).expect(200);
  });

  it('checks a slug as the person types', async () => {
    const check = async (value: string, id?: string) =>
      (
        await request(server())
          .get('/v1/menus/slug-check')
          .query({ slug: value, ...(id ? { menuId: id } : {}) })
          .set(other.auth)
          .set(from())
          .expect(200)
      ).body;
    expect(await check(slug('libre'))).toEqual({ available: true });
    expect(await check(slug('pepe'))).toEqual({ available: false, reason: 'taken' });
    expect(await check('editar')).toEqual({ available: false, reason: 'reserved' });
    expect(await check('Mal Slug!')).toEqual({ available: false, reason: 'invalid' });
    const own = await request(server())
      .get('/v1/menus/slug-check')
      .query({ slug: slug('pepe'), menuId })
      .set(owner.auth)
      .set(from())
      .expect(200);
    expect(own.body).toEqual({ available: true });
  });

  it('draws the QR as an SVG for the owner', async () => {
    const qr = await get(owner, `/${menuId}/qr.svg`)
      .buffer(true)
      .parse((res, done) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (text += chunk));
        res.on('end', () => done(null, text));
      })
      .expect(200);
    expect(qr.headers['content-type']).toContain('image/svg+xml');
    const svg = qr.body as string;
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('<title>Código QR de Bar Pepe</title>');
    await get(other, `/${menuId}/qr.svg`).expect(404);
  });

  it('changes the slug: the old link redirects (308), is reserved, and 3 changes a month are allowed', async () => {
    const renames = ['pepe-b', 'pepe-c', 'pepe-d'];
    let revision = (await get(owner, `/${menuId}`).expect(200)).body.revision;
    let previous = slug('pepe');
    for (const name of renames.slice(0, 2)) {
      const renamed = await patch(owner, menuId, { revision, slug: slug(name) }).expect(200);
      revision = renamed.body.revision;
      expect(renamed.body.slug).toBe(slug(name));
      expect(renamed.body.redirects.map((r: { slug: string }) => r.slug)).toContain(previous);
      previous = slug(name);
    }
    const old = await publicGet(slug('pepe')).expect(308);
    expect(old.headers.location).toBe(`/v1/menus/p/${slug('pepe-c')}`);
    expect(old.body).toEqual({ slug: slug('pepe-c') });
    await publicGet(slug('pepe-b')).expect(308);
    await publicGet(slug('pepe-c')).expect(200);

    // Another owner can't take an old slug while it redirects.
    await post(other, body('pepe')).expect(409);
    const redirect = await prisma.menuSlugRedirect.findUniqueOrThrow({
      where: { slug: slug('pepe') },
    });
    const days = (redirect.expiresAt.getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(179);
    expect(days).toBeLessThanOrEqual(180);

    // The third change is fine, the fourth in 30 days is not.
    const third = await patch(owner, menuId, { revision, slug: slug(renames[2]!) }).expect(200);
    const fourth = await patch(owner, menuId, {
      revision: third.body.revision,
      slug: slug('pepe-e'),
    }).expect(409);
    expect(fourth.body.code).toBe('SLUG_CHANGE_LIMIT');

    // Other edits still work after the changes.
    await patch(owner, menuId, { revision: third.body.revision, title: 'Nueva carta' }).expect(200);
  });

  it('lets another owner have an old slug once its redirect expired', async () => {
    await prisma.menuSlugRedirect.update({
      where: { slug: slug('pepe') },
      data: { expiresAt: new Date(Date.now() - DAY) },
    });
    await publicGet(slug('pepe')).expect(404);
    const taken = await post(other, body('pepe')).expect(201);
    expect(taken.body.slug).toBe(slug('pepe'));
    await request(server())
      .delete(`/v1/menus/${taken.body.id}`)
      .set(other.auth)
      .set(from())
      .expect(204);
  });

  it('counts the app and exports the menu with the account', async () => {
    const apps = await request(server()).get('/v1/auth/apps').set(owner.auth).expect(200);
    expect(apps.body.items).toContainEqual({ app: 'menu', count: 1 });
    const exported = await request(server()).get('/v1/auth/me/export').set(owner.auth).expect(200);
    expect(exported.body.menus).toHaveLength(1);
    expect(exported.body.menus[0]).toMatchObject({
      businessName: 'Bar Pepe',
      slug: slug('pepe-d'),
    });
    expect(exported.body.menus[0].content.categories.length).toBeGreaterThan(0);
  });

  describe('abuse', () => {
    const slugNow = () => slug('pepe-d');
    const report = (extra: Record<string, unknown> = {}) =>
      request(server())
        .post('/v1/menus/reports')
        .set(from())
        .send({
          slug: slugNow(),
          reason: 'SPAM',
          details: 'This page is spam, please look',
          ...extra,
        });

    it('takes a report from anyone: 204, stored, and the team inbox is emailed', async () => {
      await report({ email: 'Visitor@Example.com' }).expect(204);
      const stored = await prisma.menuReport.findFirstOrThrow({ where: { slug: slugNow() } });
      expect(stored).toMatchObject({
        businessName: 'Bar Pepe',
        reason: 'SPAM',
        email: 'visitor@example.com',
        status: 'OPEN',
      });
      expect(sent).toHaveLength(1);
      expect(sent[0]?.to).toBe('hello@codeqlick.com');
      expect(sent[0]?.subject).toContain(slugNow());
    });

    it('ignores the honeypot, and refuses bad reports', async () => {
      const before = await prisma.menuReport.count({ where: { slug: slugNow() } });
      await report({ website: 'http://spam.example' }).expect(204);
      expect(await prisma.menuReport.count({ where: { slug: slugNow() } })).toBe(before);
      expect(sent).toHaveLength(0);
      await report({ reason: 'NOPE' }).expect(400);
      await report({ details: 'short' }).expect(400);
      await request(server())
        .post('/v1/menus/reports')
        .set(from())
        .send({ slug: slug('no-existe'), reason: 'SPAM', details: 'This page is spam, please' })
        .expect(404);
    });

    it('limits reports to 3 a minute per address', async () => {
      const same = { 'X-Forwarded-For': `10.7.${tag.charCodeAt(0)}.1` };
      const once = () =>
        request(server())
          .post('/v1/menus/reports')
          .set(same)
          .send({ slug: slugNow(), reason: 'OTHER', details: 'Something is wrong here' });
      for (let i = 0; i < 3; i += 1) await once().expect(204);
      expect((await once().expect(429)).body.status).toBe(429);
    });

    it('is for admins: lists menus and reports, suspends, lifts, and closes', async () => {
      await request(server()).get('/v1/admin/menus').set(owner.auth).expect(403);

      const menus = await request(server())
        .get('/v1/admin/menus')
        .query({ q: `-${tag}` })
        .set(admin.auth)
        .expect(200);
      expect(menus.body).toMatchObject({ page: 1, pageSize: 20, total: 1 });
      expect(menus.body.items[0]).toEqual({
        id: menuId,
        slug: slugNow(),
        businessName: 'Bar Pepe',
        kind: 'MENU',
        owner: { id: owner.id, name: 'Menu owner', email: `e2e-menu-owner-${tag}@codeqlick.test` },
        enabled: true,
        indexable: true,
        suspendedAt: null,
        reports: 4,
        updatedAt: expect.any(String),
      });
      const byEmail = await request(server())
        .get('/v1/admin/menus')
        .query({ q: `e2e-menu-owner-${tag}`, suspended: 'false' })
        .set(admin.auth)
        .expect(200);
      expect(byEmail.body.total).toBe(1);

      const open = await request(server())
        .get('/v1/admin/menus/reports')
        .query({ status: 'OPEN', pageSize: 100 })
        .set(admin.auth)
        .expect(200);
      const mine = open.body.items.filter((r: { slug: string }) => r.slug === slugNow());
      expect(mine).toHaveLength(4);
      expect(mine[0]).toEqual({
        id: expect.any(String),
        slug: slugNow(),
        businessName: 'Bar Pepe',
        reason: expect.any(String),
        details: expect.any(String),
        email: null,
        status: 'OPEN',
        note: null,
        menu: { id: menuId, slug: slugNow(), suspended: false },
        createdAt: expect.any(String),
        closedAt: null,
      });

      await request(server())
        .post(`/v1/admin/menus/${menuId}/suspend`)
        .set(admin.auth)
        .send({ reason: 'abc' })
        .expect(400);
      await request(server())
        .post(`/v1/admin/menus/${menuId}/suspend`)
        .set(admin.auth)
        .send({ reason: 'It impersonates another business' })
        .expect(204);
      await request(server())
        .post(`/v1/admin/menus/${menuId}/suspend`)
        .set(admin.auth)
        .send({ reason: 'It impersonates another business' })
        .expect(409);

      // The owner is emailed in their language (Spanish).
      const email = sent.find((m) => m.to === `e2e-menu-owner-${tag}@codeqlick.test`);
      expect(email?.subject).toContain('suspendido');
      expect(email?.text).toContain('It impersonates another business');
      expect(email?.html).toContain('It impersonates another business');

      // The page answers like a missing one; the sitemap drops it; the owner sees the reason.
      const missing = await publicGet(slug('no-existe')).expect(404);
      const suspended = await publicGet(slugNow()).expect(404);
      expect(suspended.body.detail).toBe(missing.body.detail);
      const mineNow = (await get(owner, `/${menuId}`).expect(200)).body;
      expect(mineNow).toMatchObject({
        suspended: true,
        suspendedReason: 'It impersonates another business',
      });
      const sitemap = (await request(server()).get('/v1/menus/sitemap').set(from()).expect(200))
        .body;
      expect(sitemap.items.some((i: { slug: string }) => i.slug === slugNow())).toBe(false);

      // While suspended the owner can edit (the editor sends enabled: true with every save),
      // but not change its link, nor turn a paused menu back on.
      await patch(owner, menuId, { revision: mineNow.revision, slug: slug('otro-nombre') }).expect(
        403,
      );
      const edited = await patch(owner, menuId, {
        revision: mineNow.revision,
        note: 'Cerrado hoy',
        enabled: true,
      }).expect(200);
      expect(edited.body.note).toBe('Cerrado hoy');
      const paused = await patch(owner, menuId, {
        revision: edited.body.revision,
        enabled: false,
      }).expect(200);
      await patch(owner, menuId, { revision: paused.body.revision, enabled: true }).expect(403);
      await prisma.menu.update({ where: { id: menuId }, data: { enabled: true } });
      const flagged = await get(owner, '').expect(200);
      expect(flagged.body.items[0].suspended).toBe(true);

      const suspendedList = await request(server())
        .get('/v1/admin/menus')
        .query({ suspended: 'true', q: `-${tag}` })
        .set(admin.auth)
        .expect(200);
      expect(suspendedList.body.items[0].suspendedAt).toEqual(expect.any(String));

      // Lifting returns it as it was.
      await request(server())
        .delete(`/v1/admin/menus/${menuId}/suspension`)
        .set(admin.auth)
        .expect(204);
      await request(server())
        .delete(`/v1/admin/menus/${menuId}/suspension`)
        .set(admin.auth)
        .expect(409);
      await publicGet(slugNow()).expect(200);

      // Closing a report records the note, once.
      const reportId = mine[0].id as string;
      await request(server())
        .post(`/v1/admin/menus/reports/${reportId}/close`)
        .set(admin.auth)
        .send({ note: 'Looked fine' })
        .expect(204);
      await request(server())
        .post(`/v1/admin/menus/reports/${reportId}/close`)
        .set(admin.auth)
        .send({})
        .expect(404);
      const closed = await request(server())
        .get('/v1/admin/menus/reports')
        .query({ status: 'CLOSED', pageSize: 100 })
        .set(admin.auth)
        .expect(200);
      expect(closed.body.items.find((r: { id: string }) => r.id === reportId)).toMatchObject({
        status: 'CLOSED',
        note: 'Looked fine',
        closedAt: expect.any(String),
      });

      const log = await prisma.activityLog.findMany({
        where: { actorId: admin.id, action: { startsWith: 'menu.' } },
        orderBy: { createdAt: 'asc' },
      });
      expect(log.map((entry) => entry.action)).toEqual([
        'menu.suspend',
        'menu.unsuspend',
        'menu.report_close',
      ]);
    });

    it('lets an admin have a link with `codeqlick`', async () => {
      const created = await post(
        admin,
        body('codeqlick-demo', { slug: slug('codeqlick-demo') }),
      ).expect(201);
      expect(created.body.slug).toBe(slug('codeqlick-demo'));
    });
  });

  it('deletes content and redirects at once, and frees the link', async () => {
    await request(server()).delete(`/v1/menus/${menuId}`).set(other.auth).set(from()).expect(404);
    const id = menuId;
    await request(server()).delete(`/v1/menus/${id}`).set(owner.auth).set(from()).expect(204);
    await publicGet(slug('pepe-d')).expect(404);
    await publicGet(slug('pepe-c')).expect(404);
    expect(await prisma.menuSlugRedirect.count({ where: { menuId: id } })).toBe(0);
    // The reports stay, with the copy of the slug and name.
    const kept = await prisma.menuReport.findFirstOrThrow({ where: { slug: slug('pepe-d') } });
    expect(kept.menuId).toBeNull();
    expect(kept.businessName).toBe('Bar Pepe');
    const again = await post(owner, body('pepe-d')).expect(201);
    expect(again.body.revision).toBe(1);
  });

  it('deletes reports after 12 months and the redirects that expired', async () => {
    const old = await prisma.menuReport.create({
      data: {
        slug: slug('viejo'),
        businessName: 'Viejo',
        reason: 'OTHER',
        details: 'An old report of a gone menu',
        createdAt: new Date(Date.now() - 370 * DAY),
      },
    });
    const recent = await prisma.menuReport.create({
      data: {
        slug: slug('reciente'),
        businessName: 'Reciente',
        reason: 'OTHER',
        details: 'A recent report of a gone menu',
        createdAt: new Date(Date.now() - 300 * DAY),
      },
    });
    const result = await app.get(MenusMaintenanceService).run();
    expect(result.reports).toBeGreaterThanOrEqual(1);
    expect(await prisma.menuReport.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await prisma.menuReport.findUnique({ where: { id: recent.id } })).not.toBeNull();
  });
});
