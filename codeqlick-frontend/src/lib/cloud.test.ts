import { describe, expect, it } from 'vitest';
import {
  addressHost,
  addressHref,
  cloudEventFilters,
  cloudEventFiltersQuery,
  cloudSlug,
  cloudTokenOptions,
  configJson,
  describeRebuild,
  envImportErrors,
  filterFiles,
  formatBytes,
  formatSizeChange,
  formatWhen,
  hookBranchValid,
  hookName,
  isAddressHost,
  isDeploymentId,
  isProtected,
  monitorKeyword,
  monitorKeywordMode,
  notifiedFormNames,
  parseRebuildForm,
  productionLockValues,
  protectionInput,
  ruleSettings,
  spamReasonKey,
  submissionsView,
  transferTargets,
  usageWarnings,
  weekdayName,
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

describe('cloudEventFilters', () => {
  it('keeps well-formed dates and a trimmed, lowercased action', () => {
    expect(
      cloudEventFilters({ from: '2026-01-01', to: ['2026-01-31', 'x'], action: ' Domain. ' }),
    ).toEqual({
      from: '2026-01-01',
      to: '2026-01-31',
      action: 'domain.',
    });
  });

  it('drops empty and malformed values', () => {
    expect(cloudEventFilters({ from: '1/1/2026', to: '', action: '   ', page: '2' })).toEqual({});
    expect(cloudEventFilters({ action: 'a'.repeat(150) }).action).toHaveLength(60);
  });
});

describe('cloudEventFiltersQuery', () => {
  it('builds the query string in a stable order', () => {
    expect(cloudEventFiltersQuery({})).toBe('');
    expect(cloudEventFiltersQuery({ action: 'domain.added', from: '2026-01-01' })).toBe(
      '?from=2026-01-01&action=domain.added',
    );
    expect(cloudEventFiltersQuery({ action: 'a b&c' })).toBe('?action=a+b%26c');
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

describe('notifiedFormNames', () => {
  const forms = [
    { id: 'a', name: 'Contact' },
    { id: 'b', name: 'Quote' },
  ];

  it('is null for all forms', () => {
    expect(notifiedFormNames([], forms)).toBeNull();
    expect(notifiedFormNames([], [])).toBeNull();
  });

  it("names the listed forms in the channel's order", () => {
    expect(notifiedFormNames(['b', 'a'], forms)).toEqual(['Quote', 'Contact']);
    expect(notifiedFormNames(['a'], forms)).toEqual(['Contact']);
  });

  it('marks forms it does not know', () => {
    expect(notifiedFormNames(['a', 'z'], forms)).toEqual(['Contact', '—']);
    expect(notifiedFormNames(['a'], [])).toEqual(['—']);
  });
});

describe('parseRebuildForm', () => {
  it('sends only the fields the frequency uses', () => {
    const form = { minute: '30', hour: '6', weekday: '3' };
    expect(parseRebuildForm({ ...form, frequency: 'off' })).toEqual({
      ok: true,
      body: { frequency: 'off' },
    });
    expect(parseRebuildForm({ ...form, frequency: 'hourly' })).toEqual({
      ok: true,
      body: { frequency: 'hourly', minute: 30 },
    });
    expect(parseRebuildForm({ ...form, frequency: 'daily' })).toEqual({
      ok: true,
      body: { frequency: 'daily', minute: 30, hour: 6 },
    });
    expect(parseRebuildForm({ ...form, frequency: 'weekly' })).toEqual({
      ok: true,
      body: { frequency: 'weekly', minute: 30, hour: 6, weekday: 3 },
    });
  });

  it('ignores the fields the frequency does not use, even when wrong', () => {
    expect(parseRebuildForm({ frequency: 'hourly', minute: '0', hour: '99', weekday: '' })).toEqual(
      { ok: true, body: { frequency: 'hourly', minute: 0 } },
    );
  });

  it('reports missing and out-of-range fields', () => {
    expect(parseRebuildForm({ frequency: 'every-minute' })).toEqual({
      ok: false,
      errors: { frequency: 'required' },
    });
    expect(parseRebuildForm({ frequency: 'weekly', minute: '', hour: '24', weekday: '0' })).toEqual(
      { ok: false, errors: { minute: 'required', hour: 'range', weekday: 'range' } },
    );
    expect(parseRebuildForm({ frequency: 'daily', minute: '1.5', hour: '-1' })).toEqual({
      ok: false,
      errors: { minute: 'range', hour: 'range' },
    });
  });
});

describe('weekdayName', () => {
  it('counts from Monday', () => {
    expect(weekdayName(1, 'en')).toBe('Monday');
    expect(weekdayName(7, 'en')).toBe('Sunday');
    expect(weekdayName(3, 'es')).toBe('miércoles');
  });
});

describe('describeRebuild', () => {
  const schedule = { minute: 30, hour: 6, weekday: 1 };
  it('gives the message key and its values', () => {
    expect(describeRebuild({ ...schedule, frequency: 'daily' }, 'en')).toEqual({
      key: 'daily',
      values: { minute: '30', time: '06:30', weekday: 'Monday' },
    });
    expect(describeRebuild({ ...schedule, frequency: 'weekly' }, 'es')?.values.weekday).toBe(
      'lunes',
    );
    expect(
      describeRebuild({ frequency: 'hourly', minute: 5, hour: null, weekday: null }, 'en'),
    ).toEqual({ key: 'hourly', values: { minute: '05', time: '', weekday: '' } });
  });

  it('is null when off or incomplete', () => {
    expect(describeRebuild({ ...schedule, frequency: 'off' }, 'en')).toBeNull();
    expect(describeRebuild({ ...schedule, hour: null, frequency: 'daily' }, 'en')).toBeNull();
  });
});

describe('spamReasonKey', () => {
  it('keeps the known reasons and reads anything else as manual', () => {
    expect(spamReasonKey('markup')).toBe('markup');
    expect(spamReasonKey('repeat')).toBe('repeat');
    expect(spamReasonKey(null)).toBe('manual');
    expect(spamReasonKey('other')).toBe('manual');
  });
});

describe('submissionsView', () => {
  it('is the inbox unless the view is spam', () => {
    expect(submissionsView('spam')).toBe('spam');
    expect(submissionsView(undefined)).toBe('inbox');
    expect(submissionsView('SPAM')).toBe('inbox');
  });
});
