import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { MailMessage, MailService } from '../mail/mail.service.js';
import type { CloudAnalyticsService } from './cloud-analytics.service.js';
import type { CloudBuildsRepository } from './cloud-builds.repository.js';
import type { CloudCtx } from './cloud-caller.js';
import type { CloudProjectsService } from './cloud-projects.service.js';
import type { CloudTeamsService } from './cloud-teams.service.js';
import { keepMembers, megabytes, withoutMonitors } from './cloud-transfer.js';
import type {
  CloudTransferRepository,
  TransferState,
  TransferWrite,
} from './cloud-transfer.repository.js';
import { CloudTransferService } from './cloud-transfer.service.js';
import type { CloudRepository } from './cloud.repository.js';
import type { GithubClient } from './github.client.js';

const MB = 1024 * 1024;
const ctx: CloudCtx = {
  user: { id: 'u-mover', email: 'ada@codeqlick.test', name: 'Ada', role: 'CLIENT' },
  ip: '127.0.0.1',
} as unknown as CloudCtx;

const sourceTeam = { id: 't-src', slug: 'studio', name: 'Studio', plan: 'FREE' as const };
const targetTeam = { id: 't-dst', slug: 'client', name: 'Client', plan: 'FREE' as const };

function projectRow(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    slug: 'shop',
    name: 'Shop',
    teamId: sourceTeam.id,
    team: sourceTeam,
    suspendedAt: null,
    suspendedReason: null,
    deletedAt: null,
    gitRepoId: null as bigint | null,
    gitInstallationId: null as bigint | null,
    gitRepo: null as string | null,
    production: null,
    domains: [],
    productionDeploymentId: null,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    ...over,
  };
}

function state(over: Partial<TransferState> = {}): TransferState {
  return {
    project: { teamId: sourceTeam.id, deletedAt: null, suspendedAt: null, gitRepoId: null },
    sourceRole: 'OWNER',
    targetRole: 'ADMIN',
    targetPlan: 'FREE',
    activeBuilds: 0,
    targetProjects: 2,
    targetStorageBytes: 100 * MB,
    projectStorageBytes: 10 * MB,
    targetMonitors: 1,
    monitors: [{ id: 'm1', alertIds: ['u-mover'] }],
    ...over,
  };
}

function setup(
  opts: {
    project?: ReturnType<typeof projectRow>;
    targetRole?: 'OWNER' | 'ADMIN' | 'MEMBER';
    targetTeamOver?: Partial<typeof targetTeam>;
    before?: TransferState;
    inside?: TransferState;
    installations?: Array<{ installationId: bigint; suspendedAt: Date | null }>;
    repos?: Record<string, number[] | Error>;
    githubConfigured?: boolean;
    owners?: Array<{ id: string; email: string; name: string; locale: 'EN' | 'ES' }>;
  } = {},
) {
  const project = opts.project ?? projectRow();
  const target = { ...targetTeam, ...opts.targetTeamOver };
  const sent: MailMessage[] = [];
  const writes: TransferWrite[] = [];
  const projects = {
    project: vi.fn().mockResolvedValue({ project, membership: { role: 'OWNER' } }),
    view: vi.fn((p: ReturnType<typeof projectRow>) => ({ id: p.id, slug: p.slug, team: p.team })),
    projectUrl: vi.fn((slug: string) => `https://${slug}.cloud.test`),
  } as unknown as CloudProjectsService;
  const teams = {
    access: vi.fn().mockImplementation(() => {
      if (opts.targetRole === 'MEMBER') {
        return Promise.reject(new ForbiddenException('Only a team admin can do this'));
      }
      return Promise.resolve({
        teamId: target.id,
        role: opts.targetRole ?? 'ADMIN',
        team: target,
      });
    }),
    record: vi.fn().mockResolvedValue(undefined),
  } as unknown as CloudTeamsService;
  const repository = {
    state: vi.fn().mockResolvedValue(opts.before ?? state()),
    transfer: vi
      .fn()
      .mockImplementation((write: TransferWrite, check: (s: TransferState) => void) => {
        const inside = opts.inside ?? opts.before ?? state();
        check(inside);
        writes.push(write);
        return Promise.resolve(inside.monitors.length);
      }),
    moveAnalyticsBatch: vi.fn().mockResolvedValue(0),
  } as unknown as CloudTransferRepository;
  const cloud = {
    findProject: vi.fn().mockResolvedValue({ ...project, teamId: target.id, team: target }),
    ownerEmails: vi.fn().mockResolvedValue(
      opts.owners ?? [
        { id: 'u-mover', email: 'ada@codeqlick.test', name: 'Ada', locale: 'EN' },
        { id: 'u-other', email: 'lin@client.test', name: 'Lin', locale: 'ES' },
      ],
    ),
  } as unknown as CloudRepository;
  const builds = {
    installations: vi.fn().mockResolvedValue(opts.installations ?? []),
  } as unknown as CloudBuildsRepository;
  const github = {
    configured: opts.githubConfigured ?? true,
    repositories: vi.fn().mockImplementation((id: bigint) => {
      const repos = opts.repos?.[String(id)];
      if (repos instanceof Error) return Promise.reject(repos);
      return Promise.resolve(
        (repos ?? []).map((repoId) => ({
          id: repoId,
          fullName: `acme/${repoId}`,
          defaultBranch: 'main',
          private: true,
        })),
      );
    }),
  } as unknown as GithubClient;
  const analytics = { forget: vi.fn() } as unknown as CloudAnalyticsService;
  const mail = {
    send: vi.fn((message: MailMessage) => {
      sent.push(message);
      return Promise.resolve();
    }),
  } as unknown as MailService;
  const config = {
    cloudUrl: 'https://cloud.codeqlick.test',
    siteUrl: 'https://codeqlick.test',
  } as unknown as AppConfigService;
  const svc = new CloudTransferService(
    repository,
    cloud,
    projects,
    teams,
    builds,
    github,
    analytics,
    mail,
    config,
  );
  return { svc, repository, teams, projects, analytics, github, sent, writes };
}

const move = (svc: CloudTransferService) =>
  svc.transfer(ctx, 'p1', { team: 'client' }, new Date('2026-11-14T10:00:00Z'));

describe('Moving a project: helpers', () => {
  it('keeps only the target members, and the mover when nobody is left', () => {
    const members = new Set(['a', 'b']);
    expect(keepMembers(['a', 'x', 'b'], members, 'm')).toEqual(['a', 'b']);
    expect(keepMembers(['x', 'y'], members, 'm')).toEqual(['m']);
    expect(keepMembers([], members, 'm')).toEqual(['m']);
  });

  it('drops moved monitors from a status page', () => {
    const items = [
      { monitorId: 'm1', label: 'Shop' },
      { monitorId: 'm2', label: 'API' },
    ];
    expect(withoutMonitors(items, new Set(['m1']))).toEqual([{ monitorId: 'm2', label: 'API' }]);
    expect(withoutMonitors(items, new Set(['m9']))).toBeNull();
    expect(withoutMonitors('nope', new Set(['m1']))).toBeNull();
  });

  it('rounds storage for the refusal', () => {
    expect(megabytes(1.5 * MB, 'down')).toBe(1);
    expect(megabytes(1.5 * MB, 'up')).toBe(2);
    expect(megabytes(-5, 'down')).toBe(0);
  });
});

describe('CloudTransferService', () => {
  it('needs an owner of the project team', async () => {
    const { svc, projects } = setup();
    vi.mocked(projects.project).mockRejectedValueOnce(
      new ForbiddenException('Only a team owner can do this'),
    );
    await expect(move(svc)).rejects.toMatchObject({
      status: 403,
      message: 'Only a team owner can do this',
    });
    expect(projects.project).toHaveBeenCalledWith(ctx, 'p1', 'OWNER');
  });

  it('needs an owner or admin of the target team', async () => {
    const { svc, teams, repository } = setup({ targetRole: 'MEMBER' });
    await expect(move(svc)).rejects.toMatchObject({
      status: 403,
      message: 'Only a team admin can do this',
    });
    expect(teams.access).toHaveBeenCalledWith(ctx, 'client', 'ADMIN');
    expect(repository.transfer).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown target team', async () => {
    const { svc, teams } = setup();
    vi.mocked(teams.access).mockRejectedValueOnce(new NotFoundException('Team not found'));
    await expect(move(svc)).rejects.toMatchObject({ status: 404, message: 'Team not found' });
  });

  it('refuses the same team', async () => {
    const { svc } = setup({ targetTeamOver: { id: sourceTeam.id } });
    await expect(move(svc)).rejects.toMatchObject({
      status: 400,
      message: 'The project is already in that team',
    });
  });

  it('refuses a suspended project', async () => {
    const { svc } = setup({ project: projectRow({ suspendedAt: new Date() }) });
    await expect(move(svc)).rejects.toMatchObject({
      status: 403,
      message: 'This project is suspended',
    });
  });

  it('waits for builds', async () => {
    const { svc, repository } = setup({ before: state({ activeBuilds: 1 }) });
    await expect(move(svc)).rejects.toMatchObject({
      status: 409,
      message: "Wait for the project's builds to finish",
    });
    expect(repository.transfer).not.toHaveBeenCalled();
  });

  it('refuses a target with no room for another project', async () => {
    const { svc } = setup({ before: state({ targetProjects: 10 }) });
    await expect(move(svc)).rejects.toMatchObject({
      status: 409,
      message: 'A team has at most 10 projects',
    });
  });

  it('follows the target plan, not the source', async () => {
    const { svc } = setup({ before: state({ targetProjects: 10, targetPlan: 'PRO' }) });
    await expect(move(svc)).resolves.toMatchObject({ git: 'none' });
  });

  it('refuses a target without the storage', async () => {
    const { svc } = setup({
      before: state({ targetStorageBytes: 1000 * MB, projectStorageBytes: 30.5 * MB }),
    });
    await expect(move(svc)).rejects.toMatchObject({
      status: 409,
      message: "The team has 24 MB of storage left; this project's deployments take 31 MB",
    });
  });

  it('refuses a target past its monitors', async () => {
    const { svc } = setup({
      before: state({
        targetMonitors: 9,
        monitors: [
          { id: 'm1', alertIds: [] },
          { id: 'm2', alertIds: [] },
        ],
      }),
    });
    await expect(move(svc)).rejects.toMatchObject({
      status: 409,
      message: 'A team has at most 10 monitors',
    });
  });

  it('checks again inside the transaction', async () => {
    const { svc, sent } = setup({
      inside: state({
        project: { teamId: 'elsewhere', deletedAt: null, suspendedAt: null, gitRepoId: null },
      }),
    });
    await expect(move(svc)).rejects.toMatchObject({
      status: 409,
      message: 'The project changed; try again',
    });
    expect(sent).toHaveLength(0);
  });

  it('refuses inside when a limit filled up meanwhile', async () => {
    const { svc } = setup({ inside: state({ targetProjects: 10 }) });
    await expect(move(svc)).rejects.toMatchObject({
      status: 409,
      message: 'A team has at most 10 projects',
    });
  });

  it('moves a project without Git, with events and the email', async () => {
    const { svc, writes, teams, analytics, sent } = setup();
    const result = await move(svc);
    expect(result).toMatchObject({ id: 'p1', team: { slug: 'client' }, git: 'none' });
    expect(writes[0]).toMatchObject({
      projectId: 'p1',
      fromTeamId: sourceTeam.id,
      toTeamId: targetTeam.id,
      userId: 'u-mover',
      git: 'none',
    });
    // The Madrid month of 14 November 2026 starts on 31 October at 23:00 UTC.
    expect(writes[0]!.monthStart.toISOString()).toBe('2026-10-31T23:00:00.000Z');
    expect(analytics.forget).toHaveBeenCalledWith('p1', [sourceTeam.id, targetTeam.id]);
    const details = { from: 'studio', to: 'client', monitors: 1, git: 'none' };
    expect(teams.record).toHaveBeenCalledWith(
      ctx,
      sourceTeam.id,
      'project.transferred_out',
      'shop',
      details,
    );
    expect(teams.record).toHaveBeenCalledWith(
      ctx,
      targetTeam.id,
      'project.transferred_in',
      'shop',
      details,
    );
    // Owners of the target except the mover, in their language.
    expect(sent.map((m) => m.to)).toEqual(['lin@client.test']);
    expect(sent[0]!.subject).toBe('Ada ha movido Shop a Client en Codeqlick Cloud');
    expect(sent[0]!.text).toContain('https://shop.cloud.test');
    expect(sent[0]!.text).toContain('https://cloud.codeqlick.test/es/console/client/shop');
    expect(sent[0]!.text).not.toContain('Git');
  });

  it('keeps the Git link through an installation of the target that sees the repository', async () => {
    const project = projectRow({ gitRepoId: 77n, gitInstallationId: 1n, gitRepo: 'acme/shop' });
    const { svc, writes, sent } = setup({
      project,
      before: state({
        project: { teamId: sourceTeam.id, deletedAt: null, suspendedAt: null, gitRepoId: 77n },
      }),
      installations: [
        { installationId: 5n, suspendedAt: new Date() },
        { installationId: 6n, suspendedAt: null },
        { installationId: 7n, suspendedAt: null },
      ],
      repos: { '5': [77], '6': new Error('GitHub answered 502'), '7': [12, 77] },
    });
    await expect(move(svc)).resolves.toMatchObject({ git: 'kept' });
    expect(writes[0]!.git).toEqual({ installationId: 7n });
    expect(sent[0]!.text).not.toContain('Git');
  });

  it('drops the Git link when no installation of the target sees it', async () => {
    const project = projectRow({ gitRepoId: 77n, gitInstallationId: 1n, gitRepo: 'acme/shop' });
    const before = state({
      project: { teamId: sourceTeam.id, deletedAt: null, suspendedAt: null, gitRepoId: 77n },
    });
    const { svc, writes, teams, sent } = setup({
      project,
      before,
      installations: [{ installationId: 8n, suspendedAt: null }],
      repos: { '8': [12] },
    });
    await expect(move(svc)).resolves.toMatchObject({ git: 'dropped' });
    expect(writes[0]!.git).toBe('drop');
    expect(teams.record).toHaveBeenCalledWith(
      ctx,
      targetTeam.id,
      'project.transferred_in',
      'shop',
      expect.objectContaining({ git: 'dropped' }),
    );
    expect(sent[0]!.text).toContain('Git');
  });

  it('drops the Git link when GitHub is not set up', async () => {
    const project = projectRow({ gitRepoId: 77n });
    const { svc, writes, github } = setup({
      project,
      githubConfigured: false,
      before: state({
        project: { teamId: sourceTeam.id, deletedAt: null, suspendedAt: null, gitRepoId: 77n },
      }),
      installations: [{ installationId: 8n, suspendedAt: null }],
      repos: { '8': [77] },
    });
    await expect(move(svc)).resolves.toMatchObject({ git: 'dropped' });
    expect(writes[0]!.git).toBe('drop');
    expect(github.repositories).not.toHaveBeenCalled();
  });

  it('refuses when the Git link changed before the transaction', async () => {
    const { svc } = setup({
      inside: state({
        project: { teamId: sourceTeam.id, deletedAt: null, suspendedAt: null, gitRepoId: 5n },
      }),
    });
    await expect(move(svc)).rejects.toMatchObject({ status: 409 });
  });

  it('sends no email when the mover is the only owner', async () => {
    const { svc, sent } = setup({
      owners: [{ id: 'u-mover', email: 'ada@codeqlick.test', name: 'Ada', locale: 'EN' }],
    });
    await move(svc);
    expect(sent).toHaveLength(0);
  });
});
