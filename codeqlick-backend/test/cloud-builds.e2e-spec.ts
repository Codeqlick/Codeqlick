import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readlink, rm, writeFile } from 'node:fs/promises';
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
import { CloudAuditsService } from '../src/modules/cloud/cloud-audits.service.js';
import { CloudBuildsService } from '../src/modules/cloud/cloud-builds.service.js';
import { CLOUD_TERMS_VERSION } from '../src/modules/cloud/cloud-plans.js';
import { LOCKED_BUILD_LOG_LINE } from '../src/modules/cloud/cloud-production-lock.js';
import { GithubClient } from '../src/modules/cloud/github.client.js';
import type { AuditInputs } from '../src/modules/site-audits/site-audit-checks.js';
import { MailService } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const tag = randomUUID().slice(0, 8);
const password = 'cloud-builds-password-1';
const owner = { email: `e2e-cb-owner-${tag}@codeqlick.test`, password };
const WEBHOOK_SECRET = 'webhook-secret-for-tests';
const BUILDER = 'builder-token-for-tests-0123456789';
const INSTALLATION = 4242000 + Math.floor(Math.random() * 1000);
const REPO = 777000 + Math.floor(Math.random() * 1000);
const sha = (n: number) => n.toString(16).padStart(40, 'a');

/** GitHub, as the tests want it. */
const github = {
  configured: true,
  statuses: [] as Array<{ sha: string; state: string; url: string }>,
  comments: [] as Array<{ pr: number; id: bigint | null; body: string }>,
  installationToken: vi.fn(() => Promise.resolve('ghs_installation_token')),
  userToken: vi.fn((code: string) =>
    code === 'good' ? Promise.resolve('ghu_user') : Promise.reject(new Error('bad code')),
  ),
  userInstallationIds: vi.fn(() => Promise.resolve([INSTALLATION])),
  installation: vi.fn(() =>
    Promise.resolve({ login: 'ada-labs', type: 'Organization', suspended: false }),
  ),
  repositories: vi.fn(() =>
    Promise.resolve([
      { id: REPO, fullName: 'ada-labs/site', defaultBranch: 'main', private: true },
    ]),
  ),
  branchHead: vi.fn(() => Promise.resolve({ sha: sha(9), message: 'Manual', author: 'Ada' })),
  setStatus: vi.fn(
    (
      _i: unknown,
      _r: unknown,
      _f: string,
      commit: string,
      state: string,
      _d: string,
      url: string,
    ) => {
      github.statuses.push({ sha: commit, state, url });
      return Promise.resolve();
    },
  ),
  upsertComment: vi.fn(
    (_i: unknown, _r: unknown, _f: string, pr: number, id: bigint | null, body: string) => {
      github.comments.push({ pr, id, body });
      return Promise.resolve(id ?? 99n);
    },
  ),
};

/** The preview's page for the website check: a few problems, as the audits e2e has. */
const previewPage = {
  page: {
    url: 'https://preview.example/',
    status: 200,
    headers: { 'content-encoding': 'gzip', 'x-content-type-options': 'nosniff' },
    body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>The shop of examples</title></head><body><h1>Shop</h1></body></html>',
    bytes: 2_000,
    ttfbMs: 150,
  },
  certificate: { validTo: new Date(Date.now() + 90 * 86_400_000), error: null },
  httpVersion: 'https',
  robotsTxt: null,
  sitemapFound: false,
  pageSpeed: null,
  now: new Date(),
} as unknown as AuditInputs;

function signed(body: object) {
  const raw = JSON.stringify(body);
  return {
    raw,
    signature: `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex')}`,
  };
}

describe('Codeqlick Cloud builds from Git (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'cq-cloud-builds-'));
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GithubClient)
      .useValue(github)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: true,
      rawBody: true,
    });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const config = app.get(AppConfigService);
    vi.spyOn(config, 'cloudHosting', 'get').mockReturnValue({ domain: 'cloud.test', root });
    vi.spyOn(config, 'cloudBuilderToken', 'get').mockReturnValue(BUILDER);
    vi.spyOn(config, 'githubApp', 'get').mockReturnValue({
      appId: '1',
      slug: 'codeqlick-cloud',
      clientId: 'Iv1.x',
      clientSecret: 'secret',
      privateKey: 'unused',
      webhookSecret: WEBHOOK_SECRET,
    });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.create({
      data: {
        email: owner.email,
        name: 'Ada',
        role: Role.CLIENT,
        passwordHash,
        registeredAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cloudTeam.deleteMany({ where: { slug: `b-${tag}` } });
      await prisma.cloudProject.deleteMany({ where: { slug: `bp-${tag}` } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('links GitHub, builds pushes and pull requests on the build server, and reports back', async () => {
    const server = app.getHttpServer();
    const builds = app.get(CloudBuildsService);
    const login = await request(server).post('/v1/auth/login').send(owner).expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
    const builder = { Authorization: `Bearer ${BUILDER}` };
    const team = `b-${tag}`;
    await request(server)
      .post('/v1/cloud/teams')
      .set(auth)
      .send({ name: 'Builds', slug: team, acceptTerms: true, termsVersion: CLOUD_TERMS_VERSION })
      .expect(201);
    const project = await request(server)
      .post(`/v1/cloud/teams/${team}/projects`)
      .set(auth)
      .send({ name: 'Site', slug: `bp-${tag}` })
      .expect(201);
    const projectId = project.body.id as string;

    // ── Linking: the state is signed, and the person's own GitHub must see the installation.
    const install = await request(server)
      .get(`/v1/cloud/github/install-url?teamSlug=${team}`)
      .set(auth)
      .expect(200);
    const state = new URL(install.body.url as string).searchParams.get('state')!;
    await request(server)
      .post('/v1/cloud/github/installations')
      .set(auth)
      .send({ installationId: INSTALLATION, code: 'good', state: `${state}x` })
      .expect(403);
    await request(server)
      .post('/v1/cloud/github/installations')
      .set(auth)
      .send({ installationId: INSTALLATION, code: 'bad', state })
      .expect(403);
    await request(server)
      .post('/v1/cloud/github/installations')
      .set(auth)
      .send({ installationId: INSTALLATION, code: 'good', state })
      .expect(201);
    const repos = await request(server)
      .get(`/v1/cloud/teams/${team}/github/repos?installationId=${INSTALLATION}`)
      .set(auth)
      .expect(200);
    expect(repos.body.items[0]).toMatchObject({ id: REPO, fullName: 'ada-labs/site' });
    await request(server)
      .put(`/v1/cloud/projects/${projectId}/git`)
      .set(auth)
      .send({ installationId: INSTALLATION, repoId: REPO, branch: 'main', rootDir: '../etc' })
      .expect(400);
    const git = await request(server)
      .put(`/v1/cloud/projects/${projectId}/git`)
      .set(auth)
      .send({
        installationId: INSTALLATION,
        repoId: REPO,
        branch: 'main',
        outputDir: 'build',
        nodeVersion: '22',
      })
      .expect(200);
    expect(git.body).toMatchObject({
      repo: 'ada-labs/site',
      branch: 'main',
      outputDir: 'build',
      nodeVersion: '22',
    });

    // ── Variables are write-only.
    const env = await request(server)
      .put(`/v1/cloud/projects/${projectId}/env`)
      .set(auth)
      .send({ key: 'API_KEY', value: 's3cret-value', production: true, preview: false })
      .expect(200);
    expect(JSON.stringify(env.body)).not.toContain('s3cret-value');
    const stored = await prisma.cloudEnvVar.findFirstOrThrow({ where: { projectId } });
    expect(stored.valueSealed).not.toContain('s3cret');

    // ── Webhooks: a bad signature, a push to main (production), a fork's PR (ignored), a PR.
    const repository = { id: REPO, full_name: 'ada-labs/site' };
    const installation = { id: INSTALLATION };
    await request(server)
      .post('/v1/cloud/github/webhook')
      .set({
        'X-GitHub-Event': 'push',
        'X-Hub-Signature-256': 'sha256=00',
        'Content-Type': 'application/json',
      })
      .send({ installation })
      .expect(401);
    const send = async (event: string, body: object, delivery = randomUUID()) => {
      const { raw, signature } = signed(body);
      await request(server)
        .post('/v1/cloud/github/webhook')
        .set({
          'X-GitHub-Event': event,
          'X-GitHub-Delivery': delivery,
          'X-Hub-Signature-256': signature,
          'Content-Type': 'application/json',
        })
        .send(raw)
        .expect(202);
    };
    const pushDelivery = randomUUID();
    const push = {
      ref: 'refs/heads/main',
      after: sha(1),
      deleted: false,
      head_commit: { message: 'Ship it', author: { name: 'Ada' } },
      repository,
      installation,
    };
    await send('push', push, pushDelivery);
    await send('push', push, pushDelivery); // the same delivery again: ignored
    await send('pull_request', {
      action: 'opened',
      pull_request: {
        number: 7,
        title: 'From a fork',
        head: { sha: sha(2), ref: 'evil', repo: { id: 1 } },
        base: { repo: repository },
      },
      repository,
      installation,
    });
    await send('pull_request', {
      action: 'opened',
      pull_request: {
        number: 8,
        title: 'New header',
        user: { login: 'grace' },
        head: { sha: sha(3), ref: 'header', repo: repository },
        base: { repo: repository },
      },
      repository,
      installation,
    });
    const list = await request(server)
      .get(`/v1/cloud/projects/${projectId}/builds`)
      .set(auth)
      .expect(200);
    expect(
      list.body.items.map((b: { pullRequest: number | null; target: string; status: string }) => [
        b.pullRequest,
        b.target,
        b.status,
      ]),
    ).toEqual([
      [8, 'preview', 'QUEUED'],
      [null, 'production', 'QUEUED'],
    ]);
    await vi.waitFor(() =>
      expect(github.statuses.filter((s) => s.state === 'pending')).toHaveLength(2),
    );

    // ── The build server: one build per team at a time, oldest first.
    await request(server)
      .post('/v1/cloud/builder/claim')
      .set({ Authorization: 'Bearer nope' })
      .send({ builder: 'b1' })
      .expect(401);
    const claimed = await request(server)
      .post('/v1/cloud/builder/claim')
      .set(builder)
      .send({ builder: 'b1' })
      .expect(200);
    const job = claimed.body.build;
    expect(job).toMatchObject({
      commit: sha(1),
      outputDir: 'build',
      nodeVersion: '22',
      env: { API_KEY: 's3cret-value' },
      cache: { key: `${projectId}/production-node22` },
    });
    expect(job.cloneUrl).toBe(
      'https://x-access-token:ghs_installation_token@github.com/ada-labs/site.git',
    );
    expect(job.secrets).toEqual(expect.arrayContaining(['ghs_installation_token', 's3cret-value']));
    await request(server)
      .post('/v1/cloud/builder/claim')
      .set(builder)
      .send({ builder: 'b2' })
      .expect(204);
    await request(server)
      .post(`/v1/cloud/builder/builds/${job.id as string}/log`)
      .set(builder)
      .send({ text: 'npm ci\nbuilt\n' })
      .expect(204);
    await request(server)
      .post(`/v1/cloud/builder/builds/${job.id as string}/heartbeat`)
      .set(builder)
      .expect(204);
    const dist = await mkdtemp(join(tmpdir(), 'cq-build-out-'));
    await writeFile(join(dist, 'index.html'), '<h1>built</h1>');
    const bundle = join(tmpdir(), `cq-build-${randomUUID()}.tar.gz`);
    await create({ gzip: true, file: bundle, cwd: dist, portable: true }, ['.']);
    await request(server)
      .post(`/v1/cloud/builder/builds/${job.id as string}/finish`)
      .set(builder)
      .field('status', 'succeeded')
      .field('config', JSON.stringify({ cleanUrls: true }))
      .attach('bundle', bundle)
      .expect(204);
    expect(await readFile(join(root, 'hosts', `bp-${tag}`, 'index.html'), 'utf8')).toBe(
      '<h1>built</h1>',
    );
    const first = await request(server)
      .get(`/v1/cloud/projects/${projectId}/builds/1`)
      .set(auth)
      .expect(200);
    expect(first.body).toMatchObject({
      status: 'SUCCEEDED',
      target: 'production',
      log: 'npm ci\nbuilt\n',
    });
    expect(first.body.deploymentId).toBeTruthy();
    // The build root's codeqlick.json travels with the output (architecture 4.13).
    expect(
      (await prisma.cloudDeployment.findUniqueOrThrow({ where: { id: first.body.deploymentId } }))
        .config,
    ).toEqual({ cleanUrls: true });
    await vi.waitFor(() =>
      expect(github.statuses.some((s) => s.sha === sha(1) && s.state === 'success')).toBe(true),
    );

    // The pull request's build fails: a failure status and the app's comment.
    const second = await request(server)
      .post('/v1/cloud/builder/claim')
      .set(builder)
      .send({ builder: 'b1' })
      .expect(200);
    expect(second.body.build.env).toEqual({}); // API_KEY is production only
    await request(server)
      .post(`/v1/cloud/builder/builds/${second.body.build.id as string}/finish`)
      .set(builder)
      .field('status', 'failed')
      .field('error', 'npm run build exited with 1')
      .expect(204);
    await vi.waitFor(() =>
      expect(github.comments.some((c) => c.pr === 8 && c.body.includes('Failed'))).toBe(true),
    );

    // Preview checks (decision 52): a pull request's preview is checked, in the background, and
    // the result goes into the comment; the audit has no member and leaves `indexable` out.
    const audits = app.get(CloudAuditsService);
    const noindex: AuditInputs = {
      ...previewPage,
      page: {
        ...previewPage.page,
        body: previewPage.page.body.replace(
          '<head>',
          '<head><meta name="robots" content="noindex">',
        ),
      },
    };
    audits.gatherInputs = () => Promise.resolve(noindex);
    const checked = await request(server)
      .put(`/v1/cloud/projects/${projectId}/git`)
      .set(auth)
      .send({ installationId: INSTALLATION, repoId: REPO, branch: 'main', previewChecks: true })
      .expect(200);
    expect(checked.body.previewChecks).toBe(true);
    const finishPull = async (commit: string) => {
      await send('pull_request', {
        action: 'synchronize',
        pull_request: {
          number: 8,
          title: 'New header',
          user: { login: 'grace' },
          head: { sha: commit, ref: 'header', repo: repository },
          base: { repo: repository },
        },
        repository,
        installation,
      });
      const claim = await request(server)
        .post('/v1/cloud/builder/claim')
        .set(builder)
        .send({ builder: 'b1' })
        .expect(200);
      const output = join(tmpdir(), `cq-build-${randomUUID()}.tar.gz`);
      await create({ gzip: true, file: output, cwd: dist, portable: true }, ['.']);
      await request(server)
        .post(`/v1/cloud/builder/builds/${claim.body.build.id as string}/finish`)
        .set(builder)
        .field('status', 'succeeded')
        .attach('bundle', output)
        .expect(204);
      return claim.body.build.id as string;
    };
    const checkedBuild = await finishPull(sha(5));
    await vi.waitFor(() =>
      expect(
        github.comments.some((c) => c.pr === 8 && c.body.includes('Website check: running…')),
      ).toBe(true),
    );
    await vi.waitFor(async () =>
      expect(
        (await prisma.cloudBuild.findUniqueOrThrow({ where: { id: checkedBuild } })).auditId,
      ).not.toBeNull(),
    );
    const audit = await prisma.cloudAudit.findFirstOrThrow({
      where: { builds: { some: { id: checkedBuild } } },
    });
    expect(audit.userId).toBeNull();
    expect(JSON.stringify(audit.result)).not.toContain('"indexable"');
    await vi.waitFor(() =>
      expect(
        github.comments.some(
          (c) =>
            c.pr === 8 &&
            c.body.includes(`Website check: ${audit.score}/100`) &&
            c.body.includes(`/en/console/${team}/audits/${audit.id}`),
        ),
      ).toBe(true),
    );
    const detail = await request(server)
      .get(`/v1/cloud/projects/${projectId}/builds`)
      .set(auth)
      .expect(200);
    expect(detail.body.items[0].audit).toEqual({ id: audit.id, score: audit.score });
    expect(detail.body.items[1].audit).toBeNull();
    const auditList = await request(server)
      .get(`/v1/cloud/teams/${team}/audits`)
      .set(auth)
      .expect(200);
    expect(auditList.body.items[0]).toMatchObject({ id: audit.id, preview: true });

    // A preview that can't be opened says why, and the build is still a success.
    audits.gatherInputs = () => Promise.reject(new Error('getaddrinfo ENOTFOUND'));
    const unreachable = await finishPull(sha(6));
    await vi.waitFor(() =>
      expect(
        github.comments.some(
          (c) => c.pr === 8 && c.body.includes("Website check: couldn't open the preview"),
        ),
      ).toBe(true),
    );
    expect(await prisma.cloudBuild.findUniqueOrThrow({ where: { id: unreachable } })).toMatchObject(
      { status: 'SUCCEEDED', auditId: null },
    );

    // Build notifications (decision 43): channels are checked, their URLs never come back, and a
    // failed production build emails the chosen members.
    const me = await prisma.user.findUniqueOrThrow({ where: { email: owner.email } });
    const notifications = `/v1/cloud/projects/${projectId}/notifications`;
    await request(server)
      .post(notifications)
      .set(auth)
      .send({ kind: 'SLACK', name: 'Slack', url: 'https://example.com/services/x' })
      .expect(400);
    await request(server)
      .post(notifications)
      .set(auth)
      .send({ kind: 'WEBHOOK', name: 'Mine', url: 'https://127.0.0.1/hook' })
      .expect(400);
    const hook = await request(server)
      .post(notifications)
      .set(auth)
      .send({ kind: 'WEBHOOK', name: 'Mine', url: 'https://hooks.example.com/cloud/abcd' })
      .expect(201);
    expect(hook.body).toMatchObject({ kind: 'WEBHOOK', hint: 'hooks.example.com/…abcd' });
    expect(hook.body.secret).toMatch(/^cqn_[0-9a-f]{32}$/);
    await request(server)
      .post(notifications)
      .set(auth)
      .send({ kind: 'EMAIL', name: 'Team', recipientIds: [randomUUID()] })
      .expect(400);
    const email = await request(server)
      .post(notifications)
      .set(auth)
      .send({ kind: 'EMAIL', name: 'Team', recipientIds: [me.id], locale: 'es' })
      .expect(201);
    expect(email.body).toMatchObject({ buildFailed: true, buildSucceeded: false, previews: false });
    const listed = await request(server).get(notifications).set(auth).expect(200);
    expect(JSON.stringify(listed.body)).not.toContain('https://hooks.example.com');
    expect(JSON.stringify(listed.body)).not.toContain('cqn_');
    await request(server)
      .patch(`${notifications}/${hook.body.id as string}`)
      .set(auth)
      .send({ enabled: false })
      .expect(200);
    const sent = vi.spyOn(app.get(MailService), 'send');
    const tested = await request(server)
      .post(`${notifications}/${email.body.id as string}/test`)
      .set(auth)
      .expect(200);
    expect(tested.body).toEqual({ ok: true, error: null });
    expect(sent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        to: owner.email,
        subject: expect.stringContaining('test message'),
      }),
    );
    sent.mockClear();

    // "Deploy again", cancel, and a running build whose agent goes quiet.
    const manual = await request(server)
      .post(`/v1/cloud/projects/${projectId}/builds`)
      .set(auth)
      .send({})
      .expect(201);
    expect(manual.body).toMatchObject({ trigger: 'manual', commit: sha(9), status: 'QUEUED' });
    await request(server)
      .post(`/v1/cloud/projects/${projectId}/builds/${manual.body.number as number}/cancel`)
      .set(auth)
      .expect(200);
    await request(server)
      .post('/v1/cloud/builder/claim')
      .set(builder)
      .send({ builder: 'b1' })
      .expect(204);

    // The dependency cache: fresh for a build asked "without cache", off while the disk is full.
    const bare = await request(server)
      .post(`/v1/cloud/projects/${projectId}/builds`)
      .set(auth)
      .send({ noCache: true })
      .expect(201);
    expect(bare.body).toMatchObject({ noCache: true, status: 'QUEUED' });
    expect(manual.body.noCache).toBe(false);
    const claimedBare = await request(server)
      .post('/v1/cloud/builder/claim')
      .set(builder)
      .send({ builder: 'b1' })
      .expect(200);
    expect(claimedBare.body.build.cache).toEqual({
      key: `${projectId}/production-node22`,
      fresh: true,
    });
    await request(server)
      .post(`/v1/cloud/projects/${projectId}/builds/${bare.body.number as number}/cancel`)
      .set(auth)
      .expect(200);
    const full = vi.spyOn(app.get(CloudDiskService), 'full', 'get').mockReturnValue(true);
    const again = await request(server)
      .post(`/v1/cloud/projects/${projectId}/builds`)
      .set(auth)
      .send({ branch: 'header' })
      .expect(201);
    expect(again.body.noCache).toBe(false);
    const claimedFull = await request(server)
      .post('/v1/cloud/builder/claim')
      .set(builder)
      .send({ builder: 'b1' })
      .expect(200);
    expect(claimedFull.body.build.cache).toBeNull();
    full.mockRestore();
    await request(server)
      .post(`/v1/cloud/projects/${projectId}/builds/${again.body.number as number}/cancel`)
      .set(auth)
      .expect(200);

    await send('push', { ...push, after: sha(4), head_commit: { message: 'More' } });
    const third = await request(server)
      .post('/v1/cloud/builder/claim')
      .set(builder)
      .send({ builder: 'b1' })
      .expect(200);
    await builds.failStale(new Date(Date.now() + 3 * 60_000));
    const stale = await prisma.cloudBuild.findUniqueOrThrow({
      where: { id: third.body.build.id as string },
    });
    expect(stale).toMatchObject({ status: 'FAILED', error: 'The build server stopped answering' });
    await vi.waitFor(() =>
      expect(sent).toHaveBeenCalledWith(
        expect.objectContaining({
          to: owner.email,
          subject: expect.stringContaining(`#${stale.number}`),
        }),
      ),
    );
    const channel = await prisma.cloudNotifyChannel.findUniqueOrThrow({
      where: { id: email.body.id as string },
    });
    expect(channel).toMatchObject({ lastOk: true, failures: 0 });
    await request(server)
      .post(`/v1/cloud/builder/builds/${third.body.build.id as string}/heartbeat`)
      .set(builder)
      .expect(409);

    // ── Production lock after a rollback (architecture 4.13): while locked, a production build
    // deploys as a preview; after an unlock the next one goes live as usual.
    const host = join(root, 'hosts', `bp-${tag}`);
    const projectUrl = `/v1/cloud/projects/${projectId}`;
    const before = await request(server).get(projectUrl).set(auth).expect(200);
    const productionBefore = before.body.production as { id: string };
    expect(productionBefore).toBeTruthy();
    const linkBefore = await readlink(host);
    await prisma.cloudProject.update({
      where: { id: projectId },
      data: { productionLockedAt: new Date() },
    });
    const buildOnMain = async (commit: string, html: string) => {
      await send('push', { ...push, after: commit, head_commit: { message: `Release ${html}` } });
      const job = await request(server)
        .post('/v1/cloud/builder/claim')
        .set(builder)
        .send({ builder: 'b1' })
        .expect(200);
      const id = job.body.build.id as string;
      expect(job.body.build.commit).toBe(commit);
      await request(server)
        .post(`/v1/cloud/builder/builds/${id}/log`)
        .set(builder)
        .send({ text: 'npm run build' }) // no newline at the end: the lock's line starts a new one
        .expect(204);
      const out = await mkdtemp(join(tmpdir(), 'cq-build-out-'));
      await writeFile(join(out, 'index.html'), html);
      const file = join(tmpdir(), `cq-build-${randomUUID()}.tar.gz`);
      await create({ gzip: true, file, cwd: out, portable: true }, ['.']);
      await request(server)
        .post(`/v1/cloud/builder/builds/${id}/finish`)
        .set(builder)
        .field('status', 'succeeded')
        .attach('bundle', file)
        .expect(204);
      await rm(out, { recursive: true, force: true });
      const row = await prisma.cloudBuild.findUniqueOrThrow({ where: { id } });
      return (await request(server).get(`${projectUrl}/builds/${row.number}`).set(auth).expect(200))
        .body as {
        status: string;
        target: string;
        keptAsPreview: boolean;
        log: string;
        deploymentId: string;
      };
    };

    const kept = await buildOnMain(sha(5), '<h1>locked</h1>');
    expect(kept).toMatchObject({ status: 'SUCCEEDED', target: 'production', keptAsPreview: true });
    expect(kept.log).toBe(`npm run build\n${LOCKED_BUILD_LOG_LINE}\n`);
    expect(await readlink(host)).toBe(linkBefore);
    const stillLocked = await request(server).get(projectUrl).set(auth).expect(200);
    expect(stillLocked.body.production.id).toBe(productionBefore.id);
    expect(stillLocked.body.productionLock).toMatchObject({ at: expect.any(String), by: null });
    const keptDeployment = await request(server)
      .get(`${projectUrl}/deployments/${kept.deploymentId}`)
      .set(auth)
      .expect(200);
    expect(keptDeployment.body).toMatchObject({ target: 'production', isProduction: false });
    const previewUrl = `https://bp-${tag}--${keptDeployment.body.shortId as string}.cloud.test`;
    expect(keptDeployment.body.url).toBe(previewUrl);
    // GitHub's commit status links the preview and says production is locked.
    await vi.waitFor(() =>
      expect(github.setStatus).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'ada-labs/site',
        sha(5),
        'success',
        'Preview ready (production is locked after a rollback)',
        previewUrl,
      ),
    );

    const unlocked = await request(server)
      .post(`${projectUrl}/production/unlock`)
      .set(auth)
      .expect(200);
    expect(unlocked.body).toMatchObject({
      production: { id: productionBefore.id },
      productionLock: null,
    });
    const live = await buildOnMain(sha(6), '<h1>live</h1>');
    expect(live).toMatchObject({ status: 'SUCCEEDED', target: 'production', keptAsPreview: false });
    expect(live.log).not.toContain(LOCKED_BUILD_LOG_LINE);
    expect(await readFile(join(host, 'index.html'), 'utf8')).toBe('<h1>live</h1>');
    const published = await request(server).get(projectUrl).set(auth).expect(200);
    expect(published.body.production.id).toBe(live.deploymentId);

    // Uninstalling the app disconnects the project.
    await send('installation', { action: 'deleted', installation });
    const after = await request(server)
      .get(`/v1/cloud/projects/${projectId}/git`)
      .set(auth)
      .expect(200);
    expect(after.body).toMatchObject({ repo: null, installationId: null });
  });
});
