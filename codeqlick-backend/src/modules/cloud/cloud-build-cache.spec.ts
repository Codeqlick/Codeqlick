import { describe, expect, it } from 'vitest';
import { cacheKey } from './cloud-build-cache.js';

describe('Cloud build cache key', () => {
  const id = '3f9c2a10-1b7e-4c55-9a0d-5e6f7a8b9c0d';
  it('separates production from every other build', () => {
    expect(cacheKey(id, 'PRODUCTION', '22')).toBe(`${id}/production-node22`);
    expect(cacheKey(id, 'PREVIEW', '22')).toBe(`${id}/preview-node22`);
  });
  it('is per Node major version and matches what the agent accepts', () => {
    expect(cacheKey(id, 'PRODUCTION', '24')).toBe(`${id}/production-node24`);
    expect(cacheKey(id, 'PREVIEW', '20.11')).toBe(`${id}/preview-node20`);
    for (const node of ['20', '22', '24']) {
      expect(cacheKey(id, 'PREVIEW', node)).toMatch(/^[a-z0-9-]+\/[a-z0-9-]+$/);
    }
  });
});
