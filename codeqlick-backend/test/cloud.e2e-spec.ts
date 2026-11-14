import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { create } from 'tar';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AppConfigService } from '../src/config/app-config.service.js';
import { Role } from '../src/generated/prisma/client.js';
import { CloudDiskService } from '../src/modules/cloud/cloud-disk.service.js';
import { CloudDns } from '../src/modules/cloud/cloud-domains.service.js';
import { CLOUD_TERMS_VERSION } from '../src/modules/cloud/cloud-plans.js';
import { CloudProjectsService } from '../src/modules/cloud/cloud-projects.service.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'cloud-password-1';
const owner = { email: `e2e-cloud-owner-${tag}@codeqlick.test`, password };
const mate = { email: `e2e-cloud-mate-${tag}@codeqlick.test`, password };
const admin = { email: `e2e-cloud-admin-${tag}@codeqlick.test`, password };
const SERVER_IP = '203.0.113.7';
const terms = { acceptTerms: true, termsVersion: CLOUD_TERMS_VERSION };

/** A built folder packed as the CLI does: tar.gz of its contents. */
async function bundle(files: Record<string, string>, extra?: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'cq-site-'));
  for (const [path, body] of Object.entries(files)) {
    await mkdir(join(dir, path, '..'), { recursive: true });
    await writeFile(join(dir, path), body);
  }
  await extra?.(dir);
  const file = join(tmpdir(), `cq-bundle-${randomUUID()}.tar.gz`);
  await create({ gzip: true, file, cwd: dir, portable: true }, ['.']);
  await rm(dir, { recursive: true, force: true });
  return file;
}

describe('Codeqlick Cloud (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let root: string;
  const sent: MailMessage[] = [];
  const dns = { txt: [] as string[], ipv4: [] as string[], https: false };

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'cq-cloud-root-'));
    await mkdir(join(root, 'pages', 'suspended'), { recursive: true });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CloudDns)
      .useValue({
        txt: () => Promise.resolve(dns.txt),
        ipv4: () => Promise.resolve(dns.ipv4),
        https: () => Promise.resolve(dns.https),
      })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const config = app.get(AppConfigService);
    vi.spyOn(config, 'cloudHosting', 'get').mockReturnValue({ domain: 'cloud.test', root });
    vi.spyOn(config, 'sitesServerIp', 'get').mockReturnValue(SERVER_IP);
    vi.spyOn(app.get(MailService), 'send').mockImplementation((message) => {
      sent.push(message);
      return Promise.resolve();
    });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const registeredAt = new Date();
    await prisma.user.create({
      data: { email: owner.email, name: 'Ada', role: Role.CLIENT, passwordHash, registeredAt },
    });
    await prisma.user.create({
      data: { email: mate.email, name: 'Grace', role: Role.CLIENT, passwordHash, registeredAt },
    });
    await prisma.user.create({
      data: {
        email: admin.email,
        name: 'Luis',
        role: Role.ADMIN,
        passwordHash,
        registeredAt,
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cloudTeam.deleteMany({ where: { slug: { startsWith: `t-${tag}` } } });
      await prisma.cloudProject.deleteMany({ where: { slug: { startsWith: `p-${tag}` } } });
      await prisma.cloudReport.deleteMany({ where: { email: owner.email } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('runs teams, tokens, deployments, domains and moderation', async () => {
    const server = app.getHttpServer();
    const bearer = async (user: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`,
    });
    const ownerAuth = await bearer(owner);
    const mateAuth = await bearer(mate);
    const adminAuth = await bearer(admin);
    const teamSlug = `t-${tag}`;
    const slug = `p-${tag}`;

    // ── Team ───────────────────────────────────────────────────────────────────────────────
    await request(server)
      .post('/v1/cloud/teams')
      .set(ownerAuth)
      .send({ name: 'Ada Labs', slug: teamSlug, acceptTerms: true, termsVersion: 'old' })
      .expect(409);
    const team = await request(server)
      .post('/v1/cloud/teams')
      .set(ownerAuth)
      .send({ name: 'Ada Labs', slug: teamSlug, ...terms })
      .expect(201);
    expect(team.body).toMatchObject({ slug: teamSlug, role: 'OWNER', plan: 'FREE' });
    await request(server).get(`/v1/cloud/teams/${teamSlug}`).set(mateAuth).expect(404);

    // ── Project ────────────────────────────────────────────────────────────────────────────
    await request(server)
      .post(`/v1/cloud/teams/${teamSlug}/projects`)
      .set(ownerAuth)
      .send({ name: 'Docs', slug: 'admin' })
      .expect(409);
    const project = await request(server)
      .post(`/v1/cloud/teams/${teamSlug}/projects`)
      .set(ownerAuth)
      .send({ name: 'Docs', slug })
      .expect(201);
    expect(project.body).toMatchObject({
      slug,
      url: `https://${slug}.cloud.test`,
      production: null,
    });
    const projectId = project.body.id as string;

    // ── Tokens ─────────────────────────────────────────────────────────────────────────────
    const created = await request(server)
      .post('/v1/cloud/tokens')
      .set(ownerAuth)
      .send({ name: 'CI', teamSlug, expiresInDays: 30 })
      .expect(201);
    const token = created.body.token as string;
    expect(token).toMatch(/^cqk_/);
    expect(created.body.item).toMatchObject({
      name: 'CI',
      prefix: token.slice(0, 12),
      team: { slug: teamSlug },
    });
    const tokenAuth = { Authorization: `Bearer ${token}` };
    const me = await request(server).get('/v1/cloud/me').set(tokenAuth).expect(200);
    expect(me.body).toMatchObject({ via: 'token', token: { name: 'CI' } });
    expect(me.body.teams.map((t: { slug: string }) => t.slug)).toEqual([teamSlug]);
    // Tokens open only the Cloud API, and not its session-only routes.
    await request(server).get('/v1/auth/me').set(tokenAuth).expect(401);
    await request(server).get('/v1/cloud/tokens').set(tokenAuth).expect(401);
    await request(server).get('/v1/cloud/me').set({ Authorization: 'Bearer cqk_nope' }).expect(401);

    // ── Deployments ────────────────────────────────────────────────────────────────────────
    const noIndex = await bundle({ 'about.html': 'about' });
    const refused = await request(server)
      .post(`/v1/cloud/projects/${projectId}/deployments`)
      .set(tokenAuth)
      .attach('bundle', noIndex)
      .expect(400);
    expect(refused.body.detail).toMatch(/index\.html/);

    const withLink = await bundle({ 'index.html': 'hi' }, (dir) =>
      symlink('/etc/passwd', join(dir, 'passwd')),
    );
    const linkRefused = await request(server)
      .post(`/v1/cloud/projects/${projectId}/deployments`)
      .set(tokenAuth)
      .attach('bundle', withLink)
      .expect(400);
    expect(linkRefused.body.detail).toMatch(/files and folders/);

    // The disk guard (decision 49): a full disk refuses new deployments, and nothing is kept.
    const full = vi.spyOn(app.get(CloudDiskService), 'full', 'get').mockReturnValue(true);
    const tooLate = await bundle({ 'index.html': 'too late' });
    const noRoom = await request(server)
      .post(`/v1/cloud/projects/${projectId}/deployments`)
      .set(tokenAuth)
      .field('target', 'preview')
      .attach('bundle', tooLate)
      .expect(507);
    expect(noRoom.body.detail).toMatch(/short of space/);
    full.mockRestore();
    const disk = await request(server).get('/v1/admin/cloud/disk').set(adminAuth).expect(200);
    expect(disk.body).toMatchObject({ state: expect.stringMatching(/^(ok|low|full)$/) });
    expect(disk.body.totalBytes).toBeGreaterThan(0);
    expect(disk.body.deploymentsBytes).toBeGreaterThanOrEqual(0);
    await request(server).get('/v1/admin/cloud/disk').set(tokenAuth).expect(401);

    const v1 = await bundle({ 'index.html': '<h1>v1</h1>', 'assets/app.js': 'console.log(1)' });
    const preview = await request(server)
      .post(`/v1/cloud/projects/${projectId}/deployments`)
      .set(tokenAuth)
      .field('target', 'preview')
      .field('message', 'First try')
      .field('commit', 'abc1234')
      .attach('bundle', v1)
      .expect(201);
    expect(preview.body).toMatchObject({
      target: 'preview',
      isProduction: false,
      message: 'First try',
      commit: 'abc1234',
      fileCount: 2,
      viaToken: 'CI',
    });
    const first = preview.body as { id: string; shortId: string; url: string };
    expect(first.url).toBe(`https://${slug}--${first.shortId}.cloud.test`);
    expect(
      await readFile(join(root, 'hosts', `${slug}--${first.shortId}`, 'index.html'), 'utf8'),
    ).toBe('<h1>v1</h1>');

    // Files and comparison (architecture 4.13): the list, and no production to compare with yet.
    const files = await request(server)
      .get(`/v1/cloud/projects/${projectId}/deployments/${first.id}/files`)
      .set(tokenAuth)
      .expect(200);
    expect(files.body).toEqual({
      items: [
        { path: 'assets/app.js', size: 14 },
        { path: 'index.html', size: 11 },
      ],
      count: 2,
      totalBytes: 25,
    });
    await request(server)
      .get(`/v1/cloud/projects/${projectId}/deployments/${first.id}/compare`)
      .set(tokenAuth)
      .expect(409);
    await request(server)
      .get(`/v1/cloud/projects/${projectId}/deployments/${randomUUID()}/files`)
      .set(tokenAuth)
      .expect(404);
    await request(server)
      .get(`/v1/cloud/projects/${projectId}/deployments/${first.id}/files`)
      .set(mateAuth)
      .expect(404);

    const v2 = await bundle({ 'index.html': '<h1>v2</h1>', '200.html': 'spa' });
    const production = await request(server)
      .post(`/v1/cloud/projects/${projectId}/deployments`)
      .set(tokenAuth)
      .field('target', 'production')
      .attach('bundle', v2)
      .expect(201);
    expect(production.body).toMatchObject({ target: 'production', isProduction: true });
    expect(await readFile(join(root, 'hosts', slug, 'index.html'), 'utf8')).toBe('<h1>v2</h1>');

    // Rollback: promote the first one.
    const promoted = await request(server)
      .post(`/v1/cloud/projects/${projectId}/deployments/${first.id}/promote`)
      .set(tokenAuth)
      .expect(200);
    expect(promoted.body.production).toMatchObject({ id: first.id, isProduction: true });
    expect(await readlink(join(root, 'hosts', slug))).toBe(join('..', 'deployments', first.id));
    await request(server)
      .delete(`/v1/cloud/projects/${projectId}/deployments/${first.id}`)
      .set(tokenAuth)
      .expect(409);

    const list = await request(server)
      .get(`/v1/cloud/projects/${projectId}/deployments`)
      .set(tokenAuth)
      .expect(200);
    expect(list.body.total).toBe(2);
    const usage = await request(server)
      .get(`/v1/cloud/teams/${teamSlug}/usage`)
      .set(tokenAuth)
      .expect(200);
    expect(usage.body).toMatchObject({ plan: 'FREE', projects: 1, deploymentsLastHour: 2 });
    expect(usage.body.storageBytes).toBeGreaterThan(0);

    // Compare the old production (v2) with the current one (v1): same-size index.html differs.
    const second = production.body as { id: string };
    const compareUrl = `/v1/cloud/projects/${projectId}/deployments/${second.id}/compare`;
    const diff = await request(server).get(compareUrl).set(tokenAuth).expect(200);
    expect(diff.body).toEqual({
      deploymentId: second.id,
      withId: first.id,
      added: [{ path: '200.html', size: 3 }],
      removed: [{ path: 'assets/app.js', size: 14 }],
      changed: [{ path: 'index.html', size: 11, previousSize: 11 }],
      unchanged: 0,
      totalBytes: 14,
      withTotalBytes: 25,
    });
    const self = await request(server)
      .get(compareUrl)
      .query({ with: second.id })
      .set(tokenAuth)
      .expect(200);
    expect(self.body).toMatchObject({ added: [], removed: [], changed: [], unchanged: 2 });
    await request(server).get(compareUrl).query({ with: 'latest' }).set(tokenAuth).expect(400);
    await request(server).get(compareUrl).query({ with: randomUUID() }).set(tokenAuth).expect(404);
    // A deployment of another project is unknown here, even in the same team.
    const other = await request(server)
      .post(`/v1/cloud/teams/${teamSlug}/projects`)
      .set(ownerAuth)
      .send({ name: 'Other docs', slug: `p-${tag}-b` })
      .expect(201);
    const elsewhere = await request(server)
      .post(`/v1/cloud/projects/${other.body.id as string}/deployments`)
      .set(tokenAuth)
      .attach('bundle', await bundle({ 'index.html': '<h1>v1</h1>' }))
      .expect(201);
    await request(server)
      .get(compareUrl)
      .query({ with: elsewhere.body.id as string })
      .set(tokenAuth)
      .expect(404);
    await request(server)
      .get(`/v1/cloud/projects/${projectId}/deployments/${elsewhere.body.id as string}/files`)
      .set(tokenAuth)
      .expect(404);
    // A deployment whose files are gone answers 404.
    await rm(join(root, 'deployments', second.id), { recursive: true, force: true });
    await request(server)
      .get(`/v1/cloud/projects/${projectId}/deployments/${second.id}/files`)
      .set(tokenAuth)
      .expect(404);
    await request(server).get(compareUrl).set(tokenAuth).expect(404);
    await request(server)
      .get(`/v1/cloud/projects/${projectId}/deployments/${first.id}/compare`)
      .query({ with: second.id })
      .set(tokenAuth)
      .expect(404);

    // ── Invitations ────────────────────────────────────────────────────────────────────────
    await request(server)
      .post(`/v1/cloud/teams/${teamSlug}/invites`)
      .set(ownerAuth)
      .send({ email: mate.email, role: 'MEMBER', locale: 'en' })
      .expect(201);
    const email = sent.find((m) => m.to === mate.email);
    const inviteToken = /invite\?token=([\w-]+)/.exec(email?.text ?? '')?.[1];
    expect(inviteToken).toBeTruthy();
    // The link is for that email only.
    await request(server)
      .post(`/v1/cloud/invites/${inviteToken}/accept`)
      .set(adminAuth)
      .send(terms)
      .expect(403);
    const invite = await request(server)
      .get(`/v1/cloud/invites/${inviteToken}`)
      .set(mateAuth)
      .expect(200);
    expect(invite.body).toMatchObject({
      emailMatches: true,
      role: 'MEMBER',
      team: { slug: teamSlug },
    });
    await request(server)
      .post(`/v1/cloud/invites/${inviteToken}/accept`)
      .set(mateAuth)
      .send(terms)
      .expect(200);
    const members = await request(server)
      .get(`/v1/cloud/teams/${teamSlug}/members`)
      .set(mateAuth)
      .expect(200);
    expect(members.body.items).toHaveLength(2);
    // A member deploys but can't manage projects.
    await request(server)
      .post(`/v1/cloud/teams/${teamSlug}/projects`)
      .set(mateAuth)
      .send({ name: 'Other', slug: `p-${tag}-x` })
      .expect(403);

    // ── CLI sign-in (device flow) ──────────────────────────────────────────────────────────
    const started = await request(server)
      .post('/v1/cloud/cli/device')
      .send({ clientName: 'grace-laptop' })
      .expect(201);
    const { deviceCode, userCode } = started.body as { deviceCode: string; userCode: string };
    expect(userCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(
      (await request(server).post('/v1/cloud/cli/device/token').send({ deviceCode }).expect(200))
        .body,
    ).toEqual({
      status: 'pending',
    });
    const shown = await request(server)
      .get(`/v1/cloud/cli/device/${userCode}`)
      .set(mateAuth)
      .expect(200);
    expect(shown.body).toMatchObject({ clientName: 'grace-laptop', status: 'pending' });
    await request(server)
      .post(`/v1/cloud/cli/device/${userCode}`)
      .set(mateAuth)
      .send({ approve: true })
      .expect(204);
    const approved = await request(server)
      .post('/v1/cloud/cli/device/token')
      .send({ deviceCode })
      .expect(200);
    expect(approved.body).toMatchObject({ status: 'approved', user: { email: mate.email } });
    const cliMe = await request(server)
      .get('/v1/cloud/me')
      .set({ Authorization: `Bearer ${approved.body.token as string}` })
      .expect(200);
    expect(cliMe.body.token.name).toBe('CLI · grace-laptop');
    expect(
      (await request(server).post('/v1/cloud/cli/device/token').send({ deviceCode }).expect(200))
        .body,
    ).toEqual({
      status: 'expired',
    });

    // ── Domains ────────────────────────────────────────────────────────────────────────────
    await request(server)
      .post(`/v1/cloud/projects/${projectId}/domains`)
      .set(tokenAuth)
      .send({ name: 'x.codeqlick.com' })
      .expect(400);
    const domain = await request(server)
      .post(`/v1/cloud/projects/${projectId}/domains`)
      .set(tokenAuth)
      .send({ name: `docs-${tag}.example.org` })
      .expect(201);
    expect(domain.body).toMatchObject({ state: 'PENDING' });
    const txt = (domain.body.dns as Array<{ type: string; value: string }>).find(
      (r) => r.type === 'TXT',
    );
    const check = () =>
      request(server)
        .post(`/v1/cloud/projects/${projectId}/domains/${domain.body.id as string}/check`)
        .set(tokenAuth)
        .expect(200);
    expect((await check()).body.state).toBe('PENDING');
    dns.txt = [txt!.value];
    expect((await check()).body).toMatchObject({ state: 'VERIFIED' });
    dns.ipv4 = [SERVER_IP];
    dns.https = true;
    expect((await check()).body).toMatchObject({ state: 'LIVE', lastError: null });
    expect(await readFile(join(root, 'domains', `docs-${tag}.example.org`), 'utf8')).toBe(
      `${slug}\n`,
    );

    // ── Reports and suspension ─────────────────────────────────────────────────────────────
    await request(server)
      .post('/v1/cloud/reports')
      .send({
        url: `https://${slug}.cloud.test/login`,
        reason: 'PHISHING',
        details: 'Asks for bank passwords',
        email: owner.email,
      })
      .expect(204);
    const reports = await request(server).get('/v1/admin/cloud/reports').set(adminAuth).expect(200);
    const report = (
      reports.body.items as Array<{ id: string; project: { slug: string } | null }>
    ).find((r) => r.project?.slug === slug);
    expect(report).toBeTruthy();
    await request(server)
      .post(`/v1/admin/cloud/projects/${projectId}/suspend`)
      .set(adminAuth)
      .send({ reason: 'Phishing page' })
      .expect(204);
    expect(await readlink(join(root, 'hosts', slug))).toBe(join('..', 'pages', 'suspended'));
    expect(sent.some((m) => m.to === owner.email && /suspend/i.test(m.subject))).toBe(true);
    await request(server)
      .post(`/v1/cloud/projects/${projectId}/deployments`)
      .set(tokenAuth)
      .attach('bundle', await bundle({ 'index.html': 'x' }))
      .expect(403);
    await request(server)
      .delete(`/v1/admin/cloud/projects/${projectId}/suspension`)
      .set(adminAuth)
      .expect(204);
    expect(await readlink(join(root, 'hosts', slug))).toBe(join('..', 'deployments', first.id));
    await request(server)
      .post(`/v1/admin/cloud/reports/${report!.id}/close`)
      .set(adminAuth)
      .send({})
      .expect(204);

    // ── Events, housekeeping and deletion ──────────────────────────────────────────────────
    const events = await request(server)
      .get(`/v1/cloud/teams/${teamSlug}/events`)
      .set(ownerAuth)
      .expect(200);
    const actions = (events.body.items as Array<{ action: string }>).map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'team.created',
        'deployment.created',
        'deployment.promoted',
        'member.joined',
        'domain.added',
      ]),
    );
    await app.get(CloudProjectsService).housekeeping();

    await request(server).delete(`/v1/cloud/projects/${projectId}`).set(tokenAuth).expect(204);
    await expect(readlink(join(root, 'hosts', slug))).rejects.toThrow(/ENOENT/);
    await expect(readFile(join(root, 'domains', `docs-${tag}.example.org`))).rejects.toThrow(
      /ENOENT/,
    );
    // Its address stays taken for 30 days.
    await request(server)
      .post(`/v1/cloud/teams/${teamSlug}/projects`)
      .set(ownerAuth)
      .send({ name: 'Again', slug })
      .expect(409);

    await request(server)
      .delete(`/v1/cloud/tokens/${created.body.item.id as string}`)
      .set(ownerAuth)
      .expect(204);
    await request(server).get('/v1/cloud/me').set(tokenAuth).expect(401);
  });
});
