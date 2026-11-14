import { describe, expect, it } from 'vitest';
import {
  addressHost,
  addressHref,
  cloudSlug,
  formatBytes,
  isAddressHost,
  isProtected,
  protectionInput,
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

describe('password protection', () => {
  it('protects previews, or everything', () => {
    expect(isProtected('OFF', 'previews')).toBe(false);
    expect(isProtected('PREVIEWS', 'previews')).toBe(true);
    expect(isProtected('PREVIEWS', 'production')).toBe(false);
    expect(isProtected('ALL', 'production')).toBe(true);
  });

  it('takes the host out of an address', () => {
    expect(addressHost('https://Docs--ab12cd.codeqlick.app/')).toBe('docs--ab12cd.codeqlick.app');
    expect(addressHost('https://docs.example.com/path?x=1')).toBe('docs.example.com');
    expect(addressHost('docs.example.com')).toBe('docs.example.com');
    expect(isAddressHost('docs--ab12cd.codeqlick.app')).toBe(true);
    expect(isAddressHost('evil.com/@x')).toBe(false);
    expect(isAddressHost('localhost')).toBe(false);
  });

  it('links protected addresses through the open route', () => {
    const open = '/es/cloud/console/acme/docs/open';
    expect(addressHref('OFF', 'previews', 'https://docs--ab12.codeqlick.app', open)).toBe(
      'https://docs--ab12.codeqlick.app',
    );
    expect(addressHref('PREVIEWS', 'production', 'https://docs.codeqlick.app', open)).toBe(
      'https://docs.codeqlick.app',
    );
    expect(addressHref('PREVIEWS', 'previews', 'https://docs--ab12.codeqlick.app/', open)).toBe(
      `${open}?host=docs--ab12.codeqlick.app`,
    );
  });

  it('turns the form into the PUT body', () => {
    const on = { mode: 'PREVIEWS', password: '', days: '7' };
    expect(protectionInput(on, false)).toEqual({
      ok: false,
      field: 'password',
      reason: 'required',
    });
    expect(protectionInput(on, true)).toEqual({ ok: true, input: { mode: 'PREVIEWS', days: 7 } });
    expect(protectionInput({ ...on, password: 'short' }, true)).toEqual({
      ok: false,
      field: 'password',
      reason: 'invalid',
    });
    expect(protectionInput({ ...on, password: 'x'.repeat(129) }, true)).toMatchObject({
      ok: false,
    });
    expect(protectionInput({ mode: 'ALL', password: 'correct horse', days: '30' }, false)).toEqual({
      ok: true,
      input: { mode: 'ALL', password: 'correct horse', days: 30 },
    });
    expect(protectionInput({ mode: 'OFF', password: 'ignored!!', days: '1' }, false)).toEqual({
      ok: true,
      input: { mode: 'OFF', days: 1 },
    });
    expect(protectionInput({ ...on, mode: 'SOME' }, true)).toMatchObject({ field: 'mode' });
    expect(protectionInput({ ...on, days: '2' }, true)).toMatchObject({ field: 'days' });
  });
});
