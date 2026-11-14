import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  compareFiles,
  DeploymentHashes,
  filesView,
  HASH_ENTRY_OVERHEAD_BYTES,
  Limiter,
  listFiles,
  sha256File,
  type DeploymentSide,
} from './cloud-deployment-files.js';

let base: string;

/** A deployment folder with these files (path → contents). */
async function folder(name: string, files: Record<string, string>): Promise<string> {
  const root = join(base, name);
  for (const [path, body] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), body);
  }
  await mkdir(root, { recursive: true });
  return root;
}

async function side(id: string, root: string): Promise<DeploymentSide> {
  const files = await listFiles(root);
  if (!files) throw new Error(`no folder ${root}`);
  return { id, root, files };
}

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'cq-deployment-files-'));
});

afterAll(async () => {
  if (base) await rm(base, { recursive: true, force: true });
});

describe('listFiles', () => {
  it('lists nested files with sizes, sorted by path in byte order', async () => {
    const root = await folder('list', {
      'index.html': 'hello',
      'b.txt': 'bb',
      'Z.txt': 'Z',
      'assets/app.js': '1234',
      'assets/css/site.css': '123',
      'a-b.txt': '',
      'a/z.txt': 'z',
      'é.txt': 'e',
    });
    expect(await listFiles(root)).toEqual([
      { path: 'Z.txt', size: 1 }, // uppercase before lowercase
      { path: 'a-b.txt', size: 0 },
      { path: 'a/z.txt', size: 1 }, // "-" (0x2d) sorts before "/" (0x2f)
      { path: 'assets/app.js', size: 4 },
      { path: 'assets/css/site.css', size: 3 },
      { path: 'b.txt', size: 2 },
      { path: 'index.html', size: 5 },
      { path: 'é.txt', size: 1 },
    ]);
  });

  it('sorts by UTF-8 bytes, not UTF-16 code units', async () => {
    // U+FF5E is 0xEF 0xBD 0x9E in UTF-8 and U+1F600 is 0xF0 …: bytes put the emoji last, while
    // UTF-16 (a surrogate pair starting 0xD83D) would put it first.
    const root = await folder('utf8', { '\u{1F600}.txt': 'x', '～.txt': 'y' });
    const paths = (await listFiles(root))?.map((f) => f.path);
    expect(paths).toEqual(['～.txt', '\u{1F600}.txt']);
  });

  it('skips symbolic links (to files and to folders) and never follows them', async () => {
    const outside = await folder('outside', { 'secret.txt': 'secret', 'dir/inner.txt': 'x' });
    const root = await folder('links', { 'index.html': 'hi' });
    await symlink(join(outside, 'secret.txt'), join(root, 'secret.txt'));
    await symlink(join(outside, 'dir'), join(root, 'dir'));
    await symlink(join(root, 'missing'), join(root, 'dangling'));
    expect(await listFiles(root)).toEqual([{ path: 'index.html', size: 2 }]);
  });

  it('is null when the folder is gone or is not a folder', async () => {
    expect(await listFiles(join(base, 'nope'))).toBeNull();
    const root = await folder('file-root', { 'f.txt': 'x' });
    expect(await listFiles(join(root, 'f.txt'))).toBeNull();
    const link = join(base, 'root-link');
    await symlink(root, link);
    expect(await listFiles(link)).toBeNull();
  });

  it('caps the list view at 10,000 files while counting them all', () => {
    const files = Array.from({ length: 10_002 }, (_, i) => ({
      path: `f${String(i).padStart(5, '0')}`,
      size: 2,
    }));
    const view = filesView(files);
    expect(view.items).toHaveLength(10_000);
    expect(view.count).toBe(10_002);
    expect(view.totalBytes).toBe(20_004);
  });
});

describe('sha256File', () => {
  it('streams the SHA-256 of a file', async () => {
    const root = await folder('hash', { 'a.txt': 'abc' });
    const digest = await sha256File(join(root, 'a.txt'));
    expect(digest).toHaveLength(32);
    expect(digest.equals(createHash('sha256').update('abc').digest())).toBe(true);
  });
});

describe('compareFiles', () => {
  it('finds added, removed and changed files (by size and by hash) and counts unchanged', async () => {
    const a = await side(
      'a',
      await folder('cmp-a', {
        'index.html': '<h1>v2</h1>', // same size as before, other content
        'assets/app.js': 'console.log(2)', // longer
        'about.html': 'same',
        'new/page.html': 'new',
        'z.txt': 'zz',
      }),
    );
    const b = await side(
      'b',
      await folder('cmp-b', {
        'index.html': '<h1>v1</h1>',
        'assets/app.js': 'log(1)',
        'about.html': 'same',
        'old.txt': 'old!',
        'z.txt': 'zz',
      }),
    );
    const result = await compareFiles(a, b, new DeploymentHashes());
    expect(result).toEqual({
      deploymentId: 'a',
      withId: 'b',
      added: [{ path: 'new/page.html', size: 3 }],
      removed: [{ path: 'old.txt', size: 4 }],
      changed: [
        { path: 'assets/app.js', size: 14, previousSize: 6 },
        { path: 'index.html', size: 11, previousSize: 11 },
      ],
      unchanged: 2,
      totalBytes: 11 + 14 + 4 + 3 + 2,
      withTotalBytes: 11 + 6 + 4 + 4 + 2,
    });
  });

  it('compares a deployment with itself as entirely unchanged, without hashing', async () => {
    const a = await side('self', await folder('cmp-self', { 'index.html': 'x', 'b.txt': 'yy' }));
    const hashFile = vi.fn(sha256File);
    const result = await compareFiles(a, a, new DeploymentHashes({ hashFile }));
    expect(result).toMatchObject({
      deploymentId: 'self',
      withId: 'self',
      added: [],
      removed: [],
      changed: [],
      unchanged: 2,
      totalBytes: 3,
      withTotalBytes: 3,
    });
    expect(hashFile).not.toHaveBeenCalled();
  });

  it('hashes only files of equal size, once per deployment and path', async () => {
    const a = await side(
      'c1',
      await folder('cache-a', { 'same.txt': 'same', 'big.txt': 'longer', 'eq.txt': 'AAAA' }),
    );
    const b = await side(
      'c2',
      await folder('cache-b', { 'same.txt': 'same', 'big.txt': 'short', 'eq.txt': 'BBBB' }),
    );
    const hashFile = vi.fn(sha256File);
    const hashes = new DeploymentHashes({ hashFile });
    const first = await compareFiles(a, b, hashes);
    expect(first.unchanged).toBe(1);
    expect(first.changed.map((f) => f.path)).toEqual(['big.txt', 'eq.txt']);
    // same.txt and eq.txt on both sides; big.txt differs by size, so it is never hashed.
    expect(hashFile).toHaveBeenCalledTimes(4);
    expect(hashFile.mock.calls.map(([path]) => path)).not.toContain(join(a.root, 'big.txt'));

    const again = await compareFiles(a, b, hashes);
    expect(again).toEqual(first);
    expect(hashFile).toHaveBeenCalledTimes(4);
    // The other direction reuses both deployments' hashes too.
    await compareFiles(b, a, hashes);
    expect(hashFile).toHaveBeenCalledTimes(4);
  });

  it('treats two empty files as equal without hashing them', async () => {
    const a = await side('e1', await folder('empty-a', { 'empty.txt': '', 'x.txt': 'x' }));
    const b = await side('e2', await folder('empty-b', { 'empty.txt': '', 'x.txt': 'y' }));
    const hashFile = vi.fn(sha256File);
    const result = await compareFiles(a, b, new DeploymentHashes({ hashFile }));
    expect(result.unchanged).toBe(1);
    expect(result.changed).toEqual([{ path: 'x.txt', size: 1, previousSize: 1 }]);
    expect(hashFile.mock.calls.map(([path]) => path)).toEqual([
      join(a.root, 'x.txt'),
      join(b.root, 'x.txt'),
    ]);
  });

  it('hashes again after a deployment is forgotten', async () => {
    const a = await side('f1', await folder('forget-a', { 'x.txt': 'one' }));
    const b = await side('f2', await folder('forget-b', { 'x.txt': 'two' }));
    const hashFile = vi.fn(sha256File);
    const hashes = new DeploymentHashes({ hashFile });
    await compareFiles(a, b, hashes);
    expect(hashes.has('f1')).toBe(true);
    hashes.forget('f1');
    expect(hashes.has('f1')).toBe(false);
    await compareFiles(a, b, hashes);
    expect(hashFile).toHaveBeenCalledTimes(3);
  });
});

/** A hasher that waits for `release()` before hashing, to hold hashes in flight. */
function gatedHasher() {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const hashFile = vi.fn(async (path: string) => {
    await gate;
    return sha256File(path);
  });
  return { hashFile, release: () => release() };
}

describe('DeploymentHashes', () => {
  it('keeps the most recently used deployments only', async () => {
    const root = await folder('lru', { 'x.txt': 'x' });
    const hashFile = vi.fn(sha256File);
    const hashes = new DeploymentHashes({ maxDeployments: 2, hashFile });
    await hashes.hash('d1', root, 'x.txt');
    await hashes.hash('d2', root, 'x.txt');
    await hashes.hash('d1', root, 'x.txt'); // d1 is now the most recent
    expect(hashFile).toHaveBeenCalledTimes(2);
    await hashes.hash('d3', root, 'x.txt'); // drops d2
    expect(hashes.size).toBe(2);
    expect(hashes.has('d1')).toBe(true);
    expect(hashes.has('d2')).toBe(false);
    expect(hashes.has('d3')).toBe(true);
    await hashes.hash('d2', root, 'x.txt');
    expect(hashFile).toHaveBeenCalledTimes(4);
  });

  it('drops the least recently used deployments once over the memory budget', async () => {
    const root = await folder('budget', { 'x.txt': 'x', 'y.txt': 'y' });
    const cost = Buffer.byteLength('x.txt') + HASH_ENTRY_OVERHEAD_BYTES; // 325 bytes per hash
    const hashes = new DeploymentHashes({ budgetBytes: cost * 2 + 10 });
    await hashes.hash('b1', root, 'x.txt');
    await hashes.hash('b2', root, 'x.txt');
    expect(hashes.estimatedBytes).toBe(cost * 2);
    await hashes.hash('b3', root, 'x.txt'); // over budget: b1 goes
    expect(hashes.has('b1')).toBe(false);
    expect([hashes.has('b2'), hashes.has('b3')]).toEqual([true, true]);
    expect(hashes.estimatedBytes).toBe(cost * 2);
    await hashes.hash('b2', root, 'y.txt'); // b2 grows and is the most recent: b3 goes
    expect(hashes.has('b3')).toBe(false);
    expect(hashes.has('b2')).toBe(true);
    expect(hashes.estimatedBytes).toBe(cost * 2);
    hashes.forget('b2');
    expect(hashes.estimatedBytes).toBe(0);
  });

  it('shares one read between concurrent hashes of the same file', async () => {
    const root = await folder('dedupe', { 'x.txt': 'x' });
    const { hashFile, release } = gatedHasher();
    const hashes = new DeploymentHashes({ hashFile });
    const first = hashes.hash('s1', root, 'x.txt');
    const second = hashes.hash('s1', root, 'x.txt');
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(a.equals(b)).toBe(true);
    expect(hashFile).toHaveBeenCalledTimes(1);
  });

  it('does not keep a hash of a deployment forgotten while it was being computed', async () => {
    const root = await folder('forgotten', { 'x.txt': 'x' });
    const { hashFile, release } = gatedHasher();
    const hashes = new DeploymentHashes({ hashFile });
    const pending = hashes.hash('g1', root, 'x.txt');
    hashes.forget('g1');
    release();
    await pending;
    expect(hashes.has('g1')).toBe(false);
    expect(hashes.estimatedBytes).toBe(0);
    await hashes.hash('g1', root, 'x.txt');
    expect(hashFile).toHaveBeenCalledTimes(2);
  });
});

describe('Limiter', () => {
  it('runs at most `limit` tasks at once, in order', async () => {
    const limiter = new Limiter(2);
    let running = 0;
    let most = 0;
    const started: number[] = [];
    const task = (n: number) => async () => {
      started.push(n);
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return n;
    };
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => limiter.run(task(n))));
    expect(results).toEqual([1, 2, 3, 4, 5]);
    expect(started).toEqual([1, 2, 3, 4, 5]);
    expect(most).toBe(2);
  });

  it('frees its slot when a task fails', async () => {
    const limiter = new Limiter(1);
    await expect(limiter.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(await limiter.run(() => Promise.resolve('ok'))).toBe('ok');
  });
});
