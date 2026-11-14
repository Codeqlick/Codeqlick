import { describe, expect, it } from 'vitest';
import {
  cloudSlug,
  filterFiles,
  formatBytes,
  formatSizeChange,
  formatWhen,
  isDeploymentId,
  productionLockValues,
} from './cloud';

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

describe('isDeploymentId', () => {
  it('accepts a UUID only', () => {
    expect(isDeploymentId('0b9f3c2e-1a2b-4c3d-8e9f-a0b1c2d3e4f5')).toBe(true);
    expect(isDeploymentId('0B9F3C2E-1A2B-4C3D-8E9F-A0B1C2D3E4F5')).toBe(true);
    expect(isDeploymentId('0b9f3c2e')).toBe(false);
    expect(isDeploymentId('../files')).toBe(false);
    expect(isDeploymentId('')).toBe(false);
  });
});

describe('filterFiles', () => {
  const files = [
    { path: 'about/index.html', size: 10 },
    { path: 'assets/App.CSS', size: 20 },
    { path: 'assets/app.js', size: 30 },
    { path: 'index.html', size: 40 },
  ];

  it('returns the same list for an empty query', () => {
    expect(filterFiles(files, '')).toBe(files);
    expect(filterFiles(files, '   ')).toBe(files);
  });

  it('matches part of the path, ignoring case', () => {
    expect(filterFiles(files, '.css').map((file) => file.path)).toEqual(['assets/App.CSS']);
    expect(filterFiles(files, 'INDEX').map((file) => file.path)).toEqual([
      'about/index.html',
      'index.html',
    ]);
  });

  it('needs every word to match, in any order', () => {
    expect(filterFiles(files, 'app assets').map((file) => file.path)).toEqual([
      'assets/App.CSS',
      'assets/app.js',
    ]);
    expect(filterFiles(files, ' js   app ').map((file) => file.path)).toEqual(['assets/app.js']);
    expect(filterFiles(files, 'nothing')).toEqual([]);
  });
});

describe('formatSizeChange', () => {
  it('signs the difference', () => {
    expect(formatSizeChange(2560, 1024, 'en')).toBe('+1.5 KB');
    expect(formatSizeChange(100, 612, 'en')).toBe('−512 B');
    expect(formatSizeChange(2560, 1024, 'es')).toBe('+1,5 KB');
    expect(formatSizeChange(300, 300, 'en')).toBe('±0 B');
  });
});

describe('productionLockValues', () => {
  const at = '2026-11-12T17:05:00.000Z';

  it('names the deployment, the date and who locked it', () => {
    expect(productionLockValues({ at, by: { id: 'u1', name: 'Ana' } }, 'abc1234', 'es')).toEqual({
      id: 'abc1234',
      since: formatWhen(at, 'es'),
      who: 'person',
      name: 'Ana',
    });
  });

  it('says a former member when the person left, and no id without production', () => {
    expect(productionLockValues({ at, by: null }, null, 'en')).toEqual({
      id: null,
      since: formatWhen(at, 'en'),
      who: 'former',
      name: '',
    });
  });
});
