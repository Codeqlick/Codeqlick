import { describe, expect, it } from 'vitest';
import { cloudSlug, formatBytes, parseSlowMs } from './cloud';

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

describe('parseSlowMs', () => {
  it('reads an empty field as off', () => {
    expect(parseSlowMs('')).toEqual({ ok: true, value: null });
    expect(parseSlowMs('  ')).toEqual({ ok: true, value: null });
  });

  it('accepts whole milliseconds from 500 to 14000', () => {
    expect(parseSlowMs('500')).toEqual({ ok: true, value: 500 });
    expect(parseSlowMs(' 1200 ')).toEqual({ ok: true, value: 1200 });
    expect(parseSlowMs('14000')).toEqual({ ok: true, value: 14000 });
  });

  it('refuses the rest', () => {
    for (const raw of ['499', '14001', '1000.5', 'abc', '-1000', '1e3x']) {
      expect(parseSlowMs(raw)).toEqual({ ok: false });
    }
  });
});
