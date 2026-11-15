import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bypassSummary, parseProtectDays, parseProtectMode, protectionNote } from './cli.ts';

test('protect takes off, previews or all', () => {
  assert.equal(parseProtectMode('off'), 'OFF');
  assert.equal(parseProtectMode('previews'), 'PREVIEWS');
  assert.equal(parseProtectMode('ALL'), 'ALL');
  assert.equal(parseProtectMode('production'), null);
  assert.equal(parseProtectMode('constructor'), null);
  assert.equal(parseProtectMode('__proto__'), null);
  assert.equal(parseProtectMode(''), null);
});

test('--days is 1, 7 or 30, and absent keeps the current days', () => {
  assert.equal(parseProtectDays(undefined), undefined);
  assert.equal(parseProtectDays('1'), 1);
  assert.equal(parseProtectDays('7'), 7);
  assert.equal(parseProtectDays('30'), 30);
  assert.equal(parseProtectDays('14'), null);
  assert.equal(parseProtectDays('7.5'), null);
  assert.equal(parseProtectDays(''), null);
  assert.equal(parseProtectDays('week'), null);
});

test('the note names only the printed addresses that ask for the password', () => {
  const preview = { preview: true, production: false };
  const both = { preview: true, production: true };
  assert.equal(protectionNote('OFF', both), null);
  assert.match(protectionNote('PREVIEWS', preview) ?? '', /^The address asks/);
  assert.match(protectionNote('ALL', preview) ?? '', /^The address asks/);
  assert.match(protectionNote('ALL', both) ?? '', /^Both addresses ask/);
  assert.match(protectionNote('PREVIEWS', both) ?? '', /published one doesn't/);
  assert.equal(protectionNote('PREVIEWS', { preview: false, production: true }), null);
  assert.match(
    protectionNote('ALL', { preview: false, production: true }) ?? '',
    /^The address asks/,
  );
});

test('the bypass summary shows the prefix and last use, or that none is set', () => {
  assert.match(bypassSummary(null), /^none \(create one with: codeqlick protect bypass\)$/);
  const bypass = {
    prefix: 'cqb_abcdefgh',
    createdAt: '2026-11-14T10:00:00.000Z',
    createdBy: { id: 'u', name: 'Ada' },
    lastUsedAt: null,
  };
  assert.equal(bypassSummary(bypass), 'cqb_abcdefgh… (never used)');
  const used = bypassSummary({ ...bypass, lastUsedAt: '2026-11-14T11:00:00.000Z' });
  assert.match(used, /^cqb_abcdefgh… \(last used .+\)$/);
  assert.doesNotMatch(bypassSummary(bypass), /cqb_abcdefghi/);
});
