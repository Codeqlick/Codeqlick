import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { collect, ignoreMatcher, pack } from './pack.ts';

const run = promisify(execFile);

test('ignore patterns', () => {
  const ignored = ignoreMatcher('# comment\n*.map\ndrafts/\nassets/old/**\n/secret.txt\n');
  assert.equal(ignored('app.js.map', false), true);
  assert.equal(ignored('assets/app.js.map', false), true);
  assert.equal(ignored('drafts', true), true);
  assert.equal(ignored('drafts', false), false);
  assert.equal(ignored('assets/old/a/b.png', false), true);
  assert.equal(ignored('secret.txt', false), true);
  assert.equal(ignored('docs/secret.txt', false), false);
  assert.equal(ignored('index.html', false), false);
});

test('collects the folder and packs it as a tar.gz that tar reads back', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cq-pack-'));
  const out = await mkdtemp(join(tmpdir(), 'cq-out-'));
  try {
    const long = `${'very-long-folder-name/'.repeat(6)}página.html`;
    const files: Record<string, string> = {
      'index.html': '<h1>hi</h1>',
      'assets/app.js': 'console.log(1)',
      'assets/app.js.map': '{}',
      '.env': 'SECRET=1',
      '.well-known/security.txt': 'Contact: x',
      [long]: 'long',
    };
    for (const [path, body] of Object.entries(files)) {
      await mkdir(join(root, path, '..'), { recursive: true });
      await writeFile(join(root, path), body);
    }
    await writeFile(join(root, '.codeqlickignore'), '*.map\n');
    await symlink('/etc/hosts', join(root, 'hosts'));

    const collected = await collect(root);
    assert.deepEqual(
      collected.map((f) => f.path).sort(),
      ['.well-known/security.txt', 'assets/app.js', 'index.html', long].sort(),
    );

    const bundle = join(out, 'site.tar.gz');
    assert.ok((await pack(collected, bundle)) > 0);
    await run('tar', ['-xzf', bundle, '-C', out]);
    assert.equal(await readFile(join(out, 'index.html'), 'utf8'), '<h1>hi</h1>');
    assert.equal(await readFile(join(out, long), 'utf8'), 'long');
    assert.equal(await readFile(join(out, '.well-known/security.txt'), 'utf8'), 'Contact: x');
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(out, { recursive: true, force: true });
  }
});
