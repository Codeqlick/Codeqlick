import { describe, expect, it, vi } from 'vitest';
import { badgeSvg, deployBadgeState, deployBadgeSvg } from './cloud-badge.js';
import { BADGE_TTL_MS, CloudBadgesService } from './cloud-badges.service.js';
import type { CloudRepository } from './cloud.repository.js';

describe('deployBadgeState', () => {
  it('follows the latest production build, then the production deployment', () => {
    expect(deployBadgeState({ productionBuilds: ['RUNNING'], hasProduction: true })).toBe(
      'building',
    );
    expect(deployBadgeState({ productionBuilds: ['QUEUED', 'FAILED'], hasProduction: false })).toBe(
      'building',
    );
    expect(
      deployBadgeState({ productionBuilds: ['FAILED', 'SUCCEEDED'], hasProduction: true }),
    ).toBe('failed');
    expect(deployBadgeState({ productionBuilds: ['SUCCEEDED'], hasProduction: true })).toBe(
      'deployed',
    );
    // Deployed with the CLI, never built from Git.
    expect(deployBadgeState({ productionBuilds: [], hasProduction: true })).toBe('deployed');
    expect(deployBadgeState({ productionBuilds: [], hasProduction: false })).toBe('not-deployed');
  });

  it('skips canceled builds', () => {
    expect(
      deployBadgeState({ productionBuilds: ['CANCELED', 'FAILED'], hasProduction: true }),
    ).toBe('failed');
    expect(deployBadgeState({ productionBuilds: ['CANCELED'], hasProduction: true })).toBe(
      'deployed',
    );
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
      .mockResolvedValueOnce({ productionBuilds: [], hasProduction: true })
      .mockResolvedValueOnce({ productionBuilds: ['FAILED'], hasProduction: true });
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
