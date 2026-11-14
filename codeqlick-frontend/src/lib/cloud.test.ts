import { describe, expect, it } from 'vitest';
import {
  addressHost,
  addressHref,
  cloudSlug,
  configJson,
  formatBytes,
  hookBranchValid,
  hookName,
  isAddressHost,
  isProtected,
  protectionInput,
  ruleSettings,
  transferTargets,
  usageWarnings,
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

describe('ruleSettings', () => {
  it('lists only the settings that differ from the defaults', () => {
    expect(ruleSettings({ cleanUrls: true, trailingSlash: null })).toEqual([]);
    expect(ruleSettings({ cleanUrls: false, trailingSlash: null })).toEqual([
      { key: 'cleanUrls', value: false },
    ]);
    expect(ruleSettings({ cleanUrls: true, trailingSlash: false })).toEqual([
      { key: 'trailingSlash', value: false },
    ]);
  });
});

describe('configJson', () => {
  it('pretty-prints the config with two spaces', () => {
    expect(configJson({ trailingSlash: true })).toBe('{\n  "trailingSlash": true\n}');
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

describe('transferTargets', () => {
  it('keeps the other teams the caller owns or runs', () => {
    const teams = [
      { slug: 'studio', role: 'OWNER' },
      { slug: 'client', role: 'ADMIN' },
      { slug: 'friends', role: 'MEMBER' },
      { slug: 'mine', role: 'OWNER' },
    ];
    expect(transferTargets(teams, 'studio').map((team) => team.slug)).toEqual(['client', 'mine']);
    expect(transferTargets([{ slug: 'studio', role: 'OWNER' }], 'studio')).toEqual([]);
  });
});
