import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** A file of a deployment: its path relative to the deployment's root (with `/`) and size. */
export interface DeploymentFile {
  path: string;
  size: number;
}

export interface ChangedFile extends DeploymentFile {
  previousSize: number;
}

/** What `GET …/deployments/:deploymentId/files` answers (architecture 4.13, "Files and comparison"). */
export interface DeploymentFilesView {
  items: DeploymentFile[];
  count: number;
  totalBytes: number;
}

/** What `GET …/deployments/:deploymentId/compare` answers. */
export interface DeploymentComparison {
  deploymentId: string;
  withId: string;
  added: DeploymentFile[];
  removed: DeploymentFile[];
  changed: ChangedFile[];
  unchanged: number;
  totalBytes: number;
  withTotalBytes: number;
}

/** One side of a comparison: a deployment's id, its folder on disk and its files. */
export interface DeploymentSide {
  id: string;
  root: string;
  files: DeploymentFile[];
}

/** The list shows at most this many files (the free plan's limit per deployment). */
export const MAX_LISTED_FILES = 10_000;
/** Deployments whose hashes are kept in memory (least recently used dropped first). */
export const HASHED_DEPLOYMENTS = 50;
/** Estimated memory the kept hashes may take, across every deployment. */
export const HASHES_BUDGET_BYTES = 64 * 1024 * 1024;
/**
 * Estimated cost of one kept hash besides its path: the digest Buffer (with its own backing
 * store) and the map entry, measured at about 320 bytes on Node.
 */
export const HASH_ENTRY_OVERHEAD_BYTES = 320;
/** Comparisons that may run at once (each may stream files from disk). */
export const CONCURRENT_COMPARES = 2;

/**
 * Byte order of the paths' UTF-8, the same order on every platform and in the CLI. Plain `<` on
 * JS strings compares UTF-16 code units, which differs from UTF-8 byte order for characters
 * outside the Basic Multilingual Plane, so the paths are compared as Buffers.
 */
export function byPath(a: DeploymentFile, b: DeploymentFile): number {
  return Buffer.compare(Buffer.from(a.path), Buffer.from(b.path));
}

/**
 * Every regular file under `root` with its size, sorted by path (byte order). Symbolic links and
 * anything else that isn't a regular file or a folder are skipped and never followed. `null` when
 * `root` is missing or isn't a folder (a deployment whose files are gone).
 */
export async function listFiles(root: string): Promise<DeploymentFile[] | null> {
  try {
    if (!(await lstat(root)).isDirectory()) return null;
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
  const files: Array<DeploymentFile & { key: Buffer }> = [];
  const walk = async (folder: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = join(folder, entry.name);
      // Dirent types come from lstat: a link to a folder is a link, not a folder.
      if (entry.isDirectory()) {
        await walk(absolute, path);
      } else if (entry.isFile()) {
        const stats = await lstat(absolute);
        if (stats.isFile()) files.push({ path, size: stats.size, key: Buffer.from(path) });
      }
    }
  };
  try {
    await walk(root, '');
  } catch (error) {
    // Deleted while it was being read (the hourly cleanup): its files are gone.
    if (isMissing(error)) return null;
    throw error;
  }
  files.sort((a, b) => Buffer.compare(a.key, b.key));
  return files.map(({ path, size }) => ({ path, size }));
}

/** The list view: the first `MAX_LISTED_FILES` files; the count and total cover every file. */
export function filesView(files: DeploymentFile[]): DeploymentFilesView {
  return {
    items: files.slice(0, MAX_LISTED_FILES),
    count: files.length,
    totalBytes: totalBytes(files),
  };
}

export function totalBytes(files: DeploymentFile[]): number {
  return files.reduce((sum, file) => sum + file.size, 0);
}

/** SHA-256 of a file (32 bytes), streamed from disk; a symbolic link is refused, never followed. */
export async function sha256File(path: string): Promise<Buffer> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const hash = createHash('sha256');
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      hash.update(chunk as Buffer);
    }
    return hash.digest();
  } finally {
    await handle.close();
  }
}

export interface DeploymentHashesOptions {
  /** Estimated bytes all kept hashes may take (paths' UTF-8 + digest + overhead per file). */
  budgetBytes?: number;
  /** Deployments kept at most. */
  maxDeployments?: number;
  hashFile?: (path: string) => Promise<Buffer>;
}

interface HashEntry {
  digests: Map<string, Buffer>;
  bytes: number;
}

/**
 * Files' hashes kept per deployment (path → SHA-256 digest), least recently used deployments
 * dropped first once the estimated memory goes over the budget or there are too many deployments.
 * Deployments are immutable, so a hash never goes stale; a deleted deployment's entry is dropped
 * with `forget`. Hashing the same file twice at once shares one read.
 */
export class DeploymentHashes {
  private readonly entries = new Map<string, HashEntry>();
  private readonly pending = new Map<string, Promise<Buffer>>();
  private readonly budgetBytes: number;
  private readonly maxDeployments: number;
  private readonly hashFile: (path: string) => Promise<Buffer>;
  private bytes = 0;

  constructor(options: DeploymentHashesOptions = {}) {
    this.budgetBytes = options.budgetBytes ?? HASHES_BUDGET_BYTES;
    this.maxDeployments = options.maxDeployments ?? HASHED_DEPLOYMENTS;
    this.hashFile = options.hashFile ?? sha256File;
  }

  /** The hash of `path` (relative) in the deployment `id` stored at `root`, computed once. */
  async hash(id: string, root: string, path: string): Promise<Buffer> {
    const entry = this.touch(id);
    const known = entry.digests.get(path);
    if (known) return known;
    const key = `${id}\0${path}`;
    let digest = this.pending.get(key);
    if (!digest) {
      digest = this.hashFile(join(root, path));
      this.pending.set(key, digest);
      const clear = () => {
        if (this.pending.get(key) === digest) this.pending.delete(key);
      };
      void digest.then(clear, clear);
    }
    const value = await digest;
    // Kept only while the deployment is still known (not forgotten or dropped meanwhile).
    if (this.entries.get(id) === entry && !entry.digests.has(path)) {
      entry.digests.set(path, value);
      const cost = Buffer.byteLength(path) + HASH_ENTRY_OVERHEAD_BYTES;
      entry.bytes += cost;
      this.bytes += cost;
      this.evict();
    }
    return value;
  }

  forget(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    this.bytes -= entry.bytes;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  get size(): number {
    return this.entries.size;
  }

  /** Estimated bytes the kept hashes take. */
  get estimatedBytes(): number {
    return this.bytes;
  }

  /** The deployment's entry, marked as the most recently used. */
  private touch(id: string): HashEntry {
    let entry = this.entries.get(id);
    if (entry) this.entries.delete(id);
    else entry = { digests: new Map<string, Buffer>(), bytes: 0 };
    this.entries.set(id, entry);
    this.evict();
    return entry;
  }

  /** Drops the least recently used deployments until within the budget and the count. */
  private evict(): void {
    while (this.entries.size > this.maxDeployments || this.bytes > this.budgetBytes) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.forget(oldest);
    }
  }
}

/** Runs at most `limit` tasks at once; the rest wait their turn in order. */
export class Limiter {
  private running = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= this.limit) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    } else {
      this.running += 1;
    }
    try {
      return await task();
    } finally {
      const next = this.queue.shift();
      // The slot passes straight to the next task, so `running` stays the same.
      if (next) next();
      else this.running -= 1;
    }
  }
}

/**
 * Compares deployment `a` with `b`: `added` (only in `a`), `removed` (only in `b`) and `changed`
 * (in both with a different size or SHA-256), each sorted by path, plus how many are unchanged.
 * Hashes are only computed for non-empty files of equal size. A deployment compared with itself is
 * entirely unchanged.
 */
export async function compareFiles(
  a: DeploymentSide,
  b: DeploymentSide,
  hashes: DeploymentHashes,
): Promise<DeploymentComparison> {
  const result: DeploymentComparison = {
    deploymentId: a.id,
    withId: b.id,
    added: [],
    removed: [],
    changed: [],
    unchanged: 0,
    totalBytes: totalBytes(a.files),
    withTotalBytes: totalBytes(b.files),
  };
  if (a.id === b.id) {
    result.unchanged = a.files.length;
    return result;
  }
  const other = new Map<string, number>(b.files.map((file) => [file.path, file.size] as const));
  const own = new Set(a.files.map((file) => file.path));
  for (const file of a.files) {
    const previousSize = other.get(file.path);
    if (previousSize === undefined) {
      result.added.push({ path: file.path, size: file.size });
    } else if (previousSize !== file.size) {
      result.changed.push({ path: file.path, size: file.size, previousSize });
    } else if (file.size === 0) {
      result.unchanged += 1; // two empty files are equal
    } else {
      const [mine, theirs] = await Promise.all([
        hashes.hash(a.id, a.root, file.path),
        hashes.hash(b.id, b.root, file.path),
      ]);
      if (mine.equals(theirs)) result.unchanged += 1;
      else result.changed.push({ path: file.path, size: file.size, previousSize });
    }
  }
  for (const file of b.files) {
    if (!own.has(file.path)) result.removed.push({ path: file.path, size: file.size });
  }
  // Both lists come sorted, so each group already is; sort anyway in case a caller's isn't.
  result.added.sort(byPath);
  result.removed.sort(byPath);
  result.changed.sort(byPath);
  return result;
}

/** A folder or file that is gone (ENOENT), or a path through something that isn't a folder. */
export function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}
