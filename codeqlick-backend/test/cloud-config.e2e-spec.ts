import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { access, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { create } from 'tar';
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
const password = 'cloud-config-password-1';
const owner = { email: `e2e-cc-owner-${tag}@codeqlick.test`, password };
const member = { email: `e2e-cc-member-${tag}@codeqlick.test`, password };
const outsider = { email: `e2e-cc-outsider-${tag}@codeqlick.test`, password };
const terms = { acceptTerms: true, termsVersion: CLOUD_TERMS_VERSION };
const KEY = 'ab'.repeat(32);
const SITE_PASSWORD = 'show-the-client-1';

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

/** A built folder packed as the CLI does: tar.gz of its contents (dotfiles included). */
async function bundle(files: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), 'cq-site-'));
  for (const [path, body] of Object.entries(files)) {
    await mkdir(join(dir, path, '..'), { recursive: true });
    await writeFile(join(dir, path), body);
  }
  const file = join(tmpdir(), `cq-bundle-${randomUUID()}.tar.gz`);
  await create({ gzip: true, file, cwd: dir, portable: true }, ['.']);
  await rm(dir, { recursive: true, force: true });
  return file;
}

const SITE = {
  'index.html': '<h1>home</h1>',
  'about.html': '<h1>about</h1>',
  'app/index.html': '<h1>app</h1>',
  'blog/index.html': '<h1>blog</h1>',
};

const RULES = {
  $schema: 'https://api.codeqlick.com/v1/cloud/schema/codeqlick.json',
  team: 'ignored',
  project: 'ignored',
  dir: 'dist',
  redirects: [{ source: '/old/:slug', destination: '/blog/:slug', status: 301 }],
  rewrites: [{ source: '/app/*', destination: '/app/index.html' }],
  headers: [{ source: '/*', headers: { 'content-security-policy': "default-src 'self'" } }],
};

describe('Codeqlick Cloud codeqlick.json rules (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'cq-cloud-config-'));
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const config = app.get(AppConfigService);
    vi.spyOn(config, 'cloudHosting', 'get').mockReturnValue({ domain: 'cloud.test', root });
    vi.spyOn(config, 'cloudProtectionKey', 'get').mockReturnValue(KEY);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const registeredAt = new Date();
    for (const [user, name] of [
      [owner, 'Ada'],
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
      await prisma.cloudTeam.deleteMany({ where: { slug: { startsWith: `cct-${tag}` } } });
      await prisma.cloudProject.deleteMany({ where: { slug: { startsWith: `ccp-${tag}` } } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('stores, checks and applies a deployment’s rules', async () => {
    const server = app.getHttpServer();
    const bearer = async (user: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`,
    });
    const ownerAuth = await bearer(owner);
    const memberAuth = await bearer(member);
    const outsiderAuth = await bearer(outsider);
    const teamSlug = `cct-${tag}`;
    const slug = `ccp-${tag}`;

    const team = await request(server)
      .post('/v1/cloud/teams')
      .set(ownerAuth)
      .send({ name: 'Rules', slug: teamSlug, ...terms })
      .expect(201);
    await request(server)
      .post('/v1/cloud/teams')
      .set(outsiderAuth)
      .send({ name: 'Other', slug: `${teamSlug}-x`, ...terms })
      .expect(201);
    const memberRow = await prisma.user.findUniqueOrThrow({ where: { email: member.email } });
    await prisma.cloudMember.create({
      data: {
        teamId: team.body.id as string,
        userId: memberRow.id,
        role: 'MEMBER',
        termsVersion: CLOUD_TERMS_VERSION,
        termsAcceptedAt: new Date(),
      },
    });
    const project = await request(server)
      .post(`/v1/cloud/teams/${teamSlug}/projects`)
      .set(ownerAuth)
      .send({ name: 'Rules site', slug })
      .expect(201);
    const projectId = project.body.id as string;
    const deployments = `/v1/cloud/projects/${projectId}/deployments`;
    const deploy = async (files: Record<string, string>, config?: string) => {
      const call = request(server)
        .post(deployments)
        .set(ownerAuth)
        .field('target', 'preview')
        .attach('bundle', await bundle(files));
      return config === undefined ? call : call.field('config', config);
    };
    const folders = async () => (await readdir(join(root, 'deployments'))).sort();

    // ── Invalid files are refused, naming the path, and nothing is kept ────────────────────
    const badStatus = await deploy(
      SITE,
      JSON.stringify({
        redirects: [
          { source: '/a', destination: '/b' },
          { source: '/c', destination: '/d' },
          { source: '/e', destination: '/f' },
          { source: '/g', destination: '/h', status: 404 },
        ],
      }),
    );
    expect(badStatus.status).toBe(400);
    expect(badStatus.body.detail).toBe('redirects[3].status: must be 301, 302, 307 or 308');
    expect(badStatus.body.errors).toEqual([
      { path: 'redirects[3].status', message: 'must be 301, 302, 307 or 308' },
    ]);
    const hsts = await deploy(
      SITE,
      JSON.stringify({
        headers: [{ source: '/*', headers: { 'Strict-Transport-Security': 'max-age=0' } }],
      }),
    );
    expect(hsts.status).toBe(400);
    expect(hsts.body.errors[0]).toMatchObject({
      path: 'headers[0].headers.Strict-Transport-Security',
      message: expect.stringContaining('not an allowed header'),
    });
    const json = await deploy(SITE, '{\n  "redirects": [\n  oops\n}');
    expect(json.status).toBe(400);
    expect(json.body.errors[0]).toMatchObject({ path: 'codeqlick.json' });
    expect(json.body.errors[0].message).toMatch(/^invalid JSON/);
    const typo = await deploy(SITE, JSON.stringify({ redirect: [] }));
    expect(typo.status).toBe(400);
    expect(typo.body.errors).toEqual([{ path: 'redirect', message: 'not a known key' }]);
    const many = await deploy(
      SITE,
      JSON.stringify({
        redirects: Array.from({ length: 101 }, (_, index) => ({
          source: `/old/${index}`,
          destination: `/new/${index}`,
        })),
      }),
    );
    expect(many.status).toBe(400);
    expect(many.body.detail).toBe('redirects: 101 rules, the free plan allows 100');
    // The bundle's own file is checked the same way, and `.cq-` names are Cloud's.
    const inBundle = await deploy({ ...SITE, 'codeqlick.json': '{"rewrites":[{"source":"/a"}]}' });
    expect(inBundle.status).toBe(400);
    expect(inBundle.body.errors[0].path).toBe('rewrites[0].destination');
    const marker = await deploy({ ...SITE, '.cq-rules': '' });
    expect(marker.status).toBe(400);
    expect(marker.body.detail).toContain('.cq-');
    expect(await prisma.cloudDeployment.count({ where: { projectId } })).toBe(0);
    expect(await folders()).toEqual([]);

    // ── A valid file in the `config` field: stored, summarised, marked ────────────────────
    const created = await deploy(SITE, JSON.stringify(RULES));
    expect(created.status).toBe(201);
    expect(created.body.rules).toEqual({
      redirects: 1,
      rewrites: 1,
      headers: 1,
      cleanUrls: true,
      trailingSlash: null,
    });
    const id = created.body.id as string;
    const shortId = created.body.shortId as string;
    const stored = {
      redirects: [{ source: '/old/:slug', destination: '/blog/:slug', status: 301 }],
      rewrites: [{ source: '/app/*', destination: '/app/index.html' }],
      headers: [{ source: '/*', headers: { 'Content-Security-Policy': "default-src 'self'" } }],
    };
    const row = await prisma.cloudDeployment.findUniqueOrThrow({ where: { id } });
    expect(row.config).toEqual(stored);
    expect(await exists(join(root, 'deployments', id, '.cq-rules'))).toBe(true);
    expect(await exists(join(root, 'deployments', id, 'codeqlick.json'))).toBe(false);
    const one = await request(server).get(`${deployments}/${id}`).set(memberAuth).expect(200);
    expect(one.body.rules).toEqual({ ...created.body.rules, config: stored });
    const list = await request(server).get(deployments).set(memberAuth).expect(200);
    expect(list.body.items[0].rules).toEqual(created.body.rules);
    expect(list.body.items[0].rules.config).toBeUndefined();

    // ── The bundle's own codeqlick.json is used when `config` isn't sent, and removed ─────
    const fromBundle = await deploy({ ...SITE, 'codeqlick.json': JSON.stringify(RULES) });
    expect(fromBundle.status).toBe(201);
    expect(fromBundle.body.rules).toMatchObject({ redirects: 1, rewrites: 1, headers: 1 });
    expect(await exists(join(root, 'deployments', fromBundle.body.id, 'codeqlick.json'))).toBe(
      false,
    );
    // `config` wins over the bundle's file.
    const both = await deploy(
      { ...SITE, 'codeqlick.json': JSON.stringify(RULES) },
      JSON.stringify({ cleanUrls: false }),
    );
    expect(both.status).toBe(201);
    expect(both.body.rules).toEqual({
      redirects: 0,
      rewrites: 0,
      headers: 0,
      cleanUrls: false,
      trailingSlash: null,
    });
    expect(await exists(join(root, 'deployments', both.body.id, '.cq-rules'))).toBe(true);

    // ── Without rules: nothing stored, no marker, and the link keys alone are no rules ────
    const plain = await deploy({
      ...SITE,
      'codeqlick.json': JSON.stringify({ team: 'a', project: 'b', dir: 'dist' }),
    });
    expect(plain.status).toBe(201);
    expect(plain.body.rules).toBeNull();
    const plainId = plain.body.id as string;
    expect(
      (await prisma.cloudDeployment.findUniqueOrThrow({ where: { id: plainId } })).config,
    ).toBe(null);
    expect(await exists(join(root, 'deployments', plainId, '.cq-rules'))).toBe(false);
    expect(await exists(join(root, 'deployments', plainId, 'codeqlick.json'))).toBe(false);
    // Only clean URLs on (the default) is stored but needs no marker.
    const harmless = await deploy(SITE, JSON.stringify({ cleanUrls: true }));
    expect(harmless.body.rules).toMatchObject({ redirects: 0, cleanUrls: true });
    expect(await exists(join(root, 'deployments', harmless.body.id as string, '.cq-rules'))).toBe(
      false,
    );

    // ── The hourly check writes a marker that went missing ────────────────────────────────
    await rm(join(root, 'deployments', id, '.cq-rules'));
    await app.get(CloudProjectsService).reconcileRules();
    expect(await exists(join(root, 'deployments', id, '.cq-rules'))).toBe(true);

    // ── Nginx's check: the rules ───────────────────────────────────────────────────────────
    const host = `${slug}--${shortId}.cloud.test`;
    const nginx = (uri: string, args = '', deployment = id, access?: string) => ({
      'X-Cq-Protection-Key': KEY,
      'X-Cq-Host': host,
      'X-Cq-Project': slug,
      'X-Cq-Kind': 'previews',
      'X-Cq-Deployment': deployment,
      'X-Cq-Uri': uri,
      'X-Cq-Args': args,
      ...(access === undefined ? {} : { 'X-Cq-Access': access }),
    });
    const edge = (uri: string, args = '', deployment = id, access?: string) =>
      request(server)
        .get('/v1/cloud/edge/check')
        .set(nginx(uri, args, deployment, access));
    const csp = "default-src 'self'";

    const redirect = await edge('/old/hello', 'a=1').expect(403);
    expect(redirect.headers['x-cq-status']).toBe('301');
    expect(redirect.headers['x-cq-location']).toBe('/blog/hello?a=1');
    expect(redirect.headers['cache-control']).toBe('no-store');
    const clean = await edge('/about').expect(204);
    expect(clean.headers['x-cq-path']).toBe('/about.html');
    expect(clean.headers['x-cq-h-content-security-policy']).toBe(csp);
    expect((await edge('/').expect(204)).headers['x-cq-path']).toBe('/index.html');
    expect((await edge('/blog/').expect(204)).headers['x-cq-path']).toBe('/blog/index.html');
    const rewritten = await edge('/app/deep/link').expect(204);
    expect(rewritten.headers['x-cq-path']).toBe('/app/index.html');
    expect(rewritten.headers['x-cq-h-content-security-policy']).toBe(csp);
    // Nothing answers: the sentinel no file can match, so Nginx's fallbacks apply.
    const nothing = await edge('/missing').expect(204);
    expect(nothing.headers['x-cq-path']).toBe('/.cq-none');
    expect(nothing.headers['x-cq-h-content-security-policy']).toBe(csp);
    expect((await edge('/.cq-rules').expect(204)).headers['x-cq-path']).toBe('/.cq-none');
    expect((await edge('/codeqlick.json').expect(204)).headers['x-cq-path']).toBe('/.cq-none');
    // A deployment without rules gets an empty path: today's behaviour.
    const none = await edge('/about', '', plainId).expect(204);
    expect(none.headers['x-cq-path']).toBe('');
    expect(Object.keys(none.headers).filter((name) => name.startsWith('x-cq-h-'))).toEqual([]);
    // cleanUrls false: /about is no longer served from about.html.
    const strict = await edge('/about', '', both.body.id as string).expect(204);
    expect(strict.headers['x-cq-path']).toBe('/.cq-none');
    expect(
      (await edge('/about.html', '', both.body.id as string).expect(204)).headers['x-cq-path'],
    ).toBe('/about.html');
    // An unknown deployment (not saved yet) behaves as without rules.
    expect((await edge('/about', '', randomUUID()).expect(204)).headers['x-cq-path']).toBe('');
    expect((await edge('/about', '', 'not-a-uuid').expect(204)).headers['x-cq-path']).toBe('');

    // The key is still needed, and the old route is an alias.
    await edge('/about').set('X-Cq-Protection-Key', 'cd'.repeat(32)).expect(403);
    const wrongKey = await request(server)
      .get('/v1/cloud/edge/check')
      .set({ ...nginx('/old/x'), 'X-Cq-Protection-Key': 'cd'.repeat(32) })
      .expect(403);
    expect(wrongKey.headers['x-cq-status']).toBeUndefined();
    // The old route stays a deprecated alias for one release: the same answer.
    const alias = await request(server)
      .get('/v1/cloud/protection/check')
      .set(nginx('/old/hello'))
      .expect(403);
    expect(alias.headers['x-cq-location']).toBe('/blog/hello');

    // ── Combined with password protection: the password comes first ───────────────────────
    const protect = `/v1/cloud/projects/${projectId}/protection`;
    await request(server)
      .put(protect)
      .set(ownerAuth)
      .send({ mode: 'PREVIEWS', password: SITE_PASSWORD })
      .expect(200);
    await edge('/old/hello').expect(401);
    await edge('/about').expect(401);
    const entered = await request(server)
      .post('/v1/cloud/protection/password')
      .set(nginx('/'))
      .type('form')
      .send({ password: SITE_PASSWORD, next: '/' })
      .expect(303);
    const cookie = (
      (entered.headers['set-cookie'] as unknown as string[]).find((c) =>
        c.startsWith('__Host-cq_access='),
      ) as string
    )
      .split(';')[0]!
      .slice('__Host-cq_access='.length);
    const through = await edge('/old/hello', 'a=1', id, cookie).expect(403);
    expect(through.headers['x-cq-location']).toBe('/blog/hello?a=1');
    const served = await edge('/about', '', id, cookie).expect(204);
    expect(served.headers['x-cq-path']).toBe('/about.html');
    // Protection alone (no rules) still answers 204 with an empty path.
    const protectedPlain = await edge('/about', '', plainId, cookie).expect(204);
    expect(protectedPlain.headers['x-cq-path']).toBe('');
    await request(server).put(protect).set(ownerAuth).send({ mode: 'OFF' }).expect(200);

    // ── The check route: any member, the team's limits, nothing kept ──────────────────────
    const check = (auth: Record<string, string>, body: Record<string, unknown>) =>
      request(server).post('/v1/cloud/config/check').set(auth).send(body);
    const okCheck = await check(memberAuth, { teamSlug, config: JSON.stringify(RULES) }).expect(
      200,
    );
    expect(okCheck.body).toEqual({
      ok: true,
      summary: { redirects: 1, rewrites: 1, headers: 1, cleanUrls: true, trailingSlash: null },
    });
    const emptyCheck = await check(memberAuth, { teamSlug, config: '{}' }).expect(200);
    expect(emptyCheck.body).toEqual({
      ok: true,
      summary: { redirects: 0, rewrites: 0, headers: 0, cleanUrls: true, trailingSlash: null },
    });
    const badCheck = await check(memberAuth, {
      teamSlug,
      config: JSON.stringify({ redirects: [{ source: '/a', destination: '/b', status: 200 }] }),
    }).expect(200);
    expect(badCheck.body).toEqual({
      ok: false,
      errors: [{ path: 'redirects[0].status', message: 'must be 301, 302, 307 or 308' }],
    });
    const jsonCheck = await check(memberAuth, { teamSlug, config: '{' }).expect(200);
    expect(jsonCheck.body.ok).toBe(false);
    expect(jsonCheck.body.errors[0].path).toBe('codeqlick.json');
    await check(outsiderAuth, { teamSlug, config: '{}' }).expect(404);
    await check(memberAuth, { teamSlug, config: 3 }).expect(400);
    const multipart = (config: string) =>
      request(server)
        .post('/v1/cloud/config/check')
        .set(memberAuth)
        .field('teamSlug', teamSlug)
        .field('config', config);
    await multipart('x'.repeat(1024 * 1024 + 1)).expect(400);
    expect((await multipart(JSON.stringify(RULES)).expect(200)).body.ok).toBe(true);
    // Over the team's size, but under 1 MB: answered, not refused.
    const bigCheck = await multipart(' '.repeat(70 * 1024)).expect(200);
    expect(bigCheck.body).toEqual({
      ok: false,
      errors: [
        { path: 'codeqlick.json', message: expect.stringContaining('free plan allows 64 KB') },
      ],
    });
    await check(memberAuth, { config: '{}' }).expect(400);
    await request(server)
      .post('/v1/cloud/config/check')
      .send({ teamSlug, config: '{}' })
      .expect(401);
    expect(await prisma.cloudDeployment.count({ where: { projectId } })).toBe(5);

    // ── The JSON Schema: public, any origin, cached a day ─────────────────────────────────
    const schema = await request(server)
      .get('/v1/cloud/schema/codeqlick.json')
      .set('Origin', 'https://editor.example')
      .expect(200);
    expect(schema.headers['content-type']).toMatch(/^application\/schema\+json/);
    expect(schema.headers['access-control-allow-origin']).toBe('https://editor.example');
    expect(schema.headers['cache-control']).toBe('public, max-age=86400');
    expect(schema.body).toMatchObject({ type: 'object', additionalProperties: false });
    expect(Object.keys(schema.body.properties as Record<string, unknown>)).toEqual(
      expect.arrayContaining(['$schema', 'redirects', 'rewrites', 'headers', 'cleanUrls']),
    );
  });
});
