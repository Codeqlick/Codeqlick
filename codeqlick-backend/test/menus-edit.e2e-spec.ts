import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Role } from '../src/generated/prisma/client.js';
import { MenusRepository } from '../src/modules/menus/menus.repository.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const tag = randomUUID().slice(0, 8);
const DAY = 86_400_000;
const slug = (name: string) => `${name}-${tag}`;

const category = (c: number, items: number) => ({
  name: `Categoría ${c}`,
  items: Array.from({ length: items }, (_, i) => ({
    name: `Plato ${c}-${i} ${'n'.repeat(60)}`,
    description: 'd'.repeat(150),
    price: '12,50',
  })),
});

describe('Menu: one save for settings and content, slug changes, export (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let auth: { Authorization: string };
  let userId = '';
  let menuId = '';
  let ip = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const email = `e2e-menu-edit-${tag}@codeqlick.test`;
    const user = await prisma.user.create({
      data: { email, name: 'Menu edit', role: Role.CLIENT, passwordHash: 'x' },
    });
    userId = user.id;
    const token = await app
      .get(JwtService)
      .signAsync({ sub: user.id, email, name: user.name, role: Role.CLIENT });
    auth = { Authorization: `Bearer ${token}` };
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@codeqlick.test` } } });
    }
    await app?.close();
  });

  const server = () => app.getHttpServer();
  const from = () => ({ 'X-Forwarded-For': `10.6.${tag.charCodeAt(0)}.${++ip}` });
  const read = async () =>
    (await request(server()).get(`/v1/menus/${menuId}`).set(auth).set(from()).expect(200)).body;
  const patch = (payload: Record<string, unknown>) =>
    request(server()).patch(`/v1/menus/${menuId}`).set(auth).set(from()).send(payload);

  it('creates the menu to edit', async () => {
    const created = await request(server())
      .post('/v1/menus')
      .set(auth)
      .set(from())
      .send({ slug: slug('base'), kind: 'MENU', businessName: 'Bar Base', language: 'ES' })
      .expect(201);
    menuId = created.body.id;
    expect(created.body.revision).toBe(1);
  });

  it('saves settings and content in one PATCH with one revision, also over 100 KB of body', async () => {
    // About 160 KB: over the global 100 KB body limit, under the 256 KB one.
    const big = { categories: Array.from({ length: 10 }, (_, c) => category(c, 60)) };
    expect(Buffer.byteLength(JSON.stringify(big))).toBeGreaterThan(110_000);
    const saved = await patch({
      revision: 1,
      title: 'Carta grande',
      note: 'Cerramos lunes',
      content: big,
    }).expect(200);
    expect(saved.body).toMatchObject({
      title: 'Carta grande',
      note: 'Cerramos lunes',
      revision: 2,
    });
    expect(saved.body.content.categories).toHaveLength(10);
    expect(saved.body.content.categories[0].key).toMatch(/^[a-z0-9]{8}$/);

    // Settings only still work, and leave the content alone.
    const settingsOnly = await patch({ revision: 2, title: 'Carta' }).expect(200);
    expect(settingsOnly.body.revision).toBe(3);
    expect(settingsOnly.body.content.categories).toHaveLength(10);

    // Over 256 KB of body: 413.
    const enormous = { categories: Array.from({ length: 20 }, (_, c) => category(c, 60)) };
    await patch({ revision: 3, content: enormous }).expect(413);
  });

  it('applies nothing when the content is invalid, even if the slug change is fine (422)', async () => {
    const before = await read();
    const refused = await patch({
      revision: before.revision,
      slug: slug('nuevo'),
      title: 'No se guarda',
      content: { categories: [{ name: 'A', items: [{ name: 'Visita http://x.com' }] }] },
    }).expect(422);
    expect(refused.body.errors).toEqual([
      {
        path: 'content.categories.0.items.0.name',
        message: 'Links are not allowed in a menu',
      },
    ]);
    const after = await read();
    expect(after.slug).toBe(slug('base'));
    expect(after.title).toBe('Carta');
    expect(after.revision).toBe(before.revision);
    expect(after.redirects).toEqual([]);
    expect(
      (await prisma.menu.findUniqueOrThrow({ where: { id: menuId } })).slugChangedAt,
    ).toHaveLength(0);
  });

  it('answers 409 for a stale revision and applies nothing', async () => {
    const before = await read();
    await patch({
      revision: before.revision - 1,
      title: 'Viejo',
      content: { categories: [{ name: 'A', items: [] }] },
    }).expect(409);
    expect((await read()).revision).toBe(before.revision);
  });

  it('lets a suspended menu save settings and content with enabled: true', async () => {
    await prisma.menu.update({
      where: { id: menuId },
      data: { suspendedAt: new Date(), suspendedReason: 'Spam page' },
    });
    const before = await read();
    const saved = await patch({
      revision: before.revision,
      title: 'Sigue editable',
      enabled: true,
      content: { categories: [{ name: 'Postres', items: [{ name: 'Flan' }] }] },
    }).expect(200);
    expect(saved.body).toMatchObject({ suspended: true, enabled: true, title: 'Sigue editable' });
    // Pausing and then turning on again is the part that stays refused.
    const paused = await patch({ revision: saved.body.revision, enabled: false }).expect(200);
    await patch({ revision: paused.body.revision, enabled: true }).expect(403);
    await patch({ revision: paused.body.revision, slug: slug('otro') }).expect(403);

    // The export keeps the reason.
    const exported = await request(server()).get('/v1/auth/me/export').set(auth).expect(200);
    expect(exported.body.menus[0]).toMatchObject({ suspendedReason: 'Spam page' });

    await prisma.menu.update({
      where: { id: menuId },
      data: { suspendedAt: null, suspendedReason: null, enabled: true },
    });
  });

  it('counts slug changes from the menu itself, taking back an old slug included', async () => {
    let revision = (await read()).revision;
    const rename = async (name: string) => {
      const renamed = await patch({ revision, slug: slug(name) }).expect(200);
      revision = renamed.body.revision;
      return renamed.body;
    };
    await rename('uno'); // base -> uno (change 1)
    await rename('base'); // uno -> base: takes its own old slug back (change 2)
    const third = await rename('uno'); // base -> uno (change 3)

    // Taking back a slug deletes its redirect row; leaving one re-creates it with a full period.
    const rows = await prisma.menuSlugRedirect.findMany({ where: { menuId } });
    expect(rows.map((row) => row.slug).toSorted()).toEqual([slug('base')]);
    const days = ((rows[0]?.expiresAt.getTime() ?? 0) - Date.now()) / DAY;
    expect(days).toBeGreaterThan(179);
    expect(third.redirects.map((r: { slug: string }) => r.slug)).toEqual([slug('base')]);

    const record = (await prisma.menu.findUniqueOrThrow({ where: { id: menuId } })).slugChangedAt;
    expect(record).toHaveLength(3);

    // Deleting redirect rows doesn't give changes back: the limit is the menu's own record.
    await prisma.menuSlugRedirect.deleteMany({ where: { menuId } });
    const fourth = await patch({ revision, slug: slug('dos') }).expect(409);
    expect(fourth.body.code).toBe('SLUG_CHANGE_LIMIT');

    // Changes older than 30 days stop counting, and the record is trimmed.
    await prisma.menu.update({
      where: { id: menuId },
      data: { slugChangedAt: [new Date(Date.now() - 40 * DAY), ...record.slice(1)] },
    });
    const allowed = await patch({ revision, slug: slug('dos') }).expect(200);
    expect(allowed.body.slug).toBe(slug('dos'));
    const trimmed = (await prisma.menu.findUniqueOrThrow({ where: { id: menuId } })).slugChangedAt;
    expect(trimmed).toHaveLength(3);
    expect(trimmed.every((at) => Date.now() - at.getTime() < 30 * DAY)).toBe(true);
  });

  it('exports the menu with its reason and the redirects still working', async () => {
    const exported = await request(server()).get('/v1/auth/me/export').set(auth).expect(200);
    const [menu] = exported.body.menus;
    expect(menu).toMatchObject({ slug: slug('dos'), suspendedReason: null });
    expect(menu.redirects).toEqual([{ slug: slug('uno'), expiresAt: expect.any(String) }]);
    expect(userId).not.toBe('');
  });

  it('rolls back the redirect changes of a save that loses the revision race', async () => {
    // The service refuses a stale revision early; this is the race it cannot see: the repository
    // must leave the redirects alone when its guarded update matches nothing.
    const before = await prisma.menu.findUniqueOrThrow({ where: { id: menuId } });
    const rowsBefore = await prisma.menuSlugRedirect.findMany({ where: { menuId } });
    expect(rowsBefore.map((row) => row.slug)).toEqual([slug('uno')]);
    const result = await app.get(MenusRepository).update(
      menuId,
      before.revision - 1,
      { slug: slug('uno') },
      {
        claim: slug('uno'),
        leave: { slug: before.slug, expiresAt: new Date(Date.now() + 180 * DAY) },
      },
      new Date(),
    );
    expect(result).toBeNull();
    const after = await prisma.menu.findUniqueOrThrow({ where: { id: menuId } });
    expect(after.slug).toBe(before.slug);
    expect(after.revision).toBe(before.revision);
    const rowsAfter = await prisma.menuSlugRedirect.findMany({ where: { menuId } });
    expect(rowsAfter).toEqual(rowsBefore);
  });
});
