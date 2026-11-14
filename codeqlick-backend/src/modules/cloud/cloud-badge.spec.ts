import { describe, expect, it, vi } from 'vitest';
import { badgeSvg, deployBadgeState, deployBadgeSvg } from './cloud-badge.js';
import { BADGE_TTL_MS, CloudBadgesService } from './cloud-badges.service.js';
import type { CloudRepository } from './cloud.repository.js';

describe('deployBadgeState', () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 10, 14, 10, minute));
  const build = (status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED', minute = 30) => ({
    status,
    queuedAt: at(minute),
  });

  it('shows a build in progress first', () => {
    expect(deployBadgeState({ latestBuild: build('RUNNING'), productionAt: at(40) })).toBe(
      'building',
    );
    expect(deployBadgeState({ latestBuild: build('QUEUED'), productionAt: null })).toBe('building');
  });

  it('shows a failed build until a newer deployment is production', () => {
    expect(deployBadgeState({ latestBuild: build('FAILED', 30), productionAt: at(10) })).toBe(
      'failed',
    );
    expect(deployBadgeState({ latestBuild: build('FAILED', 30), productionAt: null })).toBe(
      'failed',
    );
    // Deployed with the CLI after the failed build.
    expect(deployBadgeState({ latestBuild: build('FAILED', 30), productionAt: at(45) })).toBe(
      'deployed',
    );
  });

  it('otherwise follows the production deployment', () => {
    expect(deployBadgeState({ latestBuild: build('SUCCEEDED'), productionAt: at(31) })).toBe(
      'deployed',
    );
    // Deployed with the CLI, never built from Git.
    expect(deployBadgeState({ latestBuild: null, productionAt: at(1) })).toBe('deployed');
    expect(deployBadgeState({ latestBuild: null, productionAt: null })).toBe('not-deployed');
  });

  it('is unknown without a public project', () => {
    expect(deployBadgeState(null)).toBe('unknown');
  });
});

describe('badge SVG', () => {
  it('labels the image for screen readers and sizes it from the texts', () => {
    const svg = deployBadgeSvg('not-deployed');
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    expect(svg).toContain('aria-label="codeqlick: not deployed"');
    expect(svg).toContain('<title>codeqlick: not deployed</title>');
    expect(badgeSvg('a', 'bb', '#000')).toContain('width="43"');
  });
});

describe('CloudBadgesService', () => {
  it('asks the database at most once a minute per project', async () => {
    const findBadgeFacts = vi
      .fn()
      .mockResolvedValueOnce({ latestBuild: null, productionAt: new Date(0) })
      .mockResolvedValueOnce({
        latestBuild: { status: 'FAILED', queuedAt: new Date(10) },
        productionAt: new Date(0),
      });
    const service = new CloudBadgesService({ findBadgeFacts } as unknown as CloudRepository);

    expect(await service.deployBadge('site', 1000)).toContain('deployed');
    expect(await service.deployBadge('site', 1000 + BADGE_TTL_MS - 1)).toContain('deployed');
    expect(findBadgeFacts).toHaveBeenCalledTimes(1);
    expect(await service.deployBadge('site', 1000 + BADGE_TTL_MS)).toContain('failed');
    expect(findBadgeFacts).toHaveBeenCalledTimes(2);
  });

  it('keeps the cache bounded', async () => {
    const findBadgeFacts = vi.fn().mockResolvedValue(null);
    const service = new CloudBadgesService({ findBadgeFacts } as unknown as CloudRepository);
    for (let i = 0; i < 1500; i++) await service.deployBadge(`made-up-${i}`, 5000);
    const cache = (service as unknown as { cache: Map<string, unknown> }).cache;
    expect(cache.size).toBeLessThanOrEqual(1000);
  });
});
