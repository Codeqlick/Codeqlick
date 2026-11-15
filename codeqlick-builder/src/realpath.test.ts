import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { realFolderInside } from './realpath.ts';

const temp = mkdtempSync(join(tmpdir(), 'cq-realpath-'));
const repo = join(temp, 'repo');
const host = join(temp, 'host');
mkdirSync(join(repo, 'web', 'dist'), { recursive: true });
mkdirSync(host);
writeFileSync(join(host, 'secret.txt'), 'secret');
writeFileSync(join(repo, 'file.txt'), 'x');
after(() => rmSync(temp, { recursive: true, force: true }));

test('accepts a real folder inside the clone, and the clone itself', async () => {
  assert.ok((await realFolderInside(repo, join(repo, 'web', 'dist')))?.endsWith('dist'));
  assert.ok(await realFolderInside(repo, repo));
});

test('refuses an output folder that is a link to the host', async () => {
  symlinkSync(host, join(repo, 'out'));
  assert.equal(await realFolderInside(repo, join(repo, 'out')), null);
});

test('refuses a folder under a link that leaves the clone', async () => {
  mkdirSync(join(host, 'build'));
  symlinkSync(host, join(repo, 'apps'));
  assert.equal(await realFolderInside(repo, join(repo, 'apps', 'build')), null);
});

test('accepts a link that stays inside the clone', async () => {
  symlinkSync(join(repo, 'web', 'dist'), join(repo, 'public'));
  assert.ok((await realFolderInside(repo, join(repo, 'public')))?.endsWith(join('web', 'dist')));
});

test('refuses missing folders, files and a sibling folder sharing the prefix', async () => {
  assert.equal(await realFolderInside(repo, join(repo, 'missing')), null);
  assert.equal(await realFolderInside(repo, join(repo, 'file.txt')), null);
  mkdirSync(`${repo}-evil`);
  symlinkSync(`${repo}-evil`, join(repo, 'evil'));
  assert.equal(await realFolderInside(repo, join(repo, 'evil')), null);
});

test('works when the clone itself is reached through a link', async () => {
  symlinkSync(repo, join(temp, 'alias'));
  assert.ok(await realFolderInside(join(temp, 'alias'), join(temp, 'alias', 'web', 'dist')));
});

test('refuses the usual exploit forms', async () => {
  symlinkSync('..', join(repo, 'up')); // the work folder, with the variables file
  symlinkSync('/', join(repo, 'root'));
  symlinkSync('../host', join(repo, 'rel'));
  symlinkSync(join(temp, 'nowhere'), join(repo, 'dangling'));
  for (const name of ['up', 'root', 'rel', 'dangling']) {
    assert.equal(await realFolderInside(repo, join(repo, name)), null, name);
  }
});
