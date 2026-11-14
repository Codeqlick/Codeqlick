import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AppConfigService } from '../src/config/app-config.service.js';
import { GithubClient } from '../src/modules/cloud/github.client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const tag = randomUUID().slice(0, 8);
const WEBHOOK_SECRET = 'webhook-secret-for-root-tests';
const INSTALLATION = 5252000 + Math.floor(Math.random() * 1000);
const REPO = 888000 + Math.floor(Math.random() * 1000);
const sha = (n: number) => n.toString(16).padStart(40, 'b');

/** GitHub, as the tests want it: no statuses or comments, a comparison the test sets. */
const github = {
  configured: false,
  compare: [] as string[] | null,
  compareFiles: vi.fn(() =>
    github.compare === null
      ? Promise.reject(new Error('GitHub answered 404'))
      : Promise.resolve(github.compare),
  ),
};

describe('Cloud builds only when the root folder changes (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let webId: string;
  let docsId: string;

  beforeAll(async () => {
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
    vi.spyOn(app.get(AppConfigService), 'githubApp', 'get').mockReturnValue({
      appId: '1',
      slug: 'codeqlick-cloud',
      clientId: 'Iv1.x',
      clientSecret: 'secret',
      privateKey: 'unused',
      webhookSecret: WEBHOOK_SECRET,
    });
    const team = await prisma.cloudTeam.create({ data: { slug: `rc-${tag}`, name: 'Monorepo' } });
    const git = {
      teamId: team.id,
      gitInstallationId: BigInt(INSTALLATION),
      gitRepoId: BigInt(REPO),
      gitRepo: 'ada-labs/monorepo',
      gitBranch: 'main',
    };
    // Two projects of one repository: only `web` skips changes outside its folder.
    webId = (
      await prisma.cloudProject.create({
        data: {
          ...git,
          slug: `rc-web-${tag}`,
          name: 'Web',
          rootDir: 'apps/web',
          onlyRootChanges: true,
        },
      })
    ).id;
    docsId = (
      await prisma.cloudProject.create({
        data: { ...git, slug: `rc-docs-${tag}`, name: 'Docs', rootDir: 'apps/docs' },
      })
    ).id;
  });

  afterAll(async () => {
    if (prisma) await prisma.cloudTeam.deleteMany({ where: { slug: `rc-${tag}` } });
    await app?.close();
  });

  it('skips pushes and pull requests outside the folder, and builds when unsure', async () => {
    const server = app.getHttpServer();
    const repository = { id: REPO, full_name: 'ada-labs/monorepo' };
    const installation = { id: INSTALLATION };
    const send = async (event: string, body: object) => {
      const raw = JSON.stringify(body);
      const signature = `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex')}`;
      await request(server)
        .post('/v1/cloud/github/webhook')
        .set({
          'X-GitHub-Event': event,
          'X-GitHub-Delivery': randomUUID(),
          'X-Hub-Signature-256': signature,
          'Content-Type': 'application/json',
        })
        .send(raw)
        .expect(202);
    };
    const push = (n: number, commits: object[] | undefined, extra: object = {}) =>
      send('push', {
        ref: 'refs/heads/main',
        after: sha(n),
        deleted: false,
        head_commit: { message: `Commit ${n}`, author: { name: 'Ada' } },
        ...(commits ? { commits } : {}),
        repository,
        installation,
        ...extra,
      });
    const commitsOf = async (projectId: string) =>
      (
        await prisma.cloudBuild.findMany({
          where: { projectId },
          orderBy: { number: 'asc' },
          select: { commit: true },
        })
      ).map((build) => build.commit);

    // Only the docs changed: web skips, docs builds.
    await push(1, [{ added: [], modified: ['apps/docs/index.md'], removed: [] }]);
    // A change inside web's folder (in the second commit of the push).
    await push(2, [
      { added: [], modified: ['README.md'], removed: [] },
      { added: ['apps/web/src/new.ts'], modified: [], removed: [] },
    ]);
    // `apps/web-old` is not `apps/web`.
    await push(3, [{ added: [], modified: ['apps/web-old/x.ts'], removed: [] }]);
    // Can't be sure: a forced push, or a delivery without commits.
    await push(4, [{ added: [], modified: ['README.md'], removed: [] }], { forced: true });
    await push(5, undefined);
    expect(await commitsOf(webId)).toEqual([sha(2), sha(4), sha(5)]);
    expect(await commitsOf(docsId)).toEqual([sha(1), sha(2), sha(3), sha(4), sha(5)]);

    const pullRequest = (n: number) =>
      send('pull_request', {
        action: 'synchronize',
        pull_request: {
          number: 40 + n,
          title: `PR ${n}`,
          head: { sha: sha(10 + n), ref: `feature-${n}`, repo: repository },
          base: { sha: sha(9), repo: repository },
        },
        repository,
        installation,
      });
    github.compare = ['apps/docs/guide.md'];
    await pullRequest(1);
    // A file renamed out of web's folder still counts.
    github.compare = ['lib/moved.ts', 'apps/web/moved.ts'];
    await pullRequest(2);
    // GitHub refused the comparison: build.
    github.compare = null;
    await pullRequest(3);
    expect(github.compareFiles).toHaveBeenCalledWith(
      BigInt(INSTALLATION),
      BigInt(REPO),
      'ada-labs/monorepo',
      sha(9),
      sha(11),
    );
    // Asked once per pull request, only for the project that needs it.
    expect(github.compareFiles).toHaveBeenCalledTimes(3);
    const previews = async (projectId: string) =>
      (
        await prisma.cloudBuild.findMany({
          where: { projectId, pullRequest: { not: null } },
          orderBy: { number: 'asc' },
          select: { pullRequest: true },
        })
      ).map((build) => build.pullRequest);
    expect(await previews(webId)).toEqual([42, 43]);
    expect(await previews(docsId)).toEqual([41, 42, 43]);
  });
});
