import { describe, expect, it } from 'vitest';
import { cloudSlug, envImportErrors, formatBytes } from './cloud';

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

describe('envImportErrors', () => {
  it('keeps the line, the name and the message, in line order', () => {
    expect(
      envImportErrors([
        { path: 'content', line: 7, key: 'API_KEY', message: 'Twice in the file' },
        { path: 'content', line: 2, message: 'Not KEY=value' },
      ]),
    ).toEqual([
      { line: 2, message: 'Not KEY=value' },
      { line: 7, key: 'API_KEY', message: 'Twice in the file' },
    ]);
  });

  it('leaves the line out when the API names none', () => {
    expect(envImportErrors([{ path: 'lines.4', message: 'Too long' }])).toEqual([
      { line: null, message: 'Too long' },
    ]);
  });
});
