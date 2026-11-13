import { describe, expect, it } from 'vitest';
import { cloudSlug, formatBytes, hookBranchValid, hookName } from './cloud';

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

describe('hookName', () => {
  it('trims and keeps 1 to 60 characters', () => {
    expect(hookName('  Contentful  ')).toBe('Contentful');
    expect(hookName('   ')).toBeNull();
    expect(hookName('a'.repeat(60))).toHaveLength(60);
    expect(hookName('a'.repeat(61))).toBeNull();
  });
});

describe('hookBranchValid', () => {
  it("follows the API's branch rule", () => {
    expect(hookBranchValid('feature/new-docs_1.0')).toBe(true);
    expect(hookBranchValid('a b')).toBe(false);
    expect(hookBranchValid('a'.repeat(201))).toBe(false);
  });
});
