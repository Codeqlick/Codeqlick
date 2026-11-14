import { describe, expect, it } from 'vitest';
import { cloudSlug, expiringInDays, formatBytes } from './cloud';

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

describe('expiringInDays', () => {
  const now = new Date('2026-11-14T12:00:00Z');
  const at = (hours: number) => new Date(now.getTime() + hours * 3600_000).toISOString();

  it('is null without expiry, when expired or when far away', () => {
    expect(expiringInDays(null, now)).toBeNull();
    expect(expiringInDays(at(-1), now)).toBeNull();
    expect(expiringInDays(at(7 * 24 + 1), now)).toBeNull();
    expect(expiringInDays(at(30 * 24), now)).toBeNull();
  });

  it('is 0 under 24 hours', () => {
    expect(expiringInDays(at(1), now)).toBe(0);
    expect(expiringInDays(at(23), now)).toBe(0);
  });

  it('rounds the days up within 7 days', () => {
    expect(expiringInDays(at(24), now)).toBe(1);
    expect(expiringInDays(at(25), now)).toBe(2);
    expect(expiringInDays(at(7 * 24), now)).toBe(7);
  });
});
