import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  choosePackageManager,
  containerCommand,
  DEFAULT_BUILD,
  DEFAULT_INSTALL,
  dockerArgs,
  envFile,
  inside,
  mask,
  readRulesFile,
  cachePath,
  cachesToEvict,
  type CheckoutFiles,
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

/** A checkout in memory: file paths relative to the repository and their contents. */
function checkout(tree: Record<string, string>): CheckoutFiles {
  return {
    exists: (path) => path in tree,
    readText: (path) => tree[path] ?? null,
  };
}

function choose(
  tree: Record<string, string>,
  options: { rootDir?: string; installCommand?: string; buildCommand?: string } = {},
) {
  return choosePackageManager({
    rootDir: options.rootDir ?? '',
    installCommand: options.installCommand ?? DEFAULT_INSTALL,
    buildCommand: options.buildCommand ?? DEFAULT_BUILD,
    files: checkout(tree),
  });
}

test('builds pnpm projects with pnpm', () => {
  assert.deepEqual(choose({ 'package.json': '{}', 'pnpm-lock.yaml': '' }), {
    install: 'pnpm install --frozen-lockfile',
    build: 'pnpm run build',
    log: 'Package manager: pnpm (pnpm-lock.yaml)',
  });
});

test('builds Yarn 1 projects with Yarn 1', () => {
  assert.deepEqual(choose({ 'yarn.lock': '' }), {
    install: 'yarn install --frozen-lockfile',
    build: 'yarn run build',
    log: 'Package manager: Yarn 1 (yarn.lock)',
  });
});

test('builds Yarn 2+ projects when .yarnrc.yml sits next to yarn.lock or in the root folder', () => {
  const nextToLock = choose({ 'yarn.lock': '', '.yarnrc.yml': '' }, { rootDir: 'web' });
  assert.equal(nextToLock.install, 'yarn install --immutable');
  assert.equal(nextToLock.build, 'yarn run build');
  // Corepack's default Yarn is 1.x: without packageManager the log suggests setting it.
  assert.equal(
    nextToLock.log,
    'Package manager: Yarn 2+ (yarn.lock in ..; set packageManager in package.json so Corepack runs Yarn 2+)',
  );
  const inRoot = choose({ 'yarn.lock': '', 'web/.yarnrc.yml': '' }, { rootDir: 'web' });
  assert.equal(inRoot.install, 'yarn install --immutable');
});

test('the packageManager version decides the Yarn major, over .yarnrc.yml', () => {
  const tree = { 'yarn.lock': '', '.yarnrc.yml': '' };
  const one = choose({ ...tree, 'package.json': '{"packageManager":"yarn@1.22.22"}' });
  assert.equal(one.install, 'yarn install --frozen-lockfile');
  assert.equal(one.log, 'Package manager: Yarn 1 (packageManager in package.json; yarn.lock)');
  const four = choose({ ...tree, 'package.json': '{"packageManager":"yarn@4.5.1"}' });
  assert.equal(four.log, 'Package manager: Yarn 2+ (packageManager in package.json; yarn.lock)');
});

test('builds Yarn 2+ projects whose packageManager is yarn@4', () => {
  const choice = choose({ 'yarn.lock': '', 'package.json': '{"packageManager":"yarn@4.5.1"}' });
  assert.equal(choice.install, 'yarn install --immutable');
  assert.equal(choice.log, 'Package manager: Yarn 2+ (packageManager in package.json; yarn.lock)');
  const one = choose({ 'yarn.lock': '', 'package.json': '{"packageManager":"yarn@1.22.22"}' });
  assert.equal(one.install, 'yarn install --frozen-lockfile');
});

test('keeps npm ci for npm lockfiles', () => {
  for (const lockfile of ['package-lock.json', 'npm-shrinkwrap.json']) {
    assert.deepEqual(choose({ [lockfile]: '' }), {
      install: 'npm ci',
      build: 'npm run build',
      log: `Package manager: npm (${lockfile})`,
    });
  }
});

test('uses npm install when there is no lockfile', () => {
  assert.deepEqual(choose({ 'package.json': '{"name":"site"}' }), {
    install: 'npm install',
    build: 'npm run build',
    log: 'Package manager: npm (no lockfile)',
  });
});

test('prefers pnpm, then Yarn, then npm inside one folder', () => {
  const all = { 'pnpm-lock.yaml': '', 'yarn.lock': '', 'package-lock.json': '' };
  assert.equal(choose(all).build, 'pnpm run build');
  assert.equal(choose({ 'yarn.lock': '', 'package-lock.json': '' }).build, 'yarn run build');
});

test('finds the lockfile of a monorepo in a parent folder, the nearest first', () => {
  const tree = { 'pnpm-lock.yaml': '', 'apps/web/package.json': '{}' };
  assert.deepEqual(choose(tree, { rootDir: 'apps/web' }), {
    install: 'pnpm install --frozen-lockfile',
    build: 'pnpm run build',
    log: 'Package manager: pnpm (pnpm-lock.yaml in ../..)',
  });
  const nearer = choose({ ...tree, 'apps/yarn.lock': '' }, { rootDir: 'apps/web/' });
  assert.equal(nearer.log, 'Package manager: Yarn 1 (yarn.lock in ..)');
});

test('never looks above the repository root', () => {
  const seen: string[] = [];
  const choice = choosePackageManager({
    rootDir: 'apps/web',
    installCommand: DEFAULT_INSTALL,
    buildCommand: DEFAULT_BUILD,
    files: {
      exists: (path) => {
        seen.push(path);
        return false;
      },
      readText: () => null,
    },
  });
  assert.equal(choice.log, 'Package manager: npm (no lockfile)');
  assert.ok(seen.includes('pnpm-lock.yaml') && seen.includes('apps/pnpm-lock.yaml'));
  assert.ok(seen.every((path) => !path.startsWith('..') && !path.startsWith('/')));
  assert.throws(() => choose({}, { rootDir: '../other' }));
});

test('falls back to the packageManager field of the root folder', () => {
  assert.deepEqual(choose({ 'package.json': '{"packageManager":"pnpm@9.12.0+sha512.abc"}' }), {
    install: 'pnpm install',
    build: 'pnpm run build',
    log: 'Package manager: pnpm (packageManager in package.json)',
  });
  const yarn = choose(
    { 'package.json': '{}', 'web/package.json': '{"packageManager":"yarn@3.8.0"}' },
    { rootDir: 'web' },
  );
  // Without a lockfile Yarn can't install immutably: it would refuse to create one.
  assert.equal(yarn.install, 'yarn install');
  assert.equal(yarn.log, 'Package manager: Yarn 2+ (packageManager in package.json)');
  const npm = choose({ 'package.json': '{"packageManager":"npm@10.9.0"}' });
  assert.equal(npm.install, 'npm install');
  assert.equal(npm.log, 'Package manager: npm (packageManager in package.json)');
  // The field of a parent's package.json doesn't count: only the root folder's.
  const parent = choose({ 'package.json': '{"packageManager":"pnpm@9.0.0"}' }, { rootDir: 'web' });
  assert.equal(parent.log, 'Package manager: npm (no lockfile)');
});

test('the packageManager field picks the manager over another lockfile', () => {
  assert.deepEqual(
    choose({ 'pnpm-lock.yaml': '', 'package.json': '{"packageManager":"yarn@4.5.1"}' }),
    {
      install: 'yarn install',
      build: 'yarn run build',
      log: 'Package manager: Yarn 2+ (packageManager in package.json; pnpm-lock.yaml ignored)',
    },
  );
  const npm = choose({
    'package-lock.json': '',
    'package.json': '{"packageManager":"pnpm@9.0.0"}',
  });
  assert.equal(npm.install, 'pnpm install');
  assert.equal(
    npm.log,
    'Package manager: pnpm (packageManager in package.json; package-lock.json ignored)',
  );
});

test('the packageManager field uses its own lockfile in the nearest folder that has one', () => {
  const tree = {
    'pnpm-lock.yaml': '',
    'package-lock.json': '',
    'apps/web/package.json': '{"packageManager":"pnpm@9.0.0"}',
  };
  assert.deepEqual(choose(tree, { rootDir: 'apps/web' }), {
    install: 'pnpm install --frozen-lockfile',
    build: 'pnpm run build',
    log: 'Package manager: pnpm (packageManager in package.json; pnpm-lock.yaml in ../..; package-lock.json ignored)',
  });
  // Only the nearest folder with a lockfile counts: its own lockfile further up doesn't.
  const nearer = choose({ ...tree, 'apps/yarn.lock': '' }, { rootDir: 'apps/web' });
  assert.equal(nearer.install, 'pnpm install');
  assert.equal(
    nearer.log,
    'Package manager: pnpm (packageManager in package.json; yarn.lock ignored)',
  );
  const npm = choose({
    'npm-shrinkwrap.json': '',
    'package.json': '{"packageManager":"npm@10.9.0"}',
  });
  assert.equal(npm.install, 'npm ci');
});

test('says which other lockfiles a folder has', () => {
  assert.equal(
    choose({ 'pnpm-lock.yaml': '', 'yarn.lock': '', 'package-lock.json': '' }).log,
    'Package manager: pnpm (pnpm-lock.yaml; also found yarn.lock, package-lock.json)',
  );
});

test("ignores Bun's lockfiles and says so", () => {
  assert.deepEqual(choose({ 'bun.lock': '' }), {
    install: 'npm install',
    build: 'npm run build',
    log: 'Package manager: npm (no lockfile; bun.lock found, but the build image has no Bun)',
  });
  const below = choose({ 'apps/web/bun.lockb': '', 'yarn.lock': '' }, { rootDir: 'apps/web' });
  assert.equal(
    below.log,
    'Package manager: Yarn 1 (yarn.lock in ../..; bun.lockb found, but the build image has no Bun)',
  );
});

test('replaces only the commands still at their default', () => {
  const customInstall = choose(
    { 'pnpm-lock.yaml': '' },
    { installCommand: 'pnpm install --prod=false' },
  );
  assert.equal(customInstall.install, 'pnpm install --prod=false');
  assert.equal(customInstall.build, 'pnpm run build');
  const customBuild = choose({ 'yarn.lock': '' }, { buildCommand: 'npm run export' });
  assert.equal(customBuild.install, 'yarn install --frozen-lockfile');
  assert.equal(customBuild.build, 'npm run export');
});

test('changes nothing when both commands are custom', () => {
  assert.deepEqual(
    choose({ 'pnpm-lock.yaml': '' }, { installCommand: 'make deps', buildCommand: 'make site' }),
    { install: 'make deps', build: 'make site', log: 'Package manager: custom commands' },
  );
});

test('tolerates an invalid package.json', () => {
  for (const text of [
    '{ not json',
    'null',
    '"text"',
    '{"packageManager":42}',
    '{"packageManager":"deno@2"}',
  ]) {
    assert.equal(choose({ 'package.json': text }).log, 'Package manager: npm (no lockfile)');
  }
});

test('runs Corepack before the commands without letting it fail the build', () => {
  const command = containerCommand('pnpm install --frozen-lockfile', 'pnpm run build');
  assert.ok(
    command.startsWith(
      'mkdir -p /tmp/.corepack-bin && corepack enable --install-directory /tmp/.corepack-bin',
    ),
  );
  assert.ok(command.includes('; export PATH=/tmp/.corepack-bin:$PATH; '));
  assert.ok(command.endsWith('; pnpm install --frozen-lockfile && pnpm run build'));
  const args = dockerArgs({
    name: 'cqb-3',
    work: '/w/3/src',
    rootDir: '',
    envFile: '/w/3/env',
    nodeVersion: '24',
    uid: 998,
    gid: 998,
    command,
  });
  assert.equal(args.at(-1), command);
  for (const variable of ['HOME=/tmp', 'CI=true', 'COREPACK_ENABLE_DOWNLOAD_PROMPT=0']) {
    assert.equal(args[args.indexOf(variable) - 1], '-e');
  }
  assert.ok(args.indexOf('COREPACK_ENABLE_DOWNLOAD_PROMPT=0') < args.indexOf('--env-file'));
});
