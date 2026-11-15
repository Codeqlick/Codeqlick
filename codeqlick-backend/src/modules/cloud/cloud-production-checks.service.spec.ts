import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { CloudAudit } from '../../generated/prisma/client.js';
import type { MailService } from '../mail/mail.service.js';
import type { CloudAuditsRepository } from './cloud-audits.repository.js';
import type { CloudAuditsService } from './cloud-audits.service.js';
import type { CloudNotificationsService } from './cloud-notifications.service.js';
import { nextProductionCheck } from './cloud-production-checks.js';
import { CloudProductionChecksService } from './cloud-production-checks.service.js';
import type { CloudProjectsService } from './cloud-projects.service.js';

const NOW = new Date('2026-11-16T03:00:00Z');
const DUE = new Date('2026-11-16T02:30:00Z');

const even = { speed: 90, mobile: 90, seo: 90, security: 90 };

function row(id: string, score: number, categories = even, at = NOW): CloudAudit {
  return {
    id,
    teamId: 't1',
    userId: null,
    projectId: 'p1',
    kind: 'SCHEDULED',
    url: 'https://acme.cloud.test/',
    score,
    result: { finalUrl: 'https://acme.cloud.test/', categories, checks: [] },
    createdAt: at,
  } as unknown as CloudAudit;
}

function project(patch: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    teamId: 't1',
    slug: 'acme',
    name: 'Acme',
    team: { id: 't1', slug: 'team-a', plan: 'FREE' },
    productionChecks: true,
    productionCheckNextAt: DUE,
    productionDeploymentId: 'd1',
    protection: 'OFF',
    suspendedAt: null,
    deletedAt: null,
    ...patch,
  };
}

function setup(
  options: {
    due?: unknown[];
    claimed?: boolean;
    previous?: CloudAudit | null;
    audit?: CloudAudit | Error;
  } = {},
) {
  const dueProductionChecks = vi.fn(() => Promise.resolve(options.due ?? [project()]));
  const claimProductionCheck = vi.fn(() => Promise.resolve(options.claimed ?? true));
  const runScheduled = vi.fn(() => {
    const audit = options.audit ?? row('a2', 70);
    return audit instanceof Error ? Promise.reject(audit) : Promise.resolve(audit);
  });
  const previousScheduled = vi.fn(() =>
    Promise.resolve(options.previous === undefined ? row('a1', 90) : options.previous),
  );
  const auditDropped = vi.fn(() => Promise.resolve());
  const send = vi.fn((_message: unknown) => Promise.resolve());
  const admins = vi.fn(() =>
    Promise.resolve([
      { email: 'ada@test.dev', locale: 'en' },
      { email: 'eva@test.dev', locale: 'es' },
    ]),
  );
  const service = new CloudProductionChecksService(
    { runScheduled, previousScheduled } as unknown as CloudAuditsService,
    { dueProductionChecks, claimProductionCheck } as unknown as CloudAuditsRepository,
    {
      projectUrl: (slug: string) => `https://${slug}.cloud.test`,
    } as unknown as CloudProjectsService,
    { admins, auditDropped } as unknown as CloudNotificationsService,
    { send } as unknown as MailService,
    {
      isTest: true,
      cloudUrl: 'https://cloud.test',
      siteUrl: 'https://codeqlick.test',
    } as unknown as AppConfigService,
  );
  return {
    service,
    dueProductionChecks,
    claimProductionCheck,
    runScheduled,
    previousScheduled,
    auditDropped,
    send,
  };
}

describe('CloudProductionChecksService.runScheduled', () => {
  it('claims a due project on its current next run, moving it to its next slot', async () => {
    const { service, claimProductionCheck, dueProductionChecks } = setup({ previous: null });
    await service.runScheduled(NOW);
    expect(dueProductionChecks).toHaveBeenCalledWith(NOW, 5);
    expect(claimProductionCheck).toHaveBeenCalledWith('p1', DUE, nextProductionCheck('p1', NOW));
  });

  it('checks the hosting address, never a custom domain', async () => {
    const { service, runScheduled } = setup({ previous: null });
    await service.runScheduled(NOW);
    expect(runScheduled).toHaveBeenCalledWith({
      teamId: 't1',
      plan: 'FREE',
      projectId: 'p1',
      url: 'https://acme.cloud.test/',
    });
  });

  it('does nothing when another process claimed it', async () => {
    const { service, runScheduled } = setup({ claimed: false });
    await service.runScheduled(NOW);
    expect(runScheduled).not.toHaveBeenCalled();
  });

  it.each([
    ['deleted', { deletedAt: new Date() }],
    ['suspended', { suspendedAt: new Date() }],
    ['without production', { productionDeploymentId: null }],
    ['password protected', { protection: 'ALL' }],
  ])('skips a project that is %s, after moving its slot on', async (_label, patch) => {
    const { service, claimProductionCheck, runScheduled, send } = setup({
      due: [project(patch)],
    });
    await service.runScheduled(NOW);
    expect(claimProductionCheck).toHaveBeenCalledOnce();
    expect(runScheduled).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ['past the hourly limit', new HttpException('limit', HttpStatus.TOO_MANY_REQUESTS)],
    ['unreachable', new HttpException('down', HttpStatus.UNPROCESSABLE_ENTITY)],
    ['too slow', new HttpException('slow', HttpStatus.GATEWAY_TIMEOUT)],
  ])('stores and sends nothing when the site is %s', async (_label, error) => {
    const { service, previousScheduled, send, auditDropped } = setup({ audit: error });
    await service.runScheduled(NOW);
    expect(previousScheduled).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(auditDropped).not.toHaveBeenCalled();
  });

  it('does not alert on the first check', async () => {
    const { service, send, auditDropped } = setup({ previous: null });
    await service.runScheduled(NOW);
    expect(send).not.toHaveBeenCalled();
    expect(auditDropped).not.toHaveBeenCalled();
  });

  it('does not alert when the score held', async () => {
    const { service, send, auditDropped } = setup({ audit: row('a2', 85) });
    await service.runScheduled(NOW);
    expect(send).not.toHaveBeenCalled();
    expect(auditDropped).not.toHaveBeenCalled();
  });

  it('emails each admin in their language and tells the channels when it dropped', async () => {
    const { service, send, auditDropped } = setup();
    await service.runScheduled(NOW);
    expect(send).toHaveBeenCalledTimes(2);
    const messages = send.mock.calls.map(
      (call) => call[0] as unknown as { to: string; subject: string; text: string },
    );
    expect(messages[0]).toMatchObject({
      to: 'ada@test.dev',
      subject: 'Website score dropped: Acme (90 → 70)',
    });
    expect(messages[0]!.text).toContain('https://cloud.test/en/console/team-a/audits/a2');
    expect(messages[0]!.text).toContain('https://cloud.test/en/console/team-a/audits/a1');
    expect(messages[1]).toMatchObject({
      to: 'eva@test.dev',
      subject: 'La nota de la web ha bajado: Acme (90 → 70)',
    });
    expect(auditDropped).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        drop: { score: { from: 90, to: 70 }, categories: [], checks: [] },
      }),
    );
  });

  it('keeps going when an email fails', async () => {
    const { service, send, auditDropped } = setup();
    send.mockRejectedValueOnce(new Error('smtp down'));
    await service.runScheduled(NOW);
    expect(send).toHaveBeenCalledTimes(2);
    expect(auditDropped).toHaveBeenCalledOnce();
  });

  it('checks at most the projects it is given, one after the other, and survives a failure', async () => {
    const { service, runScheduled } = setup({
      due: [project({ id: 'p1' }), project({ id: 'p2', slug: 'beta' })],
      previous: null,
    });
    runScheduled.mockRejectedValueOnce(new Error('boom'));
    await service.runScheduled(NOW);
    expect(runScheduled).toHaveBeenCalledTimes(2);
  });

  it('does nothing while the previous tick still runs', async () => {
    const { service, dueProductionChecks, runScheduled } = setup({ previous: null });
    let release: () => void = () => undefined;
    runScheduled.mockImplementationOnce(
      () =>
        new Promise<CloudAudit>((resolve) => {
          release = () => resolve(row('a2', 90));
        }),
    );
    const first = service.runScheduled(NOW);
    await vi.waitFor(() => expect(runScheduled).toHaveBeenCalledOnce());
    await service.runScheduled(NOW);
    expect(dueProductionChecks).toHaveBeenCalledOnce();
    release();
    await first;
    await service.runScheduled(NOW);
    expect(dueProductionChecks).toHaveBeenCalledTimes(2);
  });
});
