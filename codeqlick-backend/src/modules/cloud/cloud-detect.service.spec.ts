import { ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { CloudCtx } from './cloud-caller.js';
import type { CloudBuildsRepository } from './cloud-builds.repository.js';
import { CloudBuildsService } from './cloud-builds.service.js';
import type { CloudNotificationsService } from './cloud-notifications.service.js';
import type { CloudProjectsService } from './cloud-projects.service.js';
import type { CloudTeamsService } from './cloud-teams.service.js';
import { GithubError, type GithubClient, type GithubEntry } from './github.client.js';

const ctx = { user: { id: 'u1' } } as unknown as CloudCtx;
const TEAM_ID = 'team-1';
const INSTALLATION = 42;
const REPO = 7;

const file = (name: string, size = 100): GithubEntry => ({ name, type: 'file', size });

interface Setup {
  role?: 'ADMIN' | 'MEMBER';
  configured?: boolean;
  installationTeam?: string | null;
  entries?: GithubEntry[];
  files?: Record<string, string>;
  repoAccessError?: GithubError;
  listError?: GithubError;
}

function setup(options: Setup = {}) {
  const access = vi.fn((_ctx: CloudCtx, _slug: string, min?: string) =>
    min === 'ADMIN' && options.role === 'MEMBER'
      ? Promise.reject(new ForbiddenException('Only a team admin can do this'))
      : Promise.resolve({ teamId: TEAM_ID, role: options.role ?? 'ADMIN' }),
  );
  const installationTeam =
    options.installationTeam === undefined ? TEAM_ID : options.installationTeam;
  const installation = vi.fn(() =>
    Promise.resolve(installationTeam === null ? null : { teamId: installationTeam }),
  );
  const repoAccess = vi.fn((_installationId: number, _repoId: number) =>
    options.repoAccessError
      ? Promise.reject(options.repoAccessError)
      : Promise.resolve({ token: 'ghs_read', fullName: 'ada/site' }),
  );
  const listFolder = vi.fn((_token: string, _full: string, _path: string, _ref: string) =>
    options.listError
      ? Promise.reject(options.listError)
      : Promise.resolve(options.entries ?? [file('package.json')]),
  );
  const fileText = vi.fn((_token: string, _full: string, path: string, _ref: string) => {
    const text = options.files?.[path];
    return text === undefined
      ? Promise.reject(new GithubError(404, 'GitHub answered 404'))
      : Promise.resolve(text);
  });
  const github = {
    configured: options.configured ?? true,
    repoAccess,
    listFolder,
    fileText,
  };
  const config = {
    credentialsSecret: 'credentials-secret-for-unit-tests-0123456789',
    jwtAccessSecret: 'jwt-secret-for-unit-tests-0123456789',
    isTest: true,
  };
  const service = new CloudBuildsService(
    { installation } as unknown as CloudBuildsRepository,
    {} as CloudProjectsService,
    { access } as unknown as CloudTeamsService,
    github as unknown as GithubClient,
    config as unknown as AppConfigService,
    {} as CloudNotificationsService,
  );
  const githubCalls = () =>
    repoAccess.mock.calls.length + listFolder.mock.calls.length + fileText.mock.calls.length;
  return { service, access, installation, repoAccess, listFolder, fileText, githubCalls };
}

const query = (overrides: Partial<{ rootDir: string; branch: string }> = {}) => ({
  installationId: INSTALLATION,
  repoId: REPO,
  branch: 'main',
  rootDir: '',
  ...overrides,
});

describe('CloudBuildsService.detect', () => {
  it('suggests settings from the root folder', async () => {
    const { service, access, repoAccess, listFolder } = setup({
      entries: [file('package.json'), file('.nvmrc'), { name: 'src', type: 'dir', size: 0 }],
      files: {
        'package.json': JSON.stringify({ devDependencies: { astro: '5' } }),
        '.nvmrc': 'v22.11.0\n',
      },
    });
    await expect(service.detect(ctx, 'ada', query())).resolves.toEqual({
      framework: 'astro',
      buildCommand: 'npx astro build',
      outputDir: 'dist',
      nodeVersion: '22',
      nodeFrom: '.nvmrc',
      notes: [],
    });
    expect(access).toHaveBeenCalledWith(ctx, 'ada', 'ADMIN');
    expect(repoAccess).toHaveBeenCalledWith(INSTALLATION, REPO);
    expect(listFolder).toHaveBeenCalledWith('ghs_read', 'ada/site', '', 'main');
  });

  it('is for team admins only', async () => {
    const { service, githubCalls } = setup({ role: 'MEMBER' });
    await expect(service.detect(ctx, 'ada', query())).rejects.toBeInstanceOf(ForbiddenException);
    expect(githubCalls()).toBe(0);
  });

  it('refuses an installation of another team, or an unknown one', async () => {
    for (const installationTeam of ['team-2', null]) {
      const { service, githubCalls } = setup({ installationTeam });
      await expect(service.detect(ctx, 'ada', query())).rejects.toBeInstanceOf(NotFoundException);
      expect(githubCalls()).toBe(0);
    }
  });

  it('answers 503 without the GitHub App', async () => {
    const { service, githubCalls } = setup({ configured: false });
    await expect(service.detect(ctx, 'ada', query())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(githubCalls()).toBe(0);
  });

  it('answers 404 when GitHub does not know the repository, branch or folder', async () => {
    for (const options of [
      { repoAccessError: new GithubError(422, 'GitHub answered 422') },
      { repoAccessError: new GithubError(404, 'GitHub answered 404') },
      { listError: new GithubError(404, 'GitHub answered 404') },
    ]) {
      const { service } = setup(options);
      await expect(service.detect(ctx, 'ada', query())).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it("answers 503 when GitHub's rate limit is reached", async () => {
    for (const options of [
      { repoAccessError: new GithubError(403, 'GitHub answered 403') },
      { listError: new GithubError(429, 'GitHub answered 429') },
    ]) {
      const { service } = setup(options);
      await expect(service.detect(ctx, 'ada', query())).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    }
  });

  it('passes other GitHub failures on', async () => {
    const { service } = setup({ listError: new GithubError(500, 'GitHub answered 500') });
    await expect(service.detect(ctx, 'ada', query())).rejects.toBeInstanceOf(GithubError);
  });

  it('makes at most 5 GitHub requests and reads files inside the root folder', async () => {
    const { service, fileText, githubCalls } = setup({
      entries: [
        file('package.json'),
        file('.nvmrc'),
        file('.node-version'),
        file('next.config.mjs'),
        file('next.config.js'),
      ],
      files: {
        'apps/web/package.json': JSON.stringify({ dependencies: { next: '16' } }),
        'apps/web/.nvmrc': 'lts/jod',
        'apps/web/next.config.js': "module.exports = { output: 'export' };",
      },
    });
    const result = await service.detect(ctx, 'ada', query({ rootDir: 'apps/web' }));
    expect(result).toMatchObject({
      framework: 'next',
      outputDir: 'out',
      nodeVersion: '22',
      nodeFrom: '.nvmrc',
      notes: [],
    });
    expect(githubCalls()).toBeLessThanOrEqual(5);
    expect(fileText.mock.calls.map((call) => call[2]).sort()).toEqual([
      'apps/web/.nvmrc',
      'apps/web/next.config.js',
      'apps/web/package.json',
    ]);
    for (const call of fileText.mock.calls) {
      expect(call[0]).toBe('ghs_read');
      expect(call[3]).toBe('main');
    }
  });

  it('only fetches files the listing has', async () => {
    const { service, fileText, githubCalls } = setup({ entries: [file('index.html')] });
    await expect(service.detect(ctx, 'ada', query())).resolves.toMatchObject({
      framework: null,
      notes: ['no-package-json'],
    });
    expect(fileText).not.toHaveBeenCalled();
    expect(githubCalls()).toBe(2);
  });

  it('reads .node-version when there is no .nvmrc, and no Next config for other frameworks', async () => {
    const { service, fileText } = setup({
      entries: [file('package.json'), file('.node-version'), file('next.config.js')],
      files: {
        'package.json': JSON.stringify({ dependencies: { vite: '7' } }),
        '.node-version': '20.11.1',
      },
    });
    await expect(service.detect(ctx, 'ada', query())).resolves.toMatchObject({
      framework: 'vite',
      nodeVersion: '20',
      nodeFrom: '.node-version',
    });
    expect(fileText.mock.calls.map((call) => call[2]).sort()).toEqual([
      '.node-version',
      'package.json',
    ]);
  });

  it('does not fetch a package.json over 512 KB and treats it as unreadable', async () => {
    const { service, fileText } = setup({ entries: [file('package.json', 600 * 1024)] });
    await expect(service.detect(ctx, 'ada', query())).resolves.toMatchObject({
      framework: null,
      notes: [],
    });
    expect(fileText).not.toHaveBeenCalled();
  });

  it('ignores folders and links named like the files', async () => {
    const { service, fileText } = setup({
      entries: [
        { name: 'package.json', type: 'dir', size: 0 },
        { name: '.nvmrc', type: 'symlink', size: 10 },
      ],
    });
    await expect(service.detect(ctx, 'ada', query())).resolves.toMatchObject({
      notes: ['no-package-json'],
    });
    expect(fileText).not.toHaveBeenCalled();
  });
});
