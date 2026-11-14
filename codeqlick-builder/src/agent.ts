import { spawn } from 'node:child_process';
import { openAsBlob } from 'node:fs';
import { lstat, mkdir, readdir, rm, rmdir, stat, utimes, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  cachePath,
  cachesToEvict,
  dockerArgs,
  envFile,
  inside,
  mask,
  type CacheEntry,
  type Job,
} from './plan.ts';

/**
 * Codeqlick Cloud's build agent (architecture 8.4, decision 41). It asks the API for a build every
 * 5 seconds, clones the commit, runs install and build in a throwaway container, streams the log,
 * and uploads the output folder. It needs no open port. Between builds it keeps only the projects'
 * dependency caches (the package managers' download stores, decision 51), under a size limit.
 */

const API = (process.env.CLOUD_API_URL ?? 'https://api.codeqlick.com/v1').replace(/\/+$/, '');
const TOKEN = process.env.CLOUD_BUILDER_TOKEN ?? '';
const WORK = process.env.BUILDER_WORK_DIR ?? '/var/lib/codeqlick-builder';
const NAME = (process.env.BUILDER_NAME ?? hostname()).slice(0, 60);
/** `runsc` (gVisor) wherever the host runs anything else (decision 41). */
const RUNTIME = process.env.BUILDER_RUNTIME ?? '';
const POLL_MS = 5_000;
const MB = 1024 * 1024;
const CACHE_DIR = join(WORK, 'cache');
/** A positive number of megabytes from the environment, or the default. */
function megabytes(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
const CACHE_PROJECT_BYTES = megabytes('BUILDER_CACHE_PROJECT_MB', 1024) * MB;
const CACHE_TOTAL_BYTES = megabytes('BUILDER_CACHE_TOTAL_MB', 10240) * MB;

if (!TOKEN) {
  console.error('CLOUD_BUILDER_TOKEN is not set');
  process.exit(1);
}

class Canceled extends Error {}

async function api(
  path: string,
  init: { method?: string; json?: unknown; form?: FormData } = {},
): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${TOKEN}` };
  let body: string | FormData | undefined;
  if (init.form) body = init.form;
  else if (init.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.json);
  }
  return fetch(`${API}${path}`, {
    method: init.method ?? 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(120_000),
  });
}

/** Runs a command, sending its output to `onOutput`; resolves with its exit code. */
function run(
  command: string,
  args: string[],
  options: { cwd?: string; onOutput: (text: string) => void; signal?: AbortSignal },
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (data: Buffer) => options.onOutput(data.toString('utf8')));
    child.stderr.on('data', (data: Buffer) => options.onOutput(data.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
    options.signal?.addEventListener('abort', () => child.kill('SIGKILL'), { once: true });
  });
}

/** The least space an entry takes: build code could otherwise fill the disk with empty files. */
const MIN_ENTRY_BYTES = 4096;

/**
 * The space a folder really uses: allocated blocks, at least 4 KB per file, folder or link, and
 * symbolic links never followed. Any error (unreadable entry, vanished file) is thrown.
 */
async function folderSize(folder: string): Promise<number> {
  let total = MIN_ENTRY_BYTES;
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) total += await folderSize(path);
    else total += Math.max((await lstat(path)).blocks * 512, MIN_ENTRY_BYTES);
  }
  return total;
}

function size(bytes: number): string {
  return bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

/** Makes a tree readable and writable for the agent's user (build code may have locked it). */
async function unlock(folder: string): Promise<void> {
  try {
    if ((await run('chmod', ['-R', 'u+rwX', folder], { onOutput: () => undefined })) !== 0)
      console.error(`chmod ${folder}: some entries could not be changed`);
  } catch (error) {
    console.error(`chmod ${folder}: ${String(error)}`);
  }
}

/** The size of a cache after unlocking it, or null when it can't be fully read. */
async function measure(folder: string): Promise<number | null> {
  await unlock(folder);
  try {
    return await folderSize(folder);
  } catch (error) {
    console.error(`cache ${folder}: ${String(error)}`);
    return null;
  }
}

/** Deletes a folder build code may have locked; a failure is logged, never thrown. */
async function remove(folder: string): Promise<void> {
  await unlock(folder);
  try {
    await rm(folder, { recursive: true, force: true });
  } catch (error) {
    console.error(`could not delete ${folder}: ${String(error)}`);
  }
}

/** Waits for a build's container to be gone, so nothing in it can still touch the disk. */
async function gone(container: string): Promise<void> {
  await run('docker', ['rm', '-f', container], { onOutput: () => undefined }).catch(
    () => undefined,
  );
}

const KEY_PART = /^[a-z0-9-]+$/;

/** Every cache on disk (`cache/<project>/<name>`, both names matching the key pattern). */
async function listCaches(): Promise<CacheEntry[]> {
  const entries: CacheEntry[] = [];
  for (const project of await readdir(CACHE_DIR).catch(() => [])) {
    if (!KEY_PART.test(project)) continue;
    for (const name of await readdir(join(CACHE_DIR, project)).catch(() => [])) {
      if (!KEY_PART.test(name)) continue;
      const path = join(CACHE_DIR, project, name);
      const info = await lstat(path).catch(() => null);
      if (!info?.isDirectory()) continue;
      const bytes = await measure(path);
      if (bytes === null) await dropCache(`${project}/${name}`);
      else entries.push({ key: `${project}/${name}`, bytes, usedAt: info.mtimeMs });
    }
  }
  return entries;
}

async function dropCache(key: string): Promise<void> {
  const folder = cachePath(CACHE_DIR, key);
  await remove(folder);
  await rmdir(join(folder, '..')).catch(() => undefined); // the project's folder, when empty
}

/** Prepares the cache folder of a build: emptied first when `fresh`, then marked as used now. */
async function useCache(
  key: string,
  folder: string,
  fresh: boolean,
  output: (text: string) => void,
): Promise<boolean> {
  try {
    if (fresh) {
      await dropCache(key);
      output('Dependency cache: cleared for this build\n');
    }
    await mkdir(folder, { recursive: true, mode: 0o700 });
    let bytes = await measure(folder);
    if (bytes === null) {
      await dropCache(key);
      await mkdir(folder, { recursive: true, mode: 0o700 });
      bytes = 0;
    }
    const now = new Date();
    await utimes(folder, now, now);
    if (!fresh) output(`Dependency cache: ${bytes > 0 ? `restored (${size(bytes)})` : 'empty'}\n`);
    return true;
  } catch (error) {
    console.error(`cache: ${String(error)}`);
    output('Dependency cache: off for this build\n');
    return false;
  }
}

/** After a finished build: reports the cache's size and applies the per-cache limit. */
async function settleCache(
  key: string,
  folder: string,
  output: (text: string) => void,
): Promise<void> {
  try {
    const now = new Date();
    await utimes(folder, now, now);
    const bytes = await measure(folder);
    if (bytes === null || bytes > CACHE_PROJECT_BYTES) {
      await dropCache(key);
      const shown = bytes === null ? 'unreadable' : size(bytes);
      output(
        `Dependency cache: over the project's limit (${shown}), deleted; the next build starts empty\n`,
      );
    } else {
      output(`Dependency cache: saved (${size(bytes)})\n`);
    }
  } catch (error) {
    console.error(`cache: ${String(error)}`);
  }
}

/** Least-recently-used eviction of the whole cache folder, after the upload. */
async function evictCaches(): Promise<void> {
  try {
    for (const evicted of cachesToEvict(await listCaches(), CACHE_TOTAL_BYTES)) {
      console.log(`cache: evicting ${evicted} (the cache folder is over its limit)`);
      await dropCache(evicted);
    }
  } catch (error) {
    console.error(`cache: ${String(error)}`);
  }
}

async function build(job: Job): Promise<void> {
  const work = join(WORK, job.id);
  const src = join(work, 'src');
  const container = `cqb-${job.id.slice(0, 12)}`;
  let buffer = '';
  let canceled = false;
  const output = (text: string) => {
    buffer += mask(text, job.secrets);
  };
  const flush = async () => {
    if (!buffer) return;
    const text = buffer;
    buffer = '';
    const response = await api(`/cloud/builder/builds/${job.id}/log`, { json: { text } }).catch(
      () => null,
    );
    if (response?.status === 409) canceled = true;
  };
  const flusher = setInterval(() => void flush(), 2_000);
  const beat = setInterval(() => {
    void api(`/cloud/builder/builds/${job.id}/heartbeat`).then((r) => {
      if (r.status === 409) canceled = true;
    });
  }, 30_000);
  let settled = false;
  const stop = new AbortController();
  const watcher = setInterval(() => {
    if (canceled && !stop.signal.aborted) {
      stop.abort();
      void run('docker', ['kill', container], { onOutput: () => undefined }).catch(() => undefined);
    }
  }, 1_000);
  const finish = async (status: 'succeeded' | 'failed', error?: string, bundle?: string) => {
    await flush();
    const form = new FormData();
    form.set('status', status);
    if (error) form.set('error', error.slice(0, 500));
    if (bundle)
      form.set('bundle', await openAsBlob(bundle, { type: 'application/gzip' }), 'out.tar.gz');
    await api(`/cloud/builder/builds/${job.id}/finish`, { form }).catch((e: unknown) =>
      console.error(`build ${job.id}: finish failed: ${String(e)}`),
    );
  };

  try {
    await mkdir(src, { recursive: true, mode: 0o700 });
    output(`$ git fetch ${job.commit.slice(0, 7)}\n`);
    for (const args of [
      ['init', '-q'],
      ['remote', 'add', 'origin', job.cloneUrl],
      ['-c', 'credential.helper=', 'fetch', '-q', '--depth', '1', 'origin', job.commit],
      ['checkout', '-q', 'FETCH_HEAD'],
    ]) {
      if ((await run('git', args, { cwd: src, onOutput: output })) !== 0)
        throw new Error('The repository could not be fetched');
    }
    // The token stays out of the container: the remote is removed before building.
    await run('git', ['remote', 'remove', 'origin'], { cwd: src, onOutput: () => undefined });
    await rm(join(src, '.git', 'FETCH_HEAD'), { force: true });
    const root = inside(src, job.rootDir);
    const variables = join(work, 'env');
    await writeFile(variables, envFile(job.env), { mode: 0o600 });
    const command = `${job.installCommand} && ${job.buildCommand}`;
    // An invalid key is refused (it fails the build); any other cache problem only turns it off.
    const cacheFolder = job.cache ? cachePath(CACHE_DIR, job.cache.key) : null;
    const cache =
      cacheFolder &&
      (await useCache(job.cache?.key ?? '', cacheFolder, job.cache?.fresh === true, output))
        ? cacheFolder
        : undefined;
    if (!job.cache) output('Dependency cache: off for this build\n');
    output(`$ ${command}\n`);
    const timer = setTimeout(() => {
      output(
        `\nThe build took longer than ${Math.round(job.timeoutSeconds / 60)} minutes: stopped.\n`,
      );
      stop.abort();
      void run('docker', ['kill', container], { onOutput: () => undefined }).catch(() => undefined);
    }, job.timeoutSeconds * 1000);
    const code = await run(
      'docker',
      dockerArgs({
        name: container,
        work: src,
        rootDir: job.rootDir,
        envFile: variables,
        nodeVersion: job.nodeVersion,
        uid: process.getuid?.() ?? 1000,
        gid: process.getgid?.() ?? 1000,
        command,
        runtime: RUNTIME,
        cache,
      }),
      { onOutput: output, signal: stop.signal },
    );
    clearTimeout(timer);
    await gone(container);
    // An aborted build leaves the cache as it was: not measured, not saved.
    if (job.cache && cache && !canceled && !stop.signal.aborted) {
      await settleCache(job.cache.key, cache, output);
      settled = true;
    }
    if (canceled) throw new Canceled('Canceled');
    if (stop.signal.aborted)
      throw new Error(`The build took longer than ${Math.round(job.timeoutSeconds / 60)} minutes`);
    if (code !== 0) throw new Error(`The build exited with code ${code}`);

    const out = inside(root, job.outputDir);
    if (!(await stat(out).catch(() => null))?.isDirectory())
      throw new Error(`The output folder ${job.outputDir || '.'} doesn't exist`);
    const bundle = join(work, 'out.tar.gz');
    if ((await run('tar', ['-czf', bundle, '-C', out, '.'], { onOutput: output })) !== 0) {
      throw new Error('The output folder could not be packed');
    }
    output('Uploading the output…\n');
    await finish('succeeded', undefined, bundle);
  } catch (error) {
    if (error instanceof Canceled) {
      await flush();
    } else {
      const message = error instanceof Error ? error.message : String(error);
      output(`\n${message}\n`);
      await finish('failed', message);
    }
  } finally {
    clearInterval(flusher);
    clearInterval(beat);
    clearInterval(watcher);
    await gone(container);
    await remove(work);
    if (settled) await evictCaches();
  }
}

let stopping = false;
process.on('SIGTERM', () => {
  stopping = true;
});

console.log(
  `codeqlick-builder ${NAME}: claiming builds from ${API} (runtime: ${RUNTIME || 'default'})`,
);
while (!stopping) {
  try {
    const response = await api('/cloud/builder/claim', { json: { builder: NAME } });
    if (response.status === 200) {
      const { build: job } = (await response.json()) as { build: Job };
      console.log(`build ${job.id}: ${job.commit.slice(0, 7)}`);
      await build(job);
      console.log(`build ${job.id}: done`);
      continue;
    }
    if (response.status !== 204) console.error(`claim: HTTP ${response.status}`);
  } catch (error) {
    console.error(`claim failed: ${String(error)}`);
  }
  await sleep(POLL_MS);
}
