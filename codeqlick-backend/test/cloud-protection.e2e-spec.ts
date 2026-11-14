import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { access, mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AppConfigService } from '../src/config/app-config.service.js';
import { Role } from '../src/generated/prisma/client.js';
import { CLOUD_TERMS_VERSION } from '../src/modules/cloud/cloud-plans.js';
import { CloudProjectsService } from '../src/modules/cloud/cloud-projects.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'cloud-protect-password-1';
const owner = { email: `e2e-cp-owner-${tag}@codeqlick.test`, password };
const adminUser = { email: `e2e-cp-admin-${tag}@codeqlick.test`, password };
const member = { email: `e2e-cp-member-${tag}@codeqlick.test`, password };
const outsider = { email: `e2e-cp-outsider-${tag}@codeqlick.test`, password };
const terms = { acceptTerms: true, termsVersion: CLOUD_TERMS_VERSION };
const KEY = 'ab'.repeat(32);
const SITE_PASSWORD = 'show-the-client-1';
const SHORT_ID = 'a1b2c3d4';

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

/** The access cookie's value from a response's `Set-Cookie`, or undefined. */
function accessCookie(res: {
  headers: Record<string, unknown>;
}): { value: string; header: string } | undefined {
  const raw = res.headers['set-cookie'] as string[] | string | undefined;
  const header = (Array.isArray(raw) ? raw : raw ? [raw] : []).find((c) =>
    c.startsWith('__Host-cq_access='),
  );
  if (!header) return undefined;
  return { value: header.split(';')[0]!.slice('__Host-cq_access='.length), header };
}

describe('Codeqlick Cloud password protection (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let root: string;
  let protectionKey: string | undefined;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'cq-cloud-protect-'));
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const config = app.get(AppConfigService);
    vi.spyOn(config, 'cloudHosting', 'get').mockReturnValue({ domain: 'cloud.test', root });
    vi.spyOn(config, 'cloudProtectionKey', 'get').mockImplementation(() => protectionKey);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const registeredAt = new Date();
    for (const [user, name] of [
      [owner, 'Ada'],
      [adminUser, 'Luis'],
      [member, 'Grace'],
      [outsider, 'Eve'],
    ] as const) {
      await prisma.user.create({
        data: { email: user.email, name, role: Role.CLIENT, passwordHash, registeredAt },
      });
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cloudTeam.deleteMany({ where: { slug: { startsWith: `pt-${tag}` } } });
      await prisma.cloudProject.deleteMany({ where: { slug: { startsWith: `pp-${tag}` } } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('protects previews and production, with cookies per address and single-use tickets', async () => {
    const server = app.getHttpServer();
    const bearer = async (user: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`,
    });
    const ownerAuth = await bearer(owner);
    const adminAuth = await bearer(adminUser);
    const memberAuth = await bearer(member);
    const outsiderAuth = await bearer(outsider);
    const teamSlug = `pt-${tag}`;
    const slug = `pp-${tag}`;

    // ── A team with an admin and a member, and a project with one deployment ────────────────
    const team = await request(server)
      .post('/v1/cloud/teams')
      .set(ownerAuth)
      .send({ name: 'Protect', slug: teamSlug, ...terms })
      .expect(201);
    await request(server)
      .post('/v1/cloud/teams')
      .set(outsiderAuth)
      .send({ name: 'Other', slug: `${teamSlug}-x`, ...terms })
      .expect(201);
    for (const [user, role] of [
      [adminUser, 'ADMIN'],
      [member, 'MEMBER'],
    ] as const) {
      const row = await prisma.user.findUniqueOrThrow({ where: { email: user.email } });
      await prisma.cloudMember.create({
        data: {
          teamId: team.body.id as string,
          userId: row.id,
          role,
          termsVersion: CLOUD_TERMS_VERSION,
          termsAcceptedAt: new Date(),
        },
      });
    }
    const project = await request(server)
      .post(`/v1/cloud/teams/${teamSlug}/projects`)
      .set(ownerAuth)
      .send({ name: 'Client <Docs>', slug })
      .expect(201);
    const projectId = project.body.id as string;
    expect(project.body.protection).toBe('OFF');
    await prisma.cloudDeployment.create({
      data: {
        projectId,
        shortId: SHORT_ID,
        target: 'PREVIEW',
        sizeBytes: 10n,
        fileCount: 1,
      },
    });
    const base = `/v1/cloud/projects/${projectId}/protection`;
    const previewHost = `${slug}--${SHORT_ID}.cloud.test`;
    const productionHost = `${slug}.cloud.test`;
    const marker = (kind: 'previews' | 'production') => join(root, 'protect', `${slug}.${kind}`);
    const nginx = (host: string, kind: 'previews' | 'production', access?: string) => ({
      'X-Cq-Protection-Key': KEY,
      'X-Cq-Host': host,
      'X-Cq-Project': slug,
      'X-Cq-Kind': kind,
      ...(access === undefined ? {} : { 'X-Cq-Access': access }),
    });
    const check = (host: string, kind: 'previews' | 'production', access?: string) =>
      request(server)
        .get('/v1/cloud/protection/check')
        .set(nginx(host, kind, access));

    // ── Reading and changing the setting ───────────────────────────────────────────────────
    expect((await request(server).get(base).set(memberAuth).expect(200)).body).toEqual({
      mode: 'OFF',
      days: 7,
      hasPassword: false,
      updatedAt: null,
    });
    await request(server).get(base).set(outsiderAuth).expect(404);
    await request(server)
      .put(base)
      .set(memberAuth)
      .send({ mode: 'PREVIEWS', password: SITE_PASSWORD })
      .expect(403);
    await request(server)
      .put(base)
      .set(outsiderAuth)
      .send({ mode: 'PREVIEWS', password: SITE_PASSWORD })
      .expect(404);

    // Without CLOUD_PROTECTION_KEY it can't be turned on, and Nginx's routes answer 503.
    protectionKey = undefined;
    await request(server)
      .put(base)
      .set(adminAuth)
      .send({ mode: 'PREVIEWS', password: SITE_PASSWORD })
      .expect(503);
    await check(previewHost, 'previews').expect(503);
    protectionKey = KEY;

    await request(server).put(base).set(adminAuth).send({ mode: 'PREVIEWS' }).expect(400);
    await request(server)
      .put(base)
      .set(adminAuth)
      .send({ mode: 'PREVIEWS', password: 'short' })
      .expect(400);
    await request(server)
      .put(base)
      .set(adminAuth)
      .send({ mode: 'PREVIEWS', password: SITE_PASSWORD, days: 3 })
      .expect(400);
    await request(server).put(base).set(adminAuth).send({ mode: 'SOME' }).expect(400);

    const on = await request(server)
      .put(base)
      .set(adminAuth)
      .send({ mode: 'PREVIEWS', password: SITE_PASSWORD, days: 1 })
      .expect(200);
    expect(on.body).toMatchObject({ mode: 'PREVIEWS', days: 1, hasPassword: true });
    expect(on.body.updatedAt).toEqual(expect.any(String));
    expect(JSON.stringify(on.body)).not.toContain(SITE_PASSWORD);
    expect(await exists(marker('previews'))).toBe(true);
    expect(await exists(marker('production'))).toBe(false);
    expect(
      (await request(server).get(`/v1/cloud/projects/${projectId}`).set(memberAuth).expect(200))
        .body.protection,
    ).toBe('PREVIEWS');
    const event = await prisma.cloudEvent.findFirst({
      where: { teamId: team.body.id as string, action: 'project.protection_changed' },
    });
    expect(event).toMatchObject({
      targetLabel: slug,
      details: { mode: 'PREVIEWS', days: 1, passwordChanged: true },
    });
    const stored = await prisma.cloudProject.findUniqueOrThrow({ where: { id: projectId } });
    expect(stored.protectionHash).toMatch(/^\$argon2id\$/);

    // ── Nginx's check ──────────────────────────────────────────────────────────────────────
    await request(server)
      .get('/v1/cloud/protection/check')
      .set({ 'X-Cq-Host': previewHost, 'X-Cq-Project': slug, 'X-Cq-Kind': 'previews' })
      .expect(403);
    await check(previewHost, 'previews').set('X-Cq-Protection-Key', 'cd'.repeat(32)).expect(403);
    await check(previewHost, 'previews').expect(401);
    await check(previewHost, 'previews', 'v1.garbage').expect(401);
    // Production isn't protected by PREVIEWS; an unknown project goes through too.
    await check(productionHost, 'production').expect(204);
    await request(server)
      .get('/v1/cloud/protection/check')
      .set({ ...nginx(previewHost, 'previews'), 'X-Cq-Project': `nope-${tag}` })
      .expect(204);

    // ── The visitor's page ─────────────────────────────────────────────────────────────────
    const page = await request(server)
      .get('/v1/cloud/protection/password?next=/docs/intro?tab=2')
      .set(nginx(previewHost, 'previews'))
      .expect(200);
    expect(page.headers['content-type']).toMatch(/^text\/html/);
    expect(page.headers['content-security-policy']).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    expect(page.headers['x-robots-tag']).toBe('noindex');
    expect(page.headers['cache-control']).toBe('no-store');
    expect(page.text).toContain('<html lang="en">');
    expect(page.text).toContain('Client &lt;Docs&gt;');
    expect(page.text).toContain('name="next" value="/docs/intro?tab=2"');
    const spanish = await request(server)
      .get('/v1/cloud/protection/password?next=//evil.test/')
      .set(nginx(previewHost, 'previews'))
      .set('Accept-Language', 'es-ES,es;q=0.9,en;q=0.5')
      .expect(200);
    expect(spanish.text).toContain('<html lang="es">');
    expect(spanish.text).toContain('name="next" value="/"');

    const wrong = await request(server)
      .post('/v1/cloud/protection/password')
      .set(nginx(previewHost, 'previews'))
      .type('form')
      .send({ password: 'not-the-password', next: '/docs' })
      .expect(401);
    expect(wrong.text).toContain('Wrong password');
    expect(accessCookie(wrong)).toBeUndefined();

    const right = await request(server)
      .post('/v1/cloud/protection/password')
      .set(nginx(previewHost, 'previews'))
      .type('form')
      .send({ password: SITE_PASSWORD, next: '/docs?x=1' })
      .expect(303);
    expect(right.headers.location).toBe('/docs?x=1');
    const cookie = accessCookie(right);
    expect(cookie?.value).toMatch(new RegExp(`^v1\\.${projectId}\\.\\d+\\.\\d+\\.[\\w-]{43}$`));
    expect(cookie?.header).toMatch(/Max-Age=86400/);
    expect(cookie?.header).toMatch(/Path=\//);
    expect(cookie?.header).toMatch(/HttpOnly/);
    expect(cookie?.header).toMatch(/Secure/);
    expect(cookie?.header).toMatch(/SameSite=Lax/);
    expect(cookie?.header).not.toMatch(/Domain=/i);

    await check(previewHost, 'previews', cookie!.value).expect(204);
    // Only on the address it was set on.
    await check(`${slug}--ffffffff.cloud.test`, 'previews', cookie!.value).expect(401);
    // Already in: the page sends the visitor on.
    const already = await request(server)
      .get('/v1/cloud/protection/password?next=/docs')
      .set(nginx(previewHost, 'previews', cookie!.value))
      .expect(303);
    expect(already.headers.location).toBe('/docs');

    // A protected redirect never leaves the address.
    const offsite = await request(server)
      .post('/v1/cloud/protection/password')
      .set(nginx(previewHost, 'previews'))
      .set('X-Forwarded-For', '198.51.100.20')
      .type('form')
      .send({ password: SITE_PASSWORD, next: '//evil.test/' })
      .expect(303);
    expect(offsite.headers.location).toBe('/');

    // Changing the days keeps access already given.
    await request(server).put(base).set(adminAuth).send({ mode: 'PREVIEWS', days: 30 }).expect(200);
    await check(previewHost, 'previews', cookie!.value).expect(204);

    // ── A new version (the mode changed) ends every access ────────────────────────────────
    const all = await request(server).put(base).set(adminAuth).send({ mode: 'ALL' }).expect(200);
    expect(all.body).toMatchObject({ mode: 'ALL', days: 30, hasPassword: true });
    expect(await exists(marker('previews'))).toBe(true);
    expect(await exists(marker('production'))).toBe(true);
    await check(previewHost, 'previews', cookie!.value).expect(401);
    await check(productionHost, 'production').expect(401);

    // ── Members' single-use tickets ────────────────────────────────────────────────────────
    await request(server)
      .get(`${base}/ticket`)
      .query({ host: 'example.com' })
      .set(memberAuth)
      .expect(400);
    await request(server)
      .get(`${base}/ticket`)
      .query({ host: `${slug}--00000000.cloud.test` })
      .set(memberAuth)
      .expect(400);
    await request(server)
      .get(`${base}/ticket`)
      .query({ host: previewHost })
      .set(outsiderAuth)
      .expect(404);
    const ticket = await request(server)
      .get(`${base}/ticket`)
      .query({ host: previewHost })
      .set(memberAuth)
      .expect(200);
    expect(ticket.body.expiresIn).toBe(60);
    const url = new URL(ticket.body.url as string);
    expect(url.origin).toBe(`https://${previewHost}`);
    expect(url.pathname).toBe('/__codeqlick/enter');
    const enterPath = `/v1/cloud/protection/enter${url.search}`;

    // On another address, the ticket doesn't work (and isn't used up).
    const foreign = await request(server)
      .get(enterPath)
      .set(nginx(productionHost, 'production'))
      .expect(401);
    expect(foreign.text).toContain('This link has expired');

    const entered = await request(server)
      .get(enterPath)
      .set(nginx(previewHost, 'previews'))
      .expect(303);
    expect(entered.headers.location).toBe('/');
    expect(entered.headers['referrer-policy']).toBe('no-referrer');
    const memberCookie = accessCookie(entered);
    expect(memberCookie?.header).toMatch(/Max-Age=2592000/);
    await check(previewHost, 'previews', memberCookie!.value).expect(204);

    const again = await request(server)
      .get(enterPath)
      .set(nginx(previewHost, 'previews'))
      .expect(401);
    expect(again.text).toContain('This link has expired');
    expect(accessCookie(again)).toBeUndefined();

    // ── 5 tries a minute per IP and project ───────────────────────────────────────────────
    const attempt = (ip: string, secret: string) =>
      request(server)
        .post('/v1/cloud/protection/password')
        .set(nginx(productionHost, 'production'))
        .set('X-Forwarded-For', ip)
        .type('form')
        .send({ password: secret, next: '/' });
    for (let i = 0; i < 5; i += 1) await attempt('198.51.100.9', 'wrong-password-x').expect(401);
    const waited = await attempt('198.51.100.9', SITE_PASSWORD).expect(429);
    expect(waited.text).toContain('Wait a minute');
    await attempt('198.51.100.10', SITE_PASSWORD).expect(303);

    // ── Markers are put right against the database ─────────────────────────────────────────
    await rm(marker('production'));
    await mkdir(join(root, 'protect'), { recursive: true });
    await writeFile(join(root, 'protect', `stale-${tag}.previews`), '');
    // A marker written after the database was read is left for the next check; an old one goes.
    await writeFile(join(root, 'protect', `fresh-${tag}.previews`), '');
    const hourAgo = new Date(Date.now() - 3_600_000);
    await utimes(join(root, 'protect', `stale-${tag}.previews`), hourAgo, hourAgo);
    await app.get(CloudProjectsService).reconcileProtection();
    expect(await exists(marker('production'))).toBe(true);
    expect(await exists(join(root, 'protect', `stale-${tag}.previews`))).toBe(false);
    expect(await exists(join(root, 'protect', `fresh-${tag}.previews`))).toBe(true);

    // ── OFF lets everything through and forgets the password ──────────────────────────────
    const off = await request(server).put(base).set(adminAuth).send({ mode: 'OFF' }).expect(200);
    expect(off.body).toMatchObject({ mode: 'OFF', hasPassword: false });
    expect(await exists(marker('previews'))).toBe(false);
    expect(await exists(marker('production'))).toBe(false);
    await check(previewHost, 'previews').expect(204);
    await check(productionHost, 'production').expect(204);
    const plain = await request(server)
      .get(`${base}/ticket`)
      .query({ host: productionHost })
      .set(memberAuth)
      .expect(200);
    expect(plain.body).toEqual({ url: `https://${productionHost}/`, expiresIn: 60 });
    // Turning it on again needs a password again.
    await request(server).put(base).set(adminAuth).send({ mode: 'ALL' }).expect(400);

    // ── Deleting the project removes its markers ──────────────────────────────────────────
    await request(server)
      .put(base)
      .set(ownerAuth)
      .send({ mode: 'ALL', password: SITE_PASSWORD })
      .expect(200);
    expect(await exists(marker('production'))).toBe(true);
    await request(server).delete(`/v1/cloud/projects/${projectId}`).set(adminAuth).expect(204);
    expect(await exists(marker('previews'))).toBe(false);
    expect(await exists(marker('production'))).toBe(false);
  });
});
