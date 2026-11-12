import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dockerArgs, envFile, inside, mask } from './plan.ts';

test('hides secrets, the longest first', () => {
  assert.equal(
    mask('token ghs_abcdef and key sk-1234 and ghs_abcdef', ['ghs_abcdef', 'sk-1234', 'ab']),
    'token *** and key *** and ***',
  );
});

test('keeps folders inside the repository', () => {
  assert.equal(inside('/w/src', 'apps/web'), '/w/src/apps/web');
  assert.equal(inside('/w/src', ''), '/w/src');
  assert.throws(() => inside('/w/src', '../etc'));
  assert.throws(() => inside('/w/src', 'a/../../b'));
});

test('writes an env file and a locked-down docker run', () => {
  assert.equal(envFile({ A: 'x', B: 'two\nlines' }), 'A=x\nB=two lines');
  const args = dockerArgs({
    name: 'cqb-1',
    work: '/w/1/src',
    rootDir: 'web',
    envFile: '/w/1/env',
    nodeVersion: '22',
    uid: 998,
    gid: 998,
    command: 'npm ci && npm run build',
  });
  assert.ok(args.includes('--rm') && args.includes('ALL') && args.includes('no-new-privileges'));
  assert.equal(args[args.indexOf('--user') + 1], '998:998');
  assert.equal(args[args.indexOf('-w') + 1], '/work/web');
  assert.ok(args.includes('node:22-bookworm-slim'));
  assert.ok(!args.join(' ').includes('docker.sock'));
});
