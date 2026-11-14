import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { archiveName, archivePath, downloadFailure, exists, saveArchive } from './download.ts';

test('the archive is named after the project and the deployment', () => {
  assert.equal(archiveName('docs', 'a1b2c3d4'), 'docs-a1b2c3d4.tar.gz');
  assert.equal(archivePath(undefined, 'docs', 'a1b2c3d4'), resolve('docs-a1b2c3d4.tar.gz'));
  assert.equal(archivePath('backup/site.tgz', 'docs', 'a1b2c3d4'), resolve('backup/site.tgz'));
});

test('saves through a .part file and leaves nothing behind when cut', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cq-download-'));
  try {
    const file = join(dir, 'docs-a1b2c3d4.tar.gz');
    assert.equal(await exists(file), false);

    const chunks = async function* () {
      yield new TextEncoder().encode('hello ');
      yield new TextEncoder().encode('world');
    };
    assert.equal(await saveArchive(chunks(), file), 11);
    assert.equal(await readFile(file, 'utf8'), 'hello world');
    assert.equal(await exists(file), true);

    const cut = async function* () {
      yield new TextEncoder().encode('partial');
      throw new Error('connection reset');
    };
    const other = join(dir, 'other.tar.gz');
    await assert.rejects(saveArchive(cut(), other), /connection reset/);
    assert.deepEqual(await readdir(dir), ['docs-a1b2c3d4.tar.gz']);

    // A web stream (what fetch gives) works too, and replaces a stale .part.
    await writeFile(`${other}.part`, 'stale');
    const web = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('from fetch'));
        controller.close();
      },
    });
    await saveArchive(web, other);
    assert.equal(await readFile(other, 'utf8'), 'from fetch');
    assert.deepEqual((await readdir(dir)).sort(), ['docs-a1b2c3d4.tar.gz', 'other.tar.gz']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('file system errors say what went wrong; anything else is a cut download', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cq-download-'));
  try {
    // A folder where the .part file would go: the write fails with EISDIR.
    const file = join(dir, 'site.tar.gz');
    await mkdir(`${file}.part`);
    const chunks = async function* () {
      yield new TextEncoder().encode('data');
    };
    const error = await saveArchive(chunks(), file).catch((e: unknown) => e);
    assert.match(downloadFailure(error, file).message, /^Can't save .*EISDIR/);

    const cut = new TypeError('terminated', { cause: new Error('other side closed') });
    assert.equal(
      downloadFailure(cut, file).message,
      'The download was cut (other side closed); nothing was saved.',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
