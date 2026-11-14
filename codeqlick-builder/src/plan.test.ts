import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  dockerArgs,
  envFile,
  inside,
  mask,
  readRulesFile,
  cachePath,
  cachesToEvict,
} from './plan.ts';

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
  assert.equal(args[args.indexOf('--network') + 1], 'bridge');
  assert.equal(args[args.indexOf('--cpu-shares') + 1], '256');
  assert.ok(!args.includes('--runtime'));
});

test('runs the build under gVisor when a runtime is set', () => {
  const args = dockerArgs({
    name: 'cqb-2',
    work: '/w/2/src',
    rootDir: '',
    envFile: '/w/2/env',
    nodeVersion: '24',
    uid: 998,
    gid: 998,
    command: 'npm ci',
    runtime: 'runsc',
  });
  assert.equal(args[args.indexOf('--runtime') + 1], 'runsc');
  assert.ok(args.indexOf('--runtime') < args.indexOf('node:24-bookworm-slim'));
  assert.equal(args[args.indexOf('-w') + 1], '/work');
});

test('reads the build root codeqlick.json as text, and fails the build when it is not JSON', async () => {
  const src = await mkdtemp(join(tmpdir(), 'cqb-test-'));
  try {
    assert.equal(await readRulesFile(src, src), undefined);
    const text = '{ "team": "acme", "redirects": [] }\n';
    await writeFile(join(src, 'codeqlick.json'), text);
    assert.equal(await readRulesFile(src, src), text);
    await writeFile(join(src, 'codeqlick.json'), '{ "redirects": [ SECRET');
    await assert.rejects(readRulesFile(src, src), (error: Error) => {
      assert.equal(error.message, 'codeqlick.json is not valid JSON');
      return true;
    });
    await writeFile(join(src, 'codeqlick.json'), '[]');
    await assert.rejects(readRulesFile(src, src), /not valid JSON/);
  } finally {
    await rm(src, { recursive: true, force: true });
  }
});

test('refuses a symlinked codeqlick.json and a root that escapes the repository', async () => {
  const base = await mkdtemp(join(tmpdir(), 'cqb-test-'));
  try {
    const src = join(base, 'src');
    const outside = join(base, 'outside');
    await mkdir(src);
    await mkdir(outside);
    await writeFile(join(outside, 'secret.json'), '{"token":"TOPSECRET"}');
    await symlink(join(outside, 'secret.json'), join(src, 'codeqlick.json'));
    await assert.rejects(readRulesFile(src, src), (error: Error) => {
      assert.doesNotMatch(error.message, /TOPSECRET/);
      return /regular file/.test(error.message);
    });
    await writeFile(join(outside, 'codeqlick.json'), '{"redirects":[]}');
    await symlink(outside, join(src, 'app'));
    await assert.rejects(readRulesFile(src, join(src, 'app')), /outside the repository/);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('mounts the dependency cache and points the package managers at it', () => {
  const base = {
    name: 'cqb-3',
    work: '/w/3/src',
    rootDir: '',
    envFile: '/w/3/env',
    nodeVersion: '22',
    uid: 998,
    gid: 998,
    command: 'npm ci',
  };
  const plain = dockerArgs(base).join(' ');
  assert.ok(!plain.includes('/cache') && !plain.includes('npm_config_cache'));
  const args = dockerArgs({ ...base, cache: '/w/cache/p/production-node22' });
  assert.ok(args.includes('/w/cache/p/production-node22:/cache'));
  assert.equal(args[args.indexOf('/w/cache/p/production-node22:/cache') - 1], '-v');
  for (const variable of [
    'npm_config_cache=/cache/npm',
    'npm_config_logs_dir=/tmp/npm-logs',
    'YARN_CACHE_FOLDER=/cache/yarn',
    'YARN_GLOBAL_FOLDER=/cache/yarn-berry',
    'npm_config_store_dir=/cache/pnpm',
    'pnpm_config_store_dir=/cache/pnpm',
  ]) {
    assert.equal(args[args.indexOf(variable) - 1], '-e');
  }
  assert.ok(args.indexOf('/w/cache/p/production-node22:/cache') < args.indexOf('-w'));
});

test('keeps cache keys inside the cache folder', () => {
  assert.equal(
    cachePath('/w/cache', '3f9c-12/production-node22'),
    '/w/cache/3f9c-12/production-node22',
  );
  assert.throws(() => cachePath('/w/cache', '../etc/passwd'));
  assert.throws(() => cachePath('/w/cache', 'a/../../b'));
  assert.throws(() => cachePath('/w/cache', '/abs/olute'));
  assert.throws(() => cachePath('/w/cache', 'a/b/c'));
  assert.throws(() => cachePath('/w/cache', 'abc'));
  assert.throws(() => cachePath('/w/cache', 'A/b'));
  assert.throws(() => cachePath('/w/cache', 'a/b c'));
  assert.throws(() => cachePath('/w/cache', ''));
});

test('evicts the least recently used caches until the rest fits', () => {
  const entries = [
    { key: 'a/preview-node22', bytes: 400, usedAt: 300 },
    { key: 'b/production-node22', bytes: 300, usedAt: 100 },
    { key: 'c/preview-node24', bytes: 200, usedAt: 200 },
  ];
  assert.deepEqual(cachesToEvict(entries, 900), []);
  assert.deepEqual(cachesToEvict(entries, 700), ['b/production-node22']);
  assert.deepEqual(cachesToEvict(entries, 500), ['b/production-node22', 'c/preview-node24']);
  assert.deepEqual(cachesToEvict(entries, 0), [
    'b/production-node22',
    'c/preview-node24',
    'a/preview-node22',
  ]);
  assert.deepEqual(cachesToEvict([], 10), []);
  assert.equal(entries[0]?.key, 'a/preview-node22'); // the input isn't reordered
});
