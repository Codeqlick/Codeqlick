import { describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { CloudAudit } from '../../generated/prisma/client.js';
import type { AuditInputs, CheckResult } from '../site-audits/site-audit-checks.js';
import { scoreOf } from '../site-audits/site-audit-checks.js';
import type { CloudAuditsRepository } from './cloud-audits.repository.js';
import { CloudAuditsService } from './cloud-audits.service.js';
import { CLOUD_PLANS } from './cloud-plans.js';
import {
  commentBody,
  previewCheckLines,
  shouldCheckPreview,
  type PreviewCheck,
} from './cloud-preview-check.js';
import type { CloudTeamsService } from './cloud-teams.service.js';

const auditUrl = (id: string) => `https://cloud.test/en/console/acme/audits/${id}`;

describe('the comment section of a preview check', () => {
  it('says it is running', () => {
    expect(previewCheckLines({ state: 'running' }, auditUrl)).toEqual(['Website check: running…']);
  });

  it('says it was skipped past the hourly limit', () => {
    expect(previewCheckLines({ state: 'skipped' }, auditUrl)).toEqual([
      'Website check skipped: hourly limit reached',
    ]);
  });

  it("says why the preview couldn't be opened", () => {
    expect(
      previewCheckLines({ state: 'unavailable', reason: 'The website took too long.' }, auditUrl),
    ).toEqual(["Website check: couldn't open the preview (The website took too long.)"]);
  });

  it('shows the score, the categories, the failed checks, the warnings and the report', () => {
    const lines = previewCheckLines(
      {
        state: 'done',
        auditId: 'abc',
        score: 81,
        categories: { speed: 90, mobile: 85, seo: 70, security: 79 },
        failed: ['Has one main heading', 'Images have descriptions'],
        warnings: 3,
      },
      auditUrl,
    );
    expect(lines.join('\n')).toBe(
      [
        '**Website check: 81/100**',
        'Speed 90 · Mobile 85 · Google 70 · Security 79',
        '',
        'Failed:',
        '- Has one main heading',
        '- Images have descriptions',
        '',
        '3 warnings · [Full report](https://cloud.test/en/console/acme/audits/abc)',
      ].join('\n'),
    );
  });

  it('leaves the failed list out when nothing failed, and counts one warning', () => {
    const text = previewCheckLines(
      {
        state: 'done',
        auditId: 'abc',
        score: 100,
        categories: { speed: 100, mobile: 100, seo: 100, security: 100 },
        failed: [],
        warnings: 1,
      },
      auditUrl,
    ).join('\n');
    expect(text).not.toContain('Failed');
    expect(text).toContain('1 warning ·');
  });

  it('goes after the build table, and only when there is a check', () => {
    const base = {
      project: 'site',
      commit: 'a'.repeat(40),
      state: 'success' as const,
      buildUrl: 'https://cloud.test/b/1',
      deploymentUrl: 'https://site--x.cloud.test',
      auditUrl,
    };
    const without = commentBody(base);
    expect(without).toContain('| Build | https://cloud.test/b/1 |');
    expect(without).not.toContain('Website check');
    const check: PreviewCheck = { state: 'running' };
    const withCheck = commentBody({ ...base, check });
    expect(withCheck.startsWith(without)).toBe(true);
    expect(withCheck.endsWith('\n\nWebsite check: running…')).toBe(true);
  });
});

describe('shouldCheckPreview', () => {
  const pull = { trigger: 'PULL_REQUEST', target: 'PREVIEW', pullRequest: 8 };

  it("checks a pull request's preview when the setting is on", () => {
    expect(shouldCheckPreview(pull, { previewChecks: true })).toBe(true);
  });

  it('does not check when the setting is off', () => {
    expect(shouldCheckPreview(pull, { previewChecks: false })).toBe(false);
  });

  it('does not check pushes, manual or production builds', () => {
    const on = { previewChecks: true };
    expect(shouldCheckPreview({ trigger: 'PUSH', target: 'PREVIEW', pullRequest: null }, on)).toBe(
      false,
    );
    expect(
      shouldCheckPreview({ trigger: 'MANUAL', target: 'PREVIEW', pullRequest: null }, on),
    ).toBe(false);
    expect(shouldCheckPreview({ ...pull, target: 'PRODUCTION' }, on)).toBe(false);
  });
});

describe('scoring without the indexable check', () => {
  const checks: CheckResult[] = [
    { id: 'indexable', status: 'fail' },
    { id: 'canonical', status: 'pass' },
    { id: 'h1', status: 'pass' },
  ];

  it('counts it by default', () => {
    expect(scoreOf(checks).categories.seo).toBe(67);
  });

  it('leaves it out of its category and the score', () => {
    const scored = scoreOf(checks, ['indexable']);
    expect(scored.categories.seo).toBe(100);
    expect(scored.score).toBe(100);
  });
});

describe('CloudAuditsService.runPreview', () => {
  const noindexPage = {
    page: {
      url: 'https://site--x.cloud.test/',
      status: 200,
      headers: { 'x-robots-tag': 'noindex' },
      body: '<!doctype html><html lang="en"><head><title>Site</title></head><body></body></html>',
      bytes: 1_000,
      ttfbMs: 100,
    },
    certificate: { validTo: new Date(Date.now() + 90 * 86_400_000), error: null },
    httpVersion: 'https',
    robotsTxt: null,
    sitemapFound: false,
    pageSpeed: null,
    now: new Date(),
  } as unknown as AuditInputs;

  function setup(recent: number) {
    const create = vi.fn((data: Record<string, unknown>) =>
      Promise.resolve({ id: 'audit-1', createdAt: new Date(), ...data } as unknown as CloudAudit),
    );
    const record = vi.fn();
    const service = new CloudAuditsService(
      {
        countSince: vi.fn(() => Promise.resolve(recent)),
        create,
      } as unknown as CloudAuditsRepository,
      { record } as unknown as CloudTeamsService,
      {} as AppConfigService,
    );
    const gather = vi.fn(() => Promise.resolve(noindexPage));
    service.gatherInputs = gather;
    return { service, create, record, gather };
  }

  const input = { teamId: 't1', plan: 'FREE' as const, url: 'https://site--x.cloud.test' };

  it('stores an audit with no member and no team event, without the indexable check', async () => {
    const { service, create, record } = setup(0);
    const outcome = await service.runPreview(input);
    expect(record).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledOnce();
    const data = create.mock.calls[0]![0] as {
      userId: string | null;
      result: { checks: Array<{ id: string }> };
    };
    expect(data.userId).toBeNull();
    expect(data.result.checks.map((check) => check.id)).not.toContain('indexable');
    expect(outcome.state).toBe('done');
    if (outcome.state === 'done') {
      expect(outcome.auditId).toBe('audit-1');
      expect(outcome.failed.length).toBeLessThanOrEqual(5);
      expect(outcome.failed).not.toContain('Visible in Google');
    }
  });

  it('is skipped past the hourly limit, without making an audit', async () => {
    const { service, create, gather } = setup(CLOUD_PLANS.FREE.auditsPerHour);
    expect(await service.runPreview(input)).toEqual({ state: 'skipped' });
    expect(create).not.toHaveBeenCalled();
    expect(gather).not.toHaveBeenCalled();
  });

  it("says why a preview couldn't be opened", async () => {
    const { service, create, gather } = setup(0);
    gather.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND site--x.cloud.test'));
    const outcome = await service.runPreview(input);
    expect(outcome.state).toBe('unavailable');
    expect(create).not.toHaveBeenCalled();
  });
});
