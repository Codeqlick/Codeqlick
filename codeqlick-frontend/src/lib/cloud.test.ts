import { describe, expect, it } from 'vitest';
import { cloudSlug, formatBytes, monitorKeyword, monitorKeywordMode } from './cloud';

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

describe('monitorKeyword', () => {
  it('is null when empty and the trimmed text otherwise', () => {
    expect(monitorKeyword('')).toBeNull();
    expect(monitorKeyword('   ')).toBeNull();
    expect(monitorKeyword('  Add to cart ')).toBe('Add to cart');
    expect(monitorKeyword('a'.repeat(100))).toHaveLength(100);
  });

  it('refuses more than 100 characters and line breaks', () => {
    expect(monitorKeyword('a'.repeat(101))).toBeUndefined();
    expect(monitorKeyword('two\nlines')).toBeUndefined();
    expect(monitorKeyword('two\r\nlines')).toBeUndefined();
  });
});

describe('monitorKeywordMode', () => {
  it('defaults to CONTAINS', () => {
    expect(monitorKeywordMode('NOT_CONTAINS')).toBe('NOT_CONTAINS');
    expect(monitorKeywordMode('CONTAINS')).toBe('CONTAINS');
    expect(monitorKeywordMode('')).toBe('CONTAINS');
    expect(monitorKeywordMode('other')).toBe('CONTAINS');
  });
});
