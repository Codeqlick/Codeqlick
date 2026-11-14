import { describe, expect, it } from 'vitest';
import { cloudSlug, cloudTokenOptions, formatBytes } from './cloud';

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

describe('cloudTokenOptions', () => {
  it('sends read only only when it was chosen', () => {
    expect(cloudTokenOptions({ team: '', expiry: '90', access: 'readOnly' }).readOnly).toBe(true);
    expect(cloudTokenOptions({ team: '', expiry: '90', access: 'full' }).readOnly).toBe(false);
    expect(cloudTokenOptions({ team: '', expiry: '90', access: '' }).readOnly).toBe(false);
    expect(cloudTokenOptions({ team: '', expiry: '90', access: 'admin' }).readOnly).toBe(false);
  });

  it('maps the team and the expiry', () => {
    expect(cloudTokenOptions({ team: 'acme', expiry: 'never', access: 'full' })).toEqual({
      teamSlug: 'acme',
      expiresInDays: null,
      readOnly: false,
    });
    expect(cloudTokenOptions({ team: '', expiry: '30', access: 'full' }).teamSlug).toBeUndefined();
    expect(cloudTokenOptions({ team: '', expiry: '30', access: 'full' }).expiresInDays).toBe(30);
    expect(cloudTokenOptions({ team: '', expiry: '365', access: 'full' }).expiresInDays).toBe(365);
    expect(cloudTokenOptions({ team: '', expiry: 'x', access: 'full' }).expiresInDays).toBe(90);
  });
});
