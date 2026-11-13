import 'reflect-metadata';
import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AppConfigService } from '../src/config/app-config.service.js';
import { Role } from '../src/generated/prisma/client.js';
import { CLOUD_PLANS, CLOUD_TERMS_VERSION } from '../src/modules/cloud/cloud-plans.js';
import { GithubClient, GithubError } from '../src/modules/cloud/github.client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const tag = randomUUID().slice(0, 8);
const password = 'cloud-hooks-password-1';
const person = (who: string) => ({ email: `e2e-ch-${who}-${tag}@codeqlick.test`, password });
const owner = person('owner');
const admin = person('admin');
const member = person('member');
const outsider = person('outsider');
const INSTALLATION = 5242000 + Math.floor(Math.random() * 1000);
const REPO = 887000 + Math.floor(Math.random() * 1000);
const OTHER_REPO = REPO + 1;
const sha = (n: number) => n.toString(16).padStart(40, 'b');
/** Where the CMS's calls come from; the event keeps it. */
const CMS_IP = '203.0.113.5';
const hookToken = () => `cqd_${randomBytes(32).toString('base64url')}`;

let heads = 0;
/** GitHub, as the tests want it: the branches `nope` and `gone` don't exist. */
const github = {
  configured: true,
  statuses: [] as Array<{ sha: string; state: string; url: string }>,
  installationToken: vi.fn(() => Promise.resolve('ghs_installation_token')),
  repositories: vi.fn(() =>
    Promise.resolve([
      { id: REPO, fullName: 'ada-labs/site', defaultBranch: 'main', private: true },
      { id: OTHER_REPO, fullName: 'ada-labs/other', defaultBranch: 'main', private: true },
    ]),
  ),
  branchHead: vi.fn((_i: unknown, _r: unknown, _f: string, branch: string) =>
    branch === 'nope' || branch === 'gone'
      ? Promise.reject(new GithubError(404, 'Not Found'))
      : Promise.resolve({ sha: sha(++heads), message: `CMS change ${heads}`, author: 'Ada' }),
  ),
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
  upsertComment: vi.fn(() => Promise.resolve(99n)),
};

describe('Codeqlick Cloud deploy hooks (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let root: string;
  let teamId: string;
  let projectId: string;
  let bareProjectId: string;
  let auth: Record<string, string>;
  let adminAuth: Record<string, string>;
  let memberAuth: Record<string, string>;
  let outsiderAuth: Record<string, string>;
  const team = `h-${tag}`;
  const hooks = () => `/v1/cloud/projects/${projectId}/hooks`;

  /** Every management call comes from its own address, so the rate limits never meet. */
  let hop = 0;
  const as = (
    method: 'get' | 'post' | 'put' | 'delete',
    url: string,
    who: Record<string, string>,
  ) =>
    request(app.getHttpServer())
      [method](url)
      .set({ ...who, 'X-Forwarded-For': `10.9.${Math.floor(hop / 250)}.${(hop++ % 250) + 1}` });

  const make = (name: string, branch?: string, who = adminAuth) =>
    as('post', hooks(), who).send({ name, ...(branch ? { branch } : {}) });

  /** What a CMS does: call the hook's URL with whatever payload it likes. */
  const call = (token: string, ip = CMS_IP) =>
    request(app.getHttpServer())
      .post(`/v1/cloud/hooks/${token}`)
      .set('X-Forwarded-For', ip)
      .send({ entry: { title: 'A post' }, event: 'entry.publish' });

  const tokenOf = (url: string) => url.slice(url.lastIndexOf('/') + 1);
  const hookEvents = (label: string, action = 'deploy_hook.called') =>
    prisma.cloudEvent.findMany({
      where: { teamId, action, targetLabel: label },
      orderBy: { createdAt: 'asc' },
    });
  const build = (number: number) =>
    prisma.cloudBuild.findUniqueOrThrow({
      where: { projectId_number: { projectId, number } },
    });

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'cq-cloud-hooks-'));
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
    vi.spyOn(app.get(AppConfigService), 'cloudHosting', 'get').mockReturnValue({
      domain: 'cloud.test',
      root,
    });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    for (const [who, name] of [
      [owner, 'Ada'],
      [admin, 'Grace'],
      [member, 'Linus'],
      [outsider, 'Mallory'],
    ] as const) {
      await prisma.user.create({
        data: {
          email: who.email,
          name,
          role: Role.CLIENT,
          passwordHash,
          registeredAt: new Date(),
        },
      });
    }
    const login = async (who: { email: string; password: string }) => ({
      Authorization: `Bearer ${
        (await as('post', '/v1/auth/login', {}).send(who).expect(200)).body.accessToken as string
      }`,
    });
    auth = await login(owner);
    adminAuth = await login(admin);
    memberAuth = await login(member);
    outsiderAuth = await login(outsider);

    await as('post', '/v1/cloud/teams', auth)
      .send({
        name: 'Hooks',
        slug: team,
        acceptTerms: true,
        termsVersion: CLOUD_TERMS_VERSION,
      })
      .expect(201);
    const row = await prisma.cloudTeam.findUniqueOrThrow({ where: { slug: team } });
    teamId = row.id;
    for (const [who, role] of [
      [admin, 'ADMIN'],
      [member, 'MEMBER'],
    ] as const) {
      const user = await prisma.user.findUniqueOrThrow({ where: { email: who.email } });
      await prisma.cloudMember.create({
        data: {
          teamId,
          userId: user.id,
          role,
          termsVersion: CLOUD_TERMS_VERSION,
          termsAcceptedAt: new Date(),
        },
      });
    }
    const ownerRow = await prisma.user.findUniqueOrThrow({ where: { email: owner.email } });
    await prisma.cloudGitInstallation.create({
      data: {
        installationId: BigInt(INSTALLATION),
        teamId,
        accountLogin: 'ada-labs',
        accountType: 'Organization',
        createdById: ownerRow.id,
      },
    });
    projectId = (
      await as('post', `/v1/cloud/teams/${team}/projects`, auth)
        .send({ name: 'Site', slug: `hp-${tag}` })
        .expect(201)
    ).body.id as string;
    bareProjectId = (
      await as('post', `/v1/cloud/teams/${team}/projects`, auth)
        .send({ name: 'Bare', slug: `hn-${tag}` })
        .expect(201)
    ).body.id as string;
    await connect(REPO);
  });

  const connect = (repoId: number) =>
    as('put', `/v1/cloud/projects/${projectId}/git`, auth)
      .send({ installationId: INSTALLATION, repoId, branch: 'main' })
      .expect(200);

  afterAll(async () => {
    if (prisma) {
      await prisma.cloudTeam.deleteMany({ where: { slug: team } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('lists, makes and deletes hooks: admins make them, members read, outsiders see nothing', async () => {
    // A project without a repository has no hooks to make.
    await as('get', `/v1/cloud/projects/${bareProjectId}/hooks`, auth)
      .expect(200)
      .expect({ items: [] });
    await as('post', `/v1/cloud/projects/${bareProjectId}/hooks`, auth)
      .send({ name: 'cms' })
      .expect(409);

    // Outsiders can't tell the project exists; members read but don't make.
    await as('get', hooks(), outsiderAuth).expect(404);
    await make('cms', undefined, outsiderAuth).expect(404);
    await make('cms', undefined, memberAuth).expect(403);
    await as('get', hooks(), memberAuth).expect(200).expect({ items: [] });

    // Invalid input.
    await make('').expect(400);
    await make('x'.repeat(61)).expect(400);
    await make('cms', 'bad branch').expect(400);
    await make('cms', 'nope').expect(400); // not in the repository

    // An admin makes one on the production branch; the URL is shown once.
    const created = await make('cms').expect(201);
    expect(created.body).toMatchObject({
      name: 'cms',
      branch: 'main',
      lastCalledAt: null,
      createdBy: { name: 'Grace' },
    });
    expect(created.body.url).toMatch(
      /^https:\/\/api\.codeqlick\.com\/v1\/cloud\/hooks\/cqd_[A-Za-z0-9_-]{43}$/,
    );
    const token = tokenOf(created.body.url as string);
    expect(created.body.prefix).toBe(token.slice(0, 12));

    // Only the hash is kept, and the list never shows the URL again.
    const stored = await prisma.cloudDeployHook.findUniqueOrThrow({
      where: { id: created.body.id as string },
    });
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(token);
    const listed = await as('get', hooks(), memberAuth).expect(200);
    expect(listed.body.items).toHaveLength(1);
    expect(listed.body.items[0]).toMatchObject({
      id: created.body.id,
      name: 'cms',
      branch: 'main',
    });
    expect(listed.body.items[0].url).toBeUndefined();
    expect(JSON.stringify(listed.body)).not.toContain(token);

    // A name is used once per project.
    await make('cms').expect(409);
    await make('preview', 'staging').expect(201);

    // Up to 5 on every plan.
    expect(CLOUD_PLANS.FREE.deployHooksPerProject).toBe(5);
    await make('three').expect(201);
    await make('four').expect(201);
    const fifth = await make('five').expect(201);
    await make('six').expect(409);

    // Events by the person who did it.
    const made = await prisma.cloudEvent.findMany({
      where: { teamId, action: 'deploy_hook.created', targetLabel: 'cms' },
    });
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ actorName: 'Grace', details: { branch: 'main' } });
    expect(made[0]?.actorId).toBeTruthy();

    // Deleting: outsiders and members can't; an admin revokes it at once.
    const url = `${hooks()}/${fifth.body.id as string}`;
    await as('delete', url, outsiderAuth).expect(404);
    await as('delete', url, memberAuth).expect(403);
    await as('delete', url, adminAuth).expect(204);
    await as('delete', url, adminAuth).expect(404);
    await call(tokenOf(fifth.body.url as string)).expect(404);
    expect(await hookEvents('five', 'deploy_hook.deleted')).toHaveLength(1);
    expect((await as('get', hooks(), adminAuth).expect(200)).body.items).toHaveLength(4);
  });

  it('answers a call with 202 and a queued HOOK build, canceling the older queued ones', async () => {
    // The first test's tokens weren't kept: make fresh hooks whose tokens we hold.
    await prisma.cloudDeployHook.deleteMany({
      where: { projectId, name: { in: ['cms', 'preview'] } },
    });
    const cmsToken = tokenOf((await make('cms').expect(201)).body.url as string);
    const previewToken = tokenOf((await make('preview', 'staging').expect(201)).body.url as string);

    // Unknown tokens and tokens of another shape: 404 and nothing recorded.
    await call(hookToken()).expect(404);
    await call('cqd_short').expect(404);
    await call(`cqk_${'a'.repeat(43)}`).expect(404);
    expect(await hookEvents('cms')).toHaveLength(0);
    // The call is POST only.
    await request(app.getHttpServer()).get(`/v1/cloud/hooks/${cmsToken}`).expect(404);

    // A valid call: the payload is ignored and a production build is queued.
    const first = await call(cmsToken).expect(202);
    expect(first.body).toMatchObject({ build: { status: 'QUEUED' } });
    const firstNumber = first.body.build.number as number;
    expect(first.body.build.url).toMatch(new RegExp(`/builds/${firstNumber}$`));
    expect(await build(firstNumber)).toMatchObject({
      trigger: 'HOOK',
      hookName: 'cms',
      createdById: null,
      target: 'PRODUCTION',
      branch: 'main',
      status: 'QUEUED',
      commitMessage: expect.stringContaining('CMS change'),
      author: 'Ada',
    });
    expect(
      (await prisma.cloudDeployHook.findFirstOrThrow({ where: { projectId, name: 'cms' } }))
        .lastCalledAt,
    ).not.toBeNull();
    await vi.waitFor(() => expect(github.statuses.some((s) => s.state === 'pending')).toBe(true));

    // The builds list shows where it came from.
    const list = await as('get', `/v1/cloud/projects/${projectId}/builds`, memberAuth).expect(200);
    expect(list.body.items[0]).toMatchObject({
      number: firstNumber,
      trigger: 'hook',
      hookName: 'cms',
      target: 'production',
    });

    // A second call cancels the first queued build of that branch.
    const second = await call(cmsToken).expect(202);
    expect(second.body.build.number).toBe(firstNumber + 1);
    expect(await build(firstNumber)).toMatchObject({
      status: 'CANCELED',
      error: 'A newer commit replaced it',
    });
    expect(await build(firstNumber + 1)).toMatchObject({ status: 'QUEUED' });

    // Another branch is a preview, and cancels nothing of main's.
    const other = await call(previewToken).expect(202);
    expect(await build(other.body.build.number as number)).toMatchObject({
      trigger: 'HOOK',
      hookName: 'preview',
      target: 'PREVIEW',
      branch: 'staging',
    });
    expect(await build(firstNumber + 1)).toMatchObject({ status: 'QUEUED' });

    // Each call is a team event with no person, and the caller's address.
    const events = await hookEvents('cms');
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      actorId: null,
      actorName: 'Deploy hook cms',
      tokenName: null,
      ip: CMS_IP,
      details: { status: 202, build: firstNumber },
    });
    const shown = await as('get', `/v1/cloud/teams/${team}/events`, memberAuth).expect(200);
    expect(
      shown.body.items.some(
        (e: { action: string; actor: { id: string | null; name: string } }) =>
          e.action === 'deploy_hook.called' &&
          e.actor.id === null &&
          e.actor.name === 'Deploy hook cms',
      ),
    ).toBe(true);

    // A hook's builds keep its name after the hook is gone.
    const gone = await prisma.cloudDeployHook.findFirstOrThrow({
      where: { projectId, name: 'preview' },
    });
    await as('delete', `${hooks()}/${gone.id}`, adminAuth).expect(204);
    await call(previewToken).expect(404);
    expect(await build(other.body.build.number as number)).toMatchObject({ hookName: 'preview' });
    const afterwards = await as('get', `/v1/cloud/projects/${projectId}/builds`, auth).expect(200);
    expect(
      afterwards.body.items.find((b: { number: number }) => b.number === other.body.build.number),
    ).toMatchObject({ trigger: 'hook', hookName: 'preview' });
  });

  it('refuses a suspended project, a branch that is gone and a GitHub that is not set up', async () => {
    const token = hookToken();
    const row = await prisma.cloudDeployHook.create({
      data: {
        projectId,
        name: 'refusals',
        branch: 'main',
        prefix: token.slice(0, 12),
        tokenHash: createHash('sha256').update(token).digest('hex'),
      },
    });
    const before = await prisma.cloudBuild.count({ where: { projectId } });

    // Suspended: 403, no build, and the call is recorded.
    await prisma.cloudProject.update({
      where: { id: projectId },
      data: { suspendedAt: new Date() },
    });
    await call(token).expect(403);
    await prisma.cloudProject.update({ where: { id: projectId }, data: { suspendedAt: null } });

    // The branch was deleted in the repository: 409 with the reason.
    await prisma.cloudDeployHook.update({ where: { id: row.id }, data: { branch: 'gone' } });
    const conflict = await call(token).expect(409);
    expect(conflict.body.detail).toMatch(/branch/);
    await prisma.cloudDeployHook.update({ where: { id: row.id }, data: { branch: 'main' } });

    // GitHub's App not set up: 503.
    github.branchHead.mockImplementationOnce(() =>
      Promise.reject(new ServiceUnavailableException('Builds from Git are not set up yet')),
    );
    await call(token).expect(503);
    expect(await prisma.cloudBuild.count({ where: { projectId } })).toBe(before);

    const events = await hookEvents('refusals');
    expect(events.map((e) => (e.details as { status: number }).status)).toEqual([403, 409, 503]);
    expect(events.every((e) => e.actorId === null && e.ip === CMS_IP)).toBe(true);

    // A deleted project's hooks answer 404.
    await prisma.cloudProject.update({ where: { id: projectId }, data: { deletedAt: new Date() } });
    await call(token).expect(404);
    await prisma.cloudProject.update({ where: { id: projectId }, data: { deletedAt: null } });
    await prisma.cloudDeployHook.delete({ where: { id: row.id } });
  });

  it('records a build as failed when the month is used up, and answers 429', async () => {
    const token = tokenOf((await make('month').expect(201)).body.url as string);
    const used = await prisma.cloudBuild.count({
      where: { project: { teamId }, status: { not: 'CANCELED' } },
    });
    const limit = CLOUD_PLANS.FREE.buildsPerMonth;
    CLOUD_PLANS.FREE.buildsPerMonth = used;
    try {
      const refused = await call(token).expect(429);
      expect(refused.body.detail).toBe(`The team reached its ${used} builds this month`);
    } finally {
      CLOUD_PLANS.FREE.buildsPerMonth = limit;
    }
    const failed = await prisma.cloudBuild.findFirstOrThrow({
      where: { projectId, hookName: 'month' },
    });
    expect(failed).toMatchObject({
      trigger: 'HOOK',
      status: 'FAILED',
      error: `The team reached its ${used} builds this month`,
    });
    await vi.waitFor(() =>
      expect(github.statuses.some((s) => s.sha === failed.commit && s.state === 'failure')).toBe(
        true,
      ),
    );
    const events = await hookEvents('month');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorId: null,
      details: { status: 429, build: failed.number },
    });
    const hook = await prisma.cloudDeployHook.findFirstOrThrow({
      where: { projectId, name: 'month' },
    });
    await prisma.cloudDeployHook.delete({ where: { id: hook.id } });
  });

  it('allows a hook 10 calls a minute and an address 60, counting only calls that find something', async () => {
    const token = tokenOf((await make('burst').expect(201)).body.url as string);
    for (let n = 0; n < 10; n += 1) await call(token, '203.0.113.77').expect(202);
    const limited = await call(token, '203.0.113.77').expect(429);
    expect(limited.body.detail).toMatch(/Too many calls/);
    // Refused by the rate limit: no event, no build.
    expect(await hookEvents('burst')).toHaveLength(10);
    expect(await prisma.cloudBuild.count({ where: { projectId, hookName: 'burst' } })).toBe(10);
    // Only one of the ten stays queued: each call cancels the one before.
    expect(
      await prisma.cloudBuild.count({
        where: { projectId, hookName: 'burst', status: 'QUEUED' },
      }),
    ).toBe(1);

    // 60 calls an address makes across hooks, the 61st is refused, even for unknown tokens.
    const flood = '198.51.100.200';
    for (let n = 0; n < 60; n += 1) await call(hookToken(), flood).expect(404);
    await call(hookToken(), flood).expect(429);
    // Another address is not affected.
    await call(hookToken(), '198.51.100.201').expect(404);
  });

  it('deletes the hooks when the repository is disconnected or a different one is connected', async () => {
    const count = () => prisma.cloudDeployHook.count({ where: { projectId } });
    expect(await count()).toBeGreaterThan(0);

    // The same repository again (new settings): hooks stay.
    await as('put', `/v1/cloud/projects/${projectId}/git`, auth)
      .send({ installationId: INSTALLATION, repoId: REPO, branch: 'main', nodeVersion: '22' })
      .expect(200);
    expect(await count()).toBeGreaterThan(0);

    // A different repository: they go.
    await connect(OTHER_REPO);
    expect(await count()).toBe(0);
    expect((await as('get', hooks(), auth).expect(200)).body).toEqual({ items: [] });

    // Disconnecting: the hooks made on the new connection go too, and their URLs stop.
    await connect(REPO);
    const made = await make('after').expect(201);
    const token = tokenOf(made.body.url as string);
    await call(token).expect(202);
    await as('delete', `/v1/cloud/projects/${projectId}/git`, auth).expect(204);
    expect(await count()).toBe(0);
    await call(token).expect(404);
    await make('again').expect(409); // no repository any more

    // The project's builds keep the name of the hook that started them.
    expect(
      await prisma.cloudBuild.count({ where: { projectId, trigger: 'HOOK', hookName: 'after' } }),
    ).toBe(1);
  });
});
