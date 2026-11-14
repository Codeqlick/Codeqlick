import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { create } from 'tar';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AppConfigService } from '../src/config/app-config.service.js';
import { Role } from '../src/generated/prisma/client.js';
import { CloudBuildsRepository } from '../src/modules/cloud/cloud-builds.repository.js';
import { CloudBuildsService } from '../src/modules/cloud/cloud-builds.service.js';
import { CLOUD_TERMS_VERSION } from '../src/modules/cloud/cloud-plans.js';
import { GithubClient, GithubError } from '../src/modules/cloud/github.client.js';
import { MailService } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const tag = randomUUID().slice(0, 8);
const password = 'cloud-rebuild-password-1';
const owner = { email: `e2e-cr-owner-${tag}@codeqlick.test`, password };
const BUILDER = 'builder-token-for-tests-0123456789';
const INSTALLATION = 5252000 + Math.floor(Math.random() * 1000);
const REPO = 888000 + Math.floor(Math.random() * 1000);
const HEAD = 'c'.repeat(40);
const WEBHOOK_SECRET = 'webhook-secret-for-tests';

/** GitHub, as the tests want it. */
const github = {
  configured: true,
  installationToken: vi.fn(() => Promise.resolve('ghs_installation_token')),
  userToken: vi.fn(() => Promise.resolve('ghu_user')),
  userInstallationIds: vi.fn(() => Promise.resolve([INSTALLATION])),
  installation: vi.fn(() =>
    Promise.resolve({ login: 'ada-labs', type: 'Organization', suspended: false }),
  ),
  repositories: vi.fn(() =>
    Promise.resolve([
      { id: REPO, fullName: 'ada-labs/cms-site', defaultBranch: 'main', private: true },
    ]),
  ),
  branchHead: vi.fn(() => Promise.resolve({ sha: HEAD, message: 'Content', author: 'Ada' })),
  setStatus: vi.fn(() => Promise.resolve()),
  upsertComment: vi.fn(() => Promise.resolve(1n)),
};

describe('Codeqlick Cloud scheduled rebuilds (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'cq-cloud-rebuild-'));
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
      await prisma.cloudTeam.deleteMany({ where: { slug: `r-${tag}` } });
      await prisma.cloudProject.deleteMany({ where: { slug: `rp-${tag}` } });
      await prisma.cloudGitInstallation.deleteMany({
        where: { installationId: BigInt(INSTALLATION) },
      });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('rebuilds on a schedule once per run, and switches off after five failures in a row', async () => {
    const server = app.getHttpServer();
    const builds = app.get(CloudBuildsService);
    const login = await request(server).post('/v1/auth/login').send(owner).expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
    const builder = { Authorization: `Bearer ${BUILDER}` };
    const team = `r-${tag}`;
    await request(server)
      .post('/v1/cloud/teams')
      .set(auth)
      .send({ name: 'Rebuilds', slug: team, acceptTerms: true, termsVersion: CLOUD_TERMS_VERSION })
      .expect(201);
    const created = await request(server)
      .post(`/v1/cloud/teams/${team}/projects`)
      .set(auth)
      .send({ name: 'CMS site', slug: `rp-${tag}` })
      .expect(201);
    const projectId = created.body.id as string;
    expect(created.body.rebuild).toEqual({
      frequency: 'off',
      minute: null,
      hour: null,
      weekday: null,
      nextAt: null,
      failures: 0,
    });
    const schedule = `/v1/cloud/projects/${projectId}/rebuild-schedule`;

    // ── Validation, and a project without Git can't be scheduled.
    for (const body of [
      {},
      { frequency: 'never' },
      { frequency: 'hourly' },
      { frequency: 'hourly', minute: 60 },
      { frequency: 'daily', minute: 0 },
      { frequency: 'daily', minute: 0, hour: 24 },
      { frequency: 'weekly', minute: 0, hour: 9 },
      { frequency: 'weekly', minute: 0, hour: 9, weekday: 8 },
      { frequency: 'HOURLY', minute: 5 },
    ]) {
      await request(server).put(schedule).set(auth).send(body).expect(400);
    }
    await request(server)
      .put(schedule)
      .set(auth)
      .send({ frequency: 'hourly', minute: 5 })
      .expect(409);

    // ── Connect GitHub (as the console does) and schedule hourly rebuilds at :05.
    const install = await request(server)
      .get(`/v1/cloud/github/install-url?teamSlug=${team}`)
      .set(auth)
      .expect(200);
    const state = new URL(install.body.url as string).searchParams.get('state')!;
    await request(server)
      .post('/v1/cloud/github/installations')
      .set(auth)
      .send({ installationId: INSTALLATION, code: 'good', state })
      .expect(201);
    await request(server)
      .put(`/v1/cloud/projects/${projectId}/git`)
      .set(auth)
      .send({ installationId: INSTALLATION, repoId: REPO, branch: 'main' })
      .expect(200);
    const before = Date.now();
    const set = await request(server)
      .put(schedule)
      .set(auth)
      .send({ frequency: 'hourly', minute: 5, hour: 3 })
      .expect(200);
    expect(set.body).toMatchObject({
      id: projectId,
      rebuild: { frequency: 'hourly', minute: 5, hour: null, weekday: null, failures: 0 },
    });
    const nextAt = new Date(set.body.rebuild.nextAt as string);
    expect(nextAt.getTime()).toBeGreaterThan(before);
    expect(nextAt.getTime()).toBeLessThanOrEqual(before + 3_600_000);
    expect(nextAt.getUTCMinutes()).toBe(5);
    const fetched = await request(server)
      .get(`/v1/cloud/projects/${projectId}`)
      .set(auth)
      .expect(200);
    expect(fetched.body.rebuild).toEqual(set.body.rebuild);
    const event = await prisma.cloudEvent.findFirst({
      where: { team: { slug: team }, action: 'rebuild.scheduled' },
    });
    expect(event?.details).toMatchObject({ frequency: 'hourly', minute: 5 });

    // ── Not due yet: nothing happens.
    await builds.runScheduled();
    expect(await prisma.cloudBuild.count({ where: { projectId } })).toBe(0);

    const makeDue = () =>
      prisma.cloudProject.update({
        where: { id: projectId },
        data: { rebuildNextAt: new Date(Date.now() - 60_000) },
      });
    const project = () => prisma.cloudProject.findUniqueOrThrow({ where: { id: projectId } });

    // ── Due: two runs at once (two API processes) queue one production build of the latest commit.
    await makeDue();
    await Promise.all([builds.runScheduled(), builds.runScheduled()]);
    const list = await request(server)
      .get(`/v1/cloud/projects/${projectId}/builds`)
      .set(auth)
      .expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({
      trigger: 'schedule',
      target: 'production',
      branch: 'main',
      commit: HEAD,
      status: 'QUEUED',
    });
    const moved = await project();
    expect(moved.rebuildNextAt!.getTime()).toBeGreaterThan(Date.now());
    expect(moved.rebuildNextAt!.getUTCMinutes()).toBe(5);
    await builds.runScheduled();
    expect(await prisma.cloudBuild.count({ where: { projectId } })).toBe(1);

    // ── Due again while that build is still queued: the run is skipped, and the time moves on.
    await makeDue();
    await builds.runScheduled();
    expect(await prisma.cloudBuild.count({ where: { projectId } })).toBe(1);
    expect((await project()).rebuildNextAt!.getTime()).toBeGreaterThan(Date.now());

    // ── The build server runs scheduled builds like any other.
    const dist = await mkdtemp(join(tmpdir(), 'cq-rebuild-out-'));
    await writeFile(join(dist, 'index.html'), '<h1>fresh content</h1>');
    const bundle = join(tmpdir(), `cq-rebuild-${randomUUID()}.tar.gz`);
    const runOne = async (outcome: 'failed' | 'succeeded') => {
      const claimed = await request(server)
        .post('/v1/cloud/builder/claim')
        .set(builder)
        .send({ builder: 'b1' })
        .expect(200);
      expect(claimed.body.build.commit).toBe(HEAD);
      const finish = request(server)
        .post(`/v1/cloud/builder/builds/${claimed.body.build.id as string}/finish`)
        .set(builder)
        .field('status', outcome);
      if (outcome === 'failed') await finish.field('error', 'The CMS answered 500').expect(204);
      else {
        await create({ gzip: true, file: bundle, cwd: dist, portable: true }, ['.']);
        await finish.attach('bundle', bundle).expect(204);
      }
    };
    const sent = vi.spyOn(app.get(MailService), 'send');
    const switchedOffEmails = () =>
      sent.mock.calls.filter(([message]) =>
        message.subject.startsWith('Scheduled builds switched off'),
      );

    // A failure counts; a success resets the count.
    await runOne('failed');
    expect((await project()).rebuildFailures).toBe(1);
    await makeDue();
    await builds.runScheduled();
    await runOne('succeeded');
    expect((await project()).rebuildFailures).toBe(0);

    // Five failures in a row switch the schedule off and email the admins once.
    for (let i = 1; i <= 5; i++) {
      await makeDue();
      await builds.runScheduled();
      await runOne('failed');
      const row = await project();
      expect(row.rebuildFailures).toBe(i);
      expect(row.rebuildFrequency).toBe(i < 5 ? 'HOURLY' : 'OFF');
    }
    expect((await project()).rebuildNextAt).toBeNull();
    expect(switchedOffEmails()).toHaveLength(1);
    expect(switchedOffEmails()[0]![0]).toMatchObject({
      to: owner.email,
      text: expect.stringContaining('The CMS answered 500'),
    });
    const off = await request(server).get(`/v1/cloud/projects/${projectId}`).set(auth).expect(200);
    expect(off.body.rebuild).toMatchObject({ frequency: 'off', nextAt: null, failures: 5 });
    expect(
      await prisma.cloudEvent.count({
        where: { team: { slug: team }, action: 'rebuild.switched_off' },
      }),
    ).toBe(1);
    // Switched off: nothing runs any more.
    await builds.runScheduled();
    expect(await prisma.cloudBuild.count({ where: { projectId, status: 'QUEUED' } })).toBe(0);

    // ── Scheduling again resets the failures.
    const hourly = await request(server)
      .put(schedule)
      .set(auth)
      .send({ frequency: 'hourly', minute: 5 })
      .expect(200);
    expect(hourly.body.rebuild).toMatchObject({ frequency: 'hourly', failures: 0 });

    // A canceled scheduled build doesn't count.
    await makeDue();
    await builds.runScheduled();
    const queued = await prisma.cloudBuild.findFirstOrThrow({
      where: { projectId, status: 'QUEUED' },
    });
    await request(server)
      .post(`/v1/cloud/projects/${projectId}/builds/${queued.number}/cancel`)
      .set(auth)
      .expect(200);
    expect((await project()).rebuildFailures).toBe(0);

    // One refused because the month's builds ran out counts as failed.
    vi.spyOn(app.get(CloudBuildsRepository), 'countBuildsSince').mockResolvedValueOnce(1_000_000);
    await makeDue();
    await builds.runScheduled();
    const refused = await prisma.cloudBuild.findFirstOrThrow({
      where: { projectId, trigger: 'SCHEDULE' },
      orderBy: { number: 'desc' },
    });
    expect(refused).toMatchObject({ status: 'FAILED', error: expect.stringContaining('builds') });
    expect((await project()).rebuildFailures).toBe(1);

    // A branch GitHub can't read (deleted, or the installation suspended) is a failed run too:
    // five in a row switch the schedule off with one email that says why.
    await request(server)
      .put(schedule)
      .set(auth)
      .send({ frequency: 'hourly', minute: 5 })
      .expect(200);
    sent.mockClear();
    github.branchHead.mockRejectedValue(new GithubError(404, 'Not Found'));
    const buildsBefore = await prisma.cloudBuild.count({ where: { projectId } });
    for (let i = 1; i <= 5; i++) {
      await makeDue();
      await builds.runScheduled();
      const row = await project();
      expect(row.rebuildFailures).toBe(i);
      expect(row.rebuildFrequency).toBe(i < 5 ? 'HOURLY' : 'OFF');
    }
    expect(await prisma.cloudBuild.count({ where: { projectId } })).toBe(buildsBefore);
    expect(switchedOffEmails()).toHaveLength(1);
    expect(switchedOffEmails()[0]![0].text).toContain(
      "The branch main couldn't be read from GitHub",
    );
    github.branchHead.mockResolvedValue({ sha: HEAD, message: 'Content', author: 'Ada' });

    // ── Disconnecting Git switches it off.
    const weekly = await request(server)
      .put(schedule)
      .set(auth)
      .send({ frequency: 'weekly', minute: 30, hour: 7, weekday: 1 })
      .expect(200);
    expect(weekly.body.rebuild).toMatchObject({
      frequency: 'weekly',
      minute: 30,
      hour: 7,
      weekday: 1,
      failures: 0,
    });
    expect(weekly.body.rebuild.nextAt).not.toBeNull();
    await request(server).delete(`/v1/cloud/projects/${projectId}/git`).set(auth).expect(204);
    const disconnected = await project();
    expect(disconnected).toMatchObject({ rebuildFrequency: 'OFF', rebuildNextAt: null });
    await request(server)
      .put(schedule)
      .set(auth)
      .send({ frequency: 'daily', minute: 0, hour: 6 })
      .expect(409);

    // ── So does GitHub removing the repository from the installation.
    await request(server)
      .put(`/v1/cloud/projects/${projectId}/git`)
      .set(auth)
      .send({ installationId: INSTALLATION, repoId: REPO, branch: 'main' })
      .expect(200);
    await request(server)
      .put(schedule)
      .set(auth)
      .send({ frequency: 'daily', minute: 0, hour: 6 })
      .expect(200);
    const removal = JSON.stringify({
      action: 'removed',
      installation: { id: INSTALLATION },
      repositories_removed: [{ id: REPO }],
    });
    await request(server)
      .post('/v1/cloud/github/webhook')
      .set({
        'X-GitHub-Event': 'installation_repositories',
        'X-GitHub-Delivery': randomUUID(),
        'X-Hub-Signature-256': `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(removal).digest('hex')}`,
        'Content-Type': 'application/json',
      })
      .send(removal)
      .expect(202);
    expect(await project()).toMatchObject({
      gitRepo: null,
      rebuildFrequency: 'OFF',
      rebuildNextAt: null,
    });

    await rm(dist, { recursive: true, force: true });
    await rm(bundle, { force: true });
  });
});
