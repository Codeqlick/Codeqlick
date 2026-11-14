import { describe, expect, it } from 'vitest';
import { cloudEventFilters, cloudEventFiltersQuery, cloudSlug, formatBytes } from './cloud';

describe('formatBytes', () => {
  it('picks the unit and the decimals', () => {
    expect(formatBytes(512, 'en')).toBe('512 B');
    expect(formatBytes(1536, 'en')).toBe('1.5 KB');
    expect(formatBytes(1536, 'es')).toBe('1,5 KB');
    expect(formatBytes(1024 * 1024 * 1024, 'en')).toBe('1 GB');
    expect(formatBytes(150 * 1024 * 1024, 'en')).toBe('150 MB');
  });
});

describe('cloudSlug', () => {
  it('makes an address from a name', () => {
    expect(cloudSlug('Mi Web Ñandú!', 40)).toBe('mi-web-nandu');
    expect(cloudSlug('  --Docs--  ', 40)).toBe('docs');
    expect(cloudSlug('a'.repeat(50), 40)).toHaveLength(40);
  });
});

describe('cloudEventFilters', () => {
  it('keeps well-formed dates and a trimmed, lowercased action', () => {
    expect(
      cloudEventFilters({ from: '2026-01-01', to: ['2026-01-31', 'x'], action: ' Domain. ' }),
    ).toEqual({
      from: '2026-01-01',
      to: '2026-01-31',
      action: 'domain.',
    });
  });

  it('drops empty and malformed values', () => {
    expect(cloudEventFilters({ from: '1/1/2026', to: '', action: '   ', page: '2' })).toEqual({});
    expect(cloudEventFilters({ action: 'a'.repeat(150) }).action).toHaveLength(60);
  });
});

describe('cloudEventFiltersQuery', () => {
  it('builds the query string in a stable order', () => {
    expect(cloudEventFiltersQuery({})).toBe('');
    expect(cloudEventFiltersQuery({ action: 'domain.added', from: '2026-01-01' })).toBe(
      '?from=2026-01-01&action=domain.added',
    );
    expect(cloudEventFiltersQuery({ action: 'a b&c' })).toBe('?action=a+b%26c');
  });
});
