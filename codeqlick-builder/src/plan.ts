import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, join, normalize, relative, sep } from 'node:path';

/** What the API hands the agent for a build (POST /v1/cloud/builder/claim). */
export interface Job {
  id: string;
  cloneUrl: string;
  commit: string;
  rootDir: string;
  installCommand: string;
  buildCommand: string;
  outputDir: string;
  nodeVersion: string;
  env: Record<string, string>;
  timeoutSeconds: number;
  secrets: string[];
  /** The dependency cache to mount (architecture 4.13), or null for none. */
  cache: { key: string; fresh?: boolean } | null;
}

/** Hides every secret (the clone token, the variables) from a piece of log. */
export function mask(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets.toSorted((a, b) => b.length - a.length)) {
    if (secret.length >= 4) out = out.split(secret).join('***');
  }
  return out;
}

/** A folder inside `base`, or an error when it would leave it. */
export function inside(base: string, folder: string): string {
  const path = normalize(join(base, folder));
  const rel = relative(base, path);
  if (rel.startsWith('..') || isAbsolute(rel))
    throw new Error(`${folder} is outside the repository`);
  return path;
}

/**
 * The folder of a dependency cache under `base`. The key is `<project>/<production|preview>-node<N>`
 * and must match `[a-z0-9-]+/[a-z0-9-]+`: anything else is refused instead of guessed.
 */
export function cachePath(base: string, key: string): string {
  if (!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(key)) throw new Error(`Invalid cache key ${key}`);
  return inside(base, key);
}

/** One cache folder on disk, for the least-recently-used eviction. */
export interface CacheEntry {
  key: string;
  bytes: number;
  /** Last use, in milliseconds (the folder's modification time). */
  usedAt: number;
}

/** The keys to delete, least recently used first, until the rest fits in `maxBytes`. */
export function cachesToEvict(entries: CacheEntry[], maxBytes: number): string[] {
  let total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  const evict: string[] = [];
  for (const entry of entries.toSorted((a, b) => a.usedAt - b.usedAt)) {
    if (total <= maxBytes) break;
    evict.push(entry.key);
    total -= entry.bytes;
  }
  return evict;
}

/** `KEY=value` lines for `docker run --env-file`; values can't contain line breaks there. */
export function envFile(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${value.replace(/\r?\n/g, ' ')}`)
    .join('\n');
}

/**
 * `docker run` for a build (decision 41): throwaway, under `runtime` (gVisor's `runsc` on a shared
 * host), on the default bridge (which the host's firewall limits to the internet), the agent's own
 * unprivileged user, no capabilities, low-priority CPU, memory and process limits, only the work
 * folder mounted, plus the project's dependency cache (decision 68) when there is one.
 */
export function dockerArgs(input: {
  name: string;
  work: string;
  rootDir: string;
  envFile: string;
  nodeVersion: string;
  uid: number;
  gid: number;
  command: string;
  runtime?: string;
  /** The cache folder, mounted at /cache with the package managers' stores pointed at it. */
  cache?: string;
}): string[] {
  const workdir = `/work${input.rootDir ? `/${input.rootDir}` : ''}`;
  return [
    'run',
    '--rm',
    '--name',
    input.name,
    ...(input.runtime ? ['--runtime', input.runtime] : []),
    '--network',
    'bridge',
    '--user',
    `${input.uid}:${input.gid}`,
    '--cpus',
    '2',
    '--cpu-shares',
    '256',
    '--memory',
    '2g',
    '--memory-swap',
    '2g',
    '--pids-limit',
    '512',
    '--security-opt',
    'no-new-privileges',
    '--cap-drop',
    'ALL',
    '-e',
    'HOME=/tmp',
    '-e',
    'CI=true',
    '--env-file',
    input.envFile,
    '-v',
    `${input.work}:/work`,
    ...(input.cache
      ? [
          '-v',
          `${input.cache}:/cache`,
          '-e',
          'npm_config_cache=/cache/npm',
          '-e',
          'npm_config_logs_dir=/tmp/npm-logs',
          '-e',
          'YARN_CACHE_FOLDER=/cache/yarn',
          '-e',
          'YARN_GLOBAL_FOLDER=/cache/yarn-berry',
          '-e',
          'npm_config_store_dir=/cache/pnpm',
          '-e',
          'pnpm_config_store_dir=/cache/pnpm',
        ]
      : []),
    '-w',
    workdir,
    `node:${input.nodeVersion}-bookworm-slim`,
    'sh',
    '-c',
    input.command,
  ];
}

/** The most the API takes as `config` (`POST /cloud/config/check` refuses more than 1 MB too). */
const MAX_CONFIG_BYTES = 1024 * 1024;

/**
 * The text of the build root's `codeqlick.json` (redirects, rewrites, headers; architecture 4.13),
 * or undefined when there is none. This runs on the host after untrusted build code, so it only
 * accepts a regular file (never a symlink) whose real path, and the root's, stay inside `src`
 * (the checkout), and it never puts anything of the file in an error. The API validates the rules;
 * here only a file that isn't JSON (or is absurdly big) fails the build.
 */
export async function readRulesFile(src: string, root: string): Promise<string | undefined> {
  const path = join(root, 'codeqlick.json');
  const info = await lstat(path).catch(() => null);
  if (!info) return undefined;
  if (!info.isFile()) throw new Error('codeqlick.json must be a regular file');
  const base = await realpath(src);
  const within = (real: string) => real === base || real.startsWith(`${base}${sep}`);
  const realRoot = await realpath(root).catch(() => null);
  if (!realRoot || !within(realRoot)) throw new Error('The build root is outside the repository');
  const realFile = await realpath(path).catch(() => null);
  if (!realFile || !within(realFile) || realFile !== join(realRoot, 'codeqlick.json'))
    throw new Error('codeqlick.json must be a regular file inside the repository');
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    throw new Error('codeqlick.json must be a regular file inside the repository');
  }
  try {
    const opened = await handle.stat();
    if (!opened.isFile()) throw new Error('codeqlick.json must be a regular file');
    if (opened.size > MAX_CONFIG_BYTES) throw new Error('codeqlick.json is over 1 MB');
    const text = await handle.readFile('utf8');
    let valid = false;
    try {
      const data: unknown = JSON.parse(text);
      valid = typeof data === 'object' && data !== null && !Array.isArray(data);
    } catch {
      // Not JSON: the message below says so, without the parser's text.
    }
    if (!valid) throw new Error('codeqlick.json is not valid JSON');
    return text;
  } finally {
    await handle.close();
  }
}
