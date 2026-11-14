import { describe, expect, it } from 'vitest';
import { cloudSlug, formatBytes, isGitBranchName } from './cloud';

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

describe('isGitBranchName', () => {
  it('takes the branch names Git takes', () => {
    for (const name of ['staging', 'feature/login', 'release-1.2', 'v2_beta']) {
      expect(isGitBranchName(name), name).toBe(true);
    }
  });

  it('refuses the ones Git refuses', () => {
    for (const name of [
      '',
      'a b',
      'a~1',
      'a:b',
      'a[b',
      'a\\b',
      'a..b',
      'a@{1}',
      '@',
      '-x',
      '/x',
      'x/',
      'x.',
      'x.lock',
      '.x',
      'a/.x',
      'x'.repeat(201),
    ]) {
      expect(isGitBranchName(name), name).toBe(false);
    }
  });
});
