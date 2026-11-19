import { NotFoundException } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { SurfaceScan } from '../../generated/prisma/client.js';
import type { MailService } from '../mail/mail.service.js';
import { DomainNotFoundError } from '../security-checks/gather.js';
import type { CloudCtx } from './cloud-caller.js';
import type { CloudNotificationsService } from './cloud-notifications.service.js';
import type { CloudProjectsService } from './cloud-projects.service.js';
import { nextSurfaceScan } from './cloud-surface.js';
import type { CloudSurfaceRepository } from './cloud-surface.repository.js';
import { CloudSurfaceService } from './cloud-surface.service.js';
import type { CloudTeamsService } from './cloud-teams.service.js';

const NOW = new Date('2026-11-19T03:00:00Z');
const DUE = new Date('2026-11-19T02:30:00Z');

const snapshot = (over: Record<string, unknown> = {}) => ({
  dns: {
    mx: ['10 mx.a.com'],
    spf: ['v=spf1 -all'],
    dmarc: ['v=dmarc1; p=reject'],
    caa: [],
    mtaSts: [],
    ns: ['ns1.a.com'],
    dnssec: 'signed',
    ...over,
  },
  cert: { issuer: "Let's Encrypt", expires: null, days: 60 },
});

function scanRow(id: string, patch: Partial<SurfaceScan> = {}, at = '2026-11-18T03:00:00Z') {
  return {
    id,
    domainId: 'd1',
    projectId: 'p1',
    teamId: 't1',
    status: 'DONE',
    error: null,
    score: 90,
    grade: 'A',
    result: [{ id: 'hsts', status: 'pass', values: {} }],
    snapshot: snapshot(),
    createdAt: new Date(at),
    ...patch,
  } as unknown as SurfaceScan;
}

function domain(patch: Record<string, unknown> = {}, projectPatch: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    projectId: 'p1',
    name: 'a.com',
    state: 'LIVE',
    surfaceMonitor: true,
    surfaceNextAt: DUE,
    project: {
      id: 'p1',
      teamId: 't1',
      slug: 'acme',
      name: 'Acme',
      team: { id: 't1', slug: 'team-a' },
      suspendedAt: null,
      deletedAt: null,
      ...projectPatch,
    },
    ...patch,
  };
}

const worse = {
  checks: [{ id: 'hsts', status: 'fail', values: {} }],
  score: 60,
  grade: 'C',
  snapshot: snapshot(),
};
const same = {
  ...worse,
  checks: [{ id: 'hsts', status: 'pass', values: {} }],
  score: 90,
  grade: 'A',
};

function setup(
  options: {
    due?: unknown[];
    claimed?: boolean;
    previous?: SurfaceScan | null;
    scan?: unknown | Error;
    scans?: SurfaceScan[];
    found?: unknown;
  } = {},
) {
  const due = vi.fn(() => Promise.resolve(options.due ?? [domain()]));
  const claim = vi.fn(() => Promise.resolve(options.claimed ?? true));
  const createScan = vi.fn((data: Record<string, unknown>) =>
    Promise.resolve({ ...scanRow('s-new', {}, NOW.toISOString()), ...data, id: 's-new' }),
  );
  const previousDone = vi.fn(() =>
    Promise.resolve(options.previous === undefined ? scanRow('s-old') : options.previous),
  );
  const scans = vi.fn(() => Promise.resolve(options.scans ?? []));
  const findScan = vi.fn(() =>
    Promise.resolve(
      options.found === undefined
        ? {
            ...scanRow('s1'),
            domain: { id: 'd1', name: 'a.com' },
            project: { slug: 'acme', name: 'Acme' },
          }
        : options.found,
    ),
  );
  const deleteOlderThan = vi.fn(() => Promise.resolve(3));
  const scan = vi.fn(() => {
    const result = options.scan ?? worse;
    return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
  });
  const surfaceChanged = vi.fn(() => Promise.resolve());
  const admins = vi.fn(() =>
    Promise.resolve([
      { email: 'ada@test.dev', locale: 'EN' },
      { email: 'eva@test.dev', locale: 'ES' },
    ]),
  );
  const send = vi.fn((_message: unknown) => Promise.resolve());
  const accessById = vi.fn(() => Promise.resolve({}));
  const project = vi.fn(() =>
    Promise.resolve({
      project: {
        id: 'p1',
        teamId: 't1',
        domains: [
          {
            id: 'd1',
            surfaceMonitor: true,
            surfaceNextAt: new Date('2026-11-20T02:00:00Z'),
          },
          { id: 'd2', surfaceMonitor: false, surfaceNextAt: null },
        ],
      },
    }),
  );
  const service = new CloudSurfaceService(
    {
      due,
      claim,
      createScan,
      previousDone,
      scans,
      findScan,
      deleteOlderThan,
    } as unknown as CloudSurfaceRepository,
    { get: () => ({ scan }) } as unknown as ModuleRef,
    { project } as unknown as CloudProjectsService,
    { accessById } as unknown as CloudTeamsService,
    { admins, surfaceChanged } as unknown as CloudNotificationsService,
    { send } as unknown as MailService,
    {
      isTest: true,
      cloudUrl: 'https://cloud.test',
      siteUrl: 'https://codeqlick.test',
    } as unknown as AppConfigService,
  );
  return {
    service,
    due,
    claim,
    createScan,
    previousDone,
    scans,
    scan,
    surfaceChanged,
    send,
    accessById,
    deleteOlderThan,
  };
}

const ctx = { user: { id: 'u1' } } as unknown as CloudCtx;

describe('CloudSurfaceService.runScheduled', () => {
  it('takes up to five due domains and claims one on its current next run, moving it on', async () => {
    const { service, claim, due } = setup();
    await service.runScheduled(NOW);
    expect(due).toHaveBeenCalledWith(NOW, 5);
    expect(claim).toHaveBeenCalledWith('d1', DUE, nextSurfaceScan('d1', NOW));
  });

  it('does nothing when another process claimed it', async () => {
    const { service, scan, createScan } = setup({ claimed: false });
    await service.runScheduled(NOW);
    expect(scan).not.toHaveBeenCalled();
    expect(createScan).not.toHaveBeenCalled();
  });

  it.each([
    ['suspended', { suspendedAt: new Date() }],
    ['deleted', { deletedAt: new Date() }],
  ])('skips a project that is %s, after moving the slot on', async (_label, patch) => {
    const { service, claim, scan, createScan, send } = setup({ due: [domain({}, patch)] });
    await service.runScheduled(NOW);
    expect(claim).toHaveBeenCalledOnce();
    expect(scan).not.toHaveBeenCalled();
    expect(createScan).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('skips a domain that went back to PENDING', async () => {
    const { service, scan } = setup({ due: [domain({ state: 'PENDING' })] });
    await service.runScheduled(NOW);
    expect(scan).not.toHaveBeenCalled();
  });

  it('scans the domain with a 60 s signal and stores the result with the checks and the snapshot', async () => {
    const { service, scan, createScan } = setup({ previous: null });
    await service.runScheduled(NOW);
    expect(scan).toHaveBeenCalledWith('a.com', expect.any(AbortSignal));
    expect(createScan).toHaveBeenCalledWith({
      domainId: 'd1',
      projectId: 'p1',
      teamId: 't1',
      status: 'DONE',
      score: 60,
      grade: 'C',
      result: [{ id: 'hsts', status: 'fail', values: {} }],
      snapshot: snapshot(),
    });
  });

  it('scans the domains of a tick one after another', async () => {
    const order: string[] = [];
    const { service, scan } = setup({
      due: [domain({ id: 'd1', name: 'a.com' }), domain({ id: 'd2', name: 'b.com' })],
      previous: null,
    });
    scan.mockImplementation(((name: string) => {
      order.push(`start ${name}`);
      return new Promise((resolve) =>
        setTimeout(() => {
          order.push(`end ${name}`);
          resolve(same);
        }, 5),
      );
    }) as never);
    await service.runScheduled(NOW);
    expect(order).toEqual(['start a.com', 'end a.com', 'start b.com', 'end b.com']);
  });

  it('does not start a tick while the previous one still runs', async () => {
    const { service, due, scan } = setup({ previous: null });
    let release: () => void = () => undefined;
    scan.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve(same))) as never,
    );
    const first = service.runScheduled(NOW);
    await vi.waitFor(() => expect(scan).toHaveBeenCalledOnce());
    await service.runScheduled(NOW);
    expect(due).toHaveBeenCalledOnce();
    release();
    await first;
  });

  it('keeps going when one domain crashes', async () => {
    const { service, claim, createScan } = setup({
      due: [domain({ id: 'd1' }), domain({ id: 'd2', name: 'b.com' })],
      previous: null,
    });
    claim.mockRejectedValueOnce(new Error('db down'));
    await service.runScheduled(NOW);
    expect(createScan).toHaveBeenCalledOnce();
  });
});

describe('CloudSurfaceService: failed scans', () => {
  it.each([
    ['a domain that does not exist', new DomainNotFoundError('Domain not found'), 'not_found'],
    ['anything unexpected', new Error('boom'), 'error'],
  ])('stores %s as FAILED, with no alert', async (_label, error, code) => {
    const { service, createScan, previousDone, send, surfaceChanged } = setup({ scan: error });
    await service.runScheduled(NOW);
    expect(createScan).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED', error: code, result: [], snapshot: {} }),
    );
    expect(previousDone).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(surfaceChanged).not.toHaveBeenCalled();
  });
});

describe('CloudSurfaceService: alerts', () => {
  it('compares with the newest DONE scan of the domain and team and emails the admins in their language', async () => {
    const { service, previousDone, send, surfaceChanged } = setup();
    await service.runScheduled(NOW);
    expect(previousDone).toHaveBeenCalledWith(expect.objectContaining({ id: 's-new' }));
    expect(send).toHaveBeenCalledTimes(2);
    const [en, es] = send.mock.calls.map(
      ([message]) => message as { to: string; subject: string; text: string },
    );
    expect(en).toMatchObject({ to: 'ada@test.dev', subject: 'Security changes on a.com' });
    expect(es).toMatchObject({ to: 'eva@test.dev', subject: 'Cambios de seguridad en a.com' });
    expect(en!.text).toContain('pass → fail');
    expect(en!.text).toContain(
      'https://cloud.test/en/console/team-a/acme/domains/d1/security?scan=s-new',
    );
    expect(es!.text).toContain('/es/console/team-a/acme/domains/d1/security?scan=s-new');
    expect(surfaceChanged).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        domain: 'a.com',
        domainId: 'd1',
        changes: [{ kind: 'check', id: 'hsts', from: 'pass', to: 'fail' }],
      }),
    );
  });

  it('tells nobody when nothing changed, when it is the baseline, or when it got better', async () => {
    for (const options of [
      { scan: same },
      { scan: worse, previous: null },
      {
        scan: same,
        previous: scanRow('s-old', { result: [{ id: 'hsts', status: 'fail', values: {} }] }),
      },
    ]) {
      const { service, send, surfaceChanged } = setup(options);
      await service.runScheduled(NOW);
      expect(send).not.toHaveBeenCalled();
      expect(surfaceChanged).not.toHaveBeenCalled();
    }
  });

  it('alerts on a changed record set even when no check moved', async () => {
    const { service, send } = setup({
      scan: { ...same, snapshot: snapshot({ ns: ['ns1.evil.test'] }) },
    });
    await service.runScheduled(NOW);
    expect(send).toHaveBeenCalled();
    expect((send.mock.calls[0]![0] as { text: string }).text).toContain('Name servers changed');
  });

  it('never fails the job when the emails or the channels fail', async () => {
    const { service, send, surfaceChanged, createScan } = setup({
      due: [domain({ id: 'd1' }), domain({ id: 'd2', name: 'b.com' })],
    });
    send.mockRejectedValue(new Error('smtp down'));
    surfaceChanged.mockRejectedValue(new Error('hook down'));
    await expect(service.runScheduled(NOW)).resolves.toBeUndefined();
    expect(createScan).toHaveBeenCalledTimes(2);
  });
});

describe('CloudSurfaceService.history', () => {
  it('lists the scans with how many changes each had against the previous DONE one', async () => {
    const rows = [
      scanRow(
        's3',
        { result: [{ id: 'hsts', status: 'fail', values: {} }], grade: 'C' },
        '2026-11-19T03:00:00Z',
      ),
      scanRow(
        's2',
        { status: 'FAILED', error: 'timeout', score: null, grade: null },
        '2026-11-18T03:00:00Z',
      ),
      scanRow('s1', {}, '2026-11-17T03:00:00Z'),
    ];
    const { service } = setup({ scans: rows });
    const view = await service.history(ctx, 'p1', 'd1');
    expect(view.enabled).toBe(true);
    expect(view.nextAt).toBe('2026-11-20T02:00:00.000Z');
    expect(view.scans.map((s) => [s.id, s.status, s.error, s.changes])).toEqual([
      ['s3', 'DONE', null, 1],
      ['s2', 'FAILED', 'timeout', 0],
      ['s1', 'DONE', null, 0],
    ]);
    expect(view.last).toEqual(view.scans[0]);
  });

  it('compares the oldest of a full window with the DONE scan outside it, of the same team', async () => {
    const rows = Array.from({ length: 30 }, (_, index) =>
      scanRow(`s${30 - index}`, {}, new Date(Date.UTC(2026, 10, 19 - index, 3)).toISOString()),
    );
    const outside = scanRow('s0', { result: [{ id: 'hsts', status: 'pass', values: {} }] });
    rows[29] = scanRow(
      's1',
      { result: [{ id: 'hsts', status: 'fail', values: {} }] },
      '2026-10-21T03:00:00Z',
    );
    const { service, previousDone, scans } = setup({ scans: rows, previous: outside });
    const view = await service.history(ctx, 'p1', 'd1');
    expect(scans).toHaveBeenCalledWith('d1', 't1', 30);
    expect(previousDone).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
    expect(view.scans.at(-1)!.changes).toBe(1);
  });

  it('says nothing is scheduled while the monitor is off, and has no scans yet', async () => {
    const { service } = setup();
    const view = await service.history(ctx, 'p1', 'd2');
    expect(view).toMatchObject({ enabled: false, nextAt: null, last: null, scans: [] });
    expect(view.domain.id).toBe('d2');
  });

  it('is a 404 for a domain of another project', async () => {
    const { service } = setup();
    await expect(service.history(ctx, 'p1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CloudSurfaceService.scan', () => {
  it('answers the scan with its texts in the reader language and its changes against the previous one', async () => {
    const found = {
      ...scanRow('s1', {
        result: [{ id: 'hsts', status: 'fail', values: {} }],
        grade: 'C',
        score: 60,
      }),
      domain: { id: 'd1', name: 'a.com' },
      project: { slug: 'acme', name: 'Acme' },
    };
    const { service, accessById } = setup({ found });
    const view = await service.scan(ctx, 's1', 'es');
    expect(accessById).toHaveBeenCalledWith(ctx, 't1');
    expect(view).toMatchObject({
      id: 's1',
      domain: { id: 'd1', name: 'a.com' },
      project: { slug: 'acme', name: 'Acme' },
      status: 'DONE',
      error: null,
      failure: null,
      score: 60,
      grade: 'C',
      changes: [{ kind: 'check', id: 'hsts', from: 'pass', to: 'fail' }],
      previous: { id: 's-old', grade: 'A', score: 90 },
    });
    expect(view.snapshot).toEqual(snapshot());
    const https = view.groups.find((group) => group.key === 'https')!;
    expect(https.name).toBe('HTTPS y cifrado');
    expect(https.checks).toEqual([
      expect.objectContaining({ id: 'hsts', status: 'fail', title: expect.any(String) }),
    ]);
  });

  it('marks the first scan as the baseline: no previous, no changes', async () => {
    const { service } = setup({ previous: null });
    expect(await service.scan(ctx, 's1', 'en')).toMatchObject({ previous: null, changes: [] });
  });

  it('answers a failed scan with its reason and no findings', async () => {
    const found = {
      ...scanRow('s1', {
        status: 'FAILED',
        error: 'not_found',
        score: null,
        grade: null,
        result: [],
        snapshot: {},
      }),
      domain: { id: 'd1', name: 'a.com' },
      project: { slug: 'acme', name: 'Acme' },
    };
    const { service, previousDone } = setup({ found });
    const view = await service.scan(ctx, 's1', 'en');
    expect(view).toMatchObject({
      status: 'FAILED',
      error: 'not_found',
      groups: [],
      snapshot: null,
      changes: [],
      previous: null,
    });
    expect(view.failure).toEqual(expect.any(String));
    expect(previousDone).not.toHaveBeenCalled();
  });

  it('is a 404 for an unknown scan and for one of a team the caller is not in', async () => {
    const unknown = setup({ found: null });
    await expect(unknown.service.scan(ctx, 'x', 'en')).rejects.toBeInstanceOf(NotFoundException);
    const stranger = setup();
    stranger.accessById.mockRejectedValue(new NotFoundException('Not found'));
    await expect(stranger.service.scan(ctx, 's1', 'en')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CloudSurfaceService.cleanup', () => {
  it('deletes the scans past 90 days', async () => {
    const { service, deleteOlderThan } = setup();
    await service.cleanup(NOW);
    expect(deleteOlderThan).toHaveBeenCalledWith(new Date(NOW.getTime() - 90 * 86_400_000));
  });

  it('never throws', async () => {
    const { service, deleteOlderThan } = setup();
    deleteOlderThan.mockRejectedValue(new Error('db down'));
    await expect(service.cleanup(NOW)).resolves.toBeUndefined();
  });
});
