import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { create, list, x } from 'tar';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AppConfigService } from '../src/config/app-config.service.js';
import { Role } from '../src/generated/prisma/client.js';
import { CLOUD_TERMS_VERSION } from '../src/modules/cloud/cloud-plans.js';
import { MailService } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'cloud-password-1';
const owner = { email: `e2e-cloud-dl-owner-${tag}@codeqlick.test`, password };
const stranger = { email: `e2e-cloud-dl-other-${tag}@codeqlick.test`, password };
const admin = { email: `e2e-cloud-dl-admin-${tag}@codeqlick.test`, password };
const terms = { acceptTerms: true, termsVersion: CLOUD_TERMS_VERSION };

/** A built folder packed as the CLI does: tar.gz of its contents. */
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

describe('Codeqlick Cloud downloads (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'cq-cloud-dl-'));
    await mkdir(join(root, 'pages', 'suspended'), { recursive: true });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    vi.spyOn(app.get(AppConfigService), 'cloudHosting', 'get').mockReturnValue({
      domain: 'cloud.test',
      root,
    });
    vi.spyOn(app.get(MailService), 'send').mockResolvedValue(undefined);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const registeredAt = new Date();
    for (const [user, name, role] of [
      [owner, 'Ada', Role.CLIENT],
      [stranger, 'Grace', Role.CLIENT],
      [admin, 'Luis', Role.ADMIN],
    ] as const) {
      await prisma.user.create({
        data: { email: user.email, name, role, passwordHash, registeredAt },
      });
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cloudTeam.deleteMany({ where: { slug: { startsWith: `t-${tag}` } } });
      await prisma.cloudProject.deleteMany({ where: { slug: { startsWith: `p-${tag}` } } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('downloads a deployment as tar.gz, 10 an hour per team', async () => {
    const server = app.getHttpServer();
    const bearer = async (user: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`,
    });
    const ownerAuth = await bearer(owner);
    const strangerAuth = await bearer(stranger);
    const adminAuth = await bearer(admin);
    const teamSlug = `t-${tag}`;
    const slug = `p-${tag}`;

    await request(server)
      .post('/v1/cloud/teams')
      .set(ownerAuth)
      .send({ name: 'Ada Labs', slug: teamSlug, ...terms })
      .expect(201);
    const project = await request(server)
      .post(`/v1/cloud/teams/${teamSlug}/projects`)
      .set(ownerAuth)
      .send({ name: 'Docs', slug })
      .expect(201);
    const projectId = project.body.id as string;
    const deployed = await request(server)
      .post(`/v1/cloud/projects/${projectId}/deployments`)
      .set(ownerAuth)
      .field('target', 'production')
      .attach(
        'bundle',
        await bundle({
          'index.html': '<h1>hi</h1>',
          'assets/app.js': 'console.log(1)',
          '@vite.js': 'export {}',
          '.well-known/security.txt': 'Contact: mailto:hello@codeqlick.com',
        }),
      )
      .expect(201);
    const { id: deploymentId, shortId } = deployed.body as { id: string; shortId: string };
    const archiveUrl = `/v1/cloud/projects/${projectId}/deployments/${deploymentId}/archive`;
    const download = (auth: Record<string, string>) =>
      request(server)
        .get(archiveUrl)
        .set(auth)
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        });

    // ── The archive ────────────────────────────────────────────────────────────────────────
    const res = await download(ownerAuth).expect(200);
    expect(res.headers['content-type']).toBe('application/gzip');
    expect(res.headers['content-disposition']).toContain(
      `attachment; filename="${slug}-${shortId}.tar.gz"`,
    );
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['content-length']).toBeUndefined();
    const body = res.body as Buffer;
    expect(body.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]));

    const work = await mkdtemp(join(tmpdir(), 'cq-dl-'));
    try {
      const file = join(work, 'archive.tar.gz');
      await writeFile(file, body);
      const paths: string[] = [];
      await list({ file, onReadEntry: (entry) => paths.push(entry.path) });
      // Names starting with `@` keep a `./` (tar would read them as archives to append).
      expect(paths.filter((p) => !p.endsWith('/')).sort()).toEqual([
        './@vite.js',
        '.well-known/security.txt',
        'assets/app.js',
        'index.html',
      ]);
      expect(paths.every((p) => !p.startsWith('/'))).toBe(true);
      expect(paths.filter((p) => p.startsWith('./'))).toEqual(['./@vite.js']);
      const out = join(work, 'out');
      await mkdir(out);
      await x({ file, cwd: out });
      expect(await readFile(join(out, 'index.html'), 'utf8')).toBe('<h1>hi</h1>');
      expect(await readFile(join(out, 'assets', 'app.js'), 'utf8')).toBe('console.log(1)');
      expect(await readFile(join(out, '@vite.js'), 'utf8')).toBe('export {}');
    } finally {
      await rm(work, { recursive: true, force: true });
    }

    // ── Tokens, other teams, suspension ────────────────────────────────────────────────────
    const token = await request(server)
      .post('/v1/cloud/tokens')
      .set(ownerAuth)
      .send({ name: 'CI', teamSlug, expiresInDays: 30 })
      .expect(201);
    await download({ Authorization: `Bearer ${token.body.token as string}` }).expect(200);

    await request(server)
      .post('/v1/cloud/teams')
      .set(strangerAuth)
      .send({ name: 'Grace Labs', slug: `t-${tag}-b`, ...terms })
      .expect(201);
    const other = await request(server)
      .post(`/v1/cloud/teams/t-${tag}-b/projects`)
      .set(strangerAuth)
      .send({ name: 'Other', slug: `p-${tag}-b` })
      .expect(201);
    await request(server).get(archiveUrl).set(strangerAuth).expect(404);
    await request(server)
      .get(`/v1/cloud/projects/${other.body.id as string}/deployments/${deploymentId}/archive`)
      .set(strangerAuth)
      .expect(404);

    await request(server)
      .post(`/v1/admin/cloud/projects/${projectId}/suspend`)
      .set(adminAuth)
      .send({ reason: 'Phishing page' })
      .expect(204);
    await download(ownerAuth).expect(200);

    // ── Hosting not set up, files gone ─────────────────────────────────────────────────────
    vi.spyOn(app.get(AppConfigService), 'cloudHosting', 'get').mockReturnValueOnce(undefined);
    await request(server).get(archiveUrl).set(ownerAuth).expect(503);
    await rm(join(root, 'deployments', deploymentId), { recursive: true, force: true });
    const gone = await request(server).get(archiveUrl).set(ownerAuth).expect(404);
    expect(gone.body.detail).toBe('Deployment not found');

    // ── The limit: 10 an hour per team, from the events ────────────────────────────────────
    const team = await prisma.cloudTeam.findUniqueOrThrow({ where: { slug: teamSlug } });
    const recorded = await prisma.cloudEvent.findMany({
      where: { teamId: team.id, action: 'deployment.downloaded' },
    });
    expect(recorded).toHaveLength(3);
    expect(recorded.every((e) => e.targetLabel === `${slug}--${shortId}`)).toBe(true);
    await prisma.cloudEvent.createMany({
      data: Array.from({ length: 10 - recorded.length }, () => ({
        teamId: team.id,
        actorName: 'Ada',
        action: 'deployment.downloaded',
        targetLabel: `${slug}--${shortId}`,
      })),
    });
    await request(server).get(archiveUrl).set(ownerAuth).expect(429);
  });
});
