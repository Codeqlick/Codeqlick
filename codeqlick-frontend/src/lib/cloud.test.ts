import { describe, expect, it } from 'vitest';
import { cloudSlug, formatBytes, usageWarnings } from './cloud';

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

describe('usageWarnings', () => {
  const meter = (key: string, percent: number) => ({ key, used: percent, limit: 100, percent });

  it('is null while every limit is under 80 %', () => {
    expect(usageWarnings([])).toBeNull();
    expect(usageWarnings([meter('builds', 0), meter('storage', 79)])).toBeNull();
  });

  it('warns from 80 % and lists only the limits at or over it', () => {
    const result = usageWarnings([meter('builds', 80), meter('storage', 10), meter('x', 99)]);
    expect(result?.level).toBe('warning');
    expect(result?.meters.map((m) => m.key)).toEqual(['builds', 'x']);
  });

  it('is an error from 100 %, also past it', () => {
    expect(usageWarnings([meter('builds', 100)])?.level).toBe('error');
    expect(usageWarnings([meter('builds', 85), meter('storage', 130)])?.level).toBe('error');
  });
});
