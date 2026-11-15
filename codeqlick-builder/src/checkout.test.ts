import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { checkoutFiles, MAX_READ_BYTES } from './checkout.ts';

const temp = mkdtempSync(join(tmpdir(), 'cqb-checkout-'));
after(() => rmSync(temp, { recursive: true, force: true }));
const src = join(temp, 'src');
const host = join(temp, 'host');
mkdirSync(join(src, 'apps', 'web'), { recursive: true });
mkdirSync(host);
writeFileSync(join(src, 'package.json'), '{"packageManager":"pnpm@9.0.0"}');
writeFileSync(join(src, 'pnpm-lock.yaml'), '');
writeFileSync(join(host, 'package.json'), '{"secret":true}');
writeFileSync(join(host, 'yarn.lock'), '');
symlinkSync(join(host, 'package.json'), join(src, 'apps', 'web', 'package.json'));
symlinkSync(host, join(src, 'outside'));
symlinkSync(host, join(src, 'apps', 'linked'));
mkdirSync(join(src, 'big'));
writeFileSync(join(src, 'big', 'package.json'), 'x'.repeat(MAX_READ_BYTES + 1));
const files = checkoutFiles(src);

test('reads a normal file of the checkout', () => {
  assert.equal(files.readText('package.json'), '{"packageManager":"pnpm@9.0.0"}');
  assert.ok(files.exists('pnpm-lock.yaml'));
  assert.ok(!files.exists('yarn.lock'));
  assert.equal(files.readText('missing.json'), null);
});

test('ignores a symlinked package.json', () => {
  assert.equal(files.readText('apps/web/package.json'), null);
});

test('ignores folders that are symlinks to outside the checkout', () => {
  assert.ok(!files.exists('outside/yarn.lock'));
  assert.equal(files.readText('outside/package.json'), null);
  assert.ok(!files.exists('apps/linked/yarn.lock'));
  assert.equal(files.readText('apps/linked/package.json'), null);
  assert.ok(!files.exists('../host/yarn.lock'));
});

test('ignores a file over 1 MB', () => {
  assert.ok(files.exists('big/package.json'));
  assert.equal(files.readText('big/package.json'), null);
});

test('a checkout that is a symlink still works', () => {
  const link = join(temp, 'link');
  symlinkSync(src, link);
  assert.equal(checkoutFiles(link).readText('package.json'), '{"packageManager":"pnpm@9.0.0"}');
});
