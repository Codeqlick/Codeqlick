import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, join, normalize, posix, relative, sep } from 'node:path';

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
    '-e',
    'COREPACK_ENABLE_DOWNLOAD_PROMPT=0',
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

/** The install and build commands a project has while nobody changes them (architecture 4.13). */
export const DEFAULT_INSTALL = 'npm ci';
export const DEFAULT_BUILD = 'npm run build';
/** Where Corepack puts its `pnpm` and `yarn` shims: the container's user can't write elsewhere. */
export const COREPACK_BIN = '/tmp/.corepack-bin';

/** The little of the checkout the package-manager choice reads; paths are relative to the repository. */
export interface CheckoutFiles {
  exists(path: string): boolean;
  readText(path: string): string | null;
}

export interface PackageManagerChoice {
  install: string;
  build: string;
  /** The `Package manager: …` line for the build log. */
  log: string;
}

const LOCKFILES = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
  ['npm-shrinkwrap.json', 'npm'],
] as const;
const BUN_LOCKFILES = ['bun.lock', 'bun.lockb'];

/** `{ name, major }` from `package.json`'s `packageManager` (`pnpm@9.1.0+sha…`), or null. */
function packageManagerField(text: string | null): { name: string; major: number } | null {
  if (text === null) return null;
  let value: unknown;
  try {
    value = (JSON.parse(text) as { packageManager?: unknown } | null)?.packageManager;
  } catch {
    return null;
  }
  if (typeof value !== 'string') return null;
  const match = /^(pnpm|yarn|npm)@(\d+)?/.exec(value.trim());
  if (!match?.[1]) return null;
  return { name: match[1], major: match[2] ? Number(match[2]) : NaN };
}

/**
 * Picks npm, pnpm or Yarn for a build (architecture 4.13 "Package managers", decision 73). Only a
 * command still at its default is replaced. A valid `packageManager` field in the root folder's
 * `package.json` names the manager (Corepack runs only that one). Otherwise the lockfile does: the
 * nearest folder with one wins, from the root folder up to the repository root (never above it),
 * pnpm before Yarn before npm; otherwise npm. The lockfile also decides frozen or plain install.
 */
export function choosePackageManager(input: {
  rootDir: string;
  installCommand: string;
  buildCommand: string;
  files: CheckoutFiles;
}): PackageManagerChoice {
  const installIsDefault = input.installCommand.trim() === DEFAULT_INSTALL;
  const buildIsDefault = input.buildCommand.trim() === DEFAULT_BUILD;
  if (!installIsDefault && !buildIsDefault) {
    return {
      install: input.installCommand,
      build: input.buildCommand,
      log: 'Package manager: custom commands',
    };
  }
  const { files } = input;
  const at = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);
  const root = posix
    .normalize(input.rootDir || '.')
    .replace(/^\.$/, '')
    .replace(/\/+$/, '');
  if (root === '..' || root.startsWith('../') || posix.isAbsolute(root))
    throw new Error(`${input.rootDir} is outside the repository`);

  // The nearest folder with any lockfile, and every lockfile in it (in the order of preference).
  let found: (typeof LOCKFILES)[number][] = [];
  let lockFolder = root;
  let bun: string | null = null;
  for (let folder = root; ; folder = posix.dirname(folder).replace(/^\.$/, '')) {
    found = LOCKFILES.filter(([name]) => files.exists(at(folder, name)));
    if (found.length > 0) {
      lockFolder = folder;
      break;
    }
    bun ??= BUN_LOCKFILES.find((name) => files.exists(at(folder, name))) ?? null;
    if (!folder) break;
  }
  const field = packageManagerField(files.readText(at(root, 'package.json')));
  const manager = (field?.name ?? found[0]?.[1] ?? 'npm') as 'pnpm' | 'yarn' | 'npm';
  const lockfile = found.find(([, owner]) => owner === manager)?.[0] ?? null;
  const others = found.filter(([name]) => name !== lockfile).map(([name]) => name);
  const where = (name: string) => {
    const rel = posix.relative(root || '.', lockFolder || '.');
    return rel ? `${name} in ${rel}` : name;
  };

  const notes: string[] = [];
  if (field) {
    notes.push('packageManager in package.json');
    if (lockfile) notes.push(where(lockfile));
    if (others.length > 0) notes.push(`${others.join(', ')} ignored`);
  } else if (lockfile) {
    notes.push(where(lockfile));
    if (others.length > 0) notes.push(`also found ${others.join(', ')}`);
  } else notes.push('no lockfile');
  if (bun) notes.push(`${bun} found, but the build image has no Bun`);

  let label: string;
  let install: string;
  let build: string;
  if (manager === 'pnpm') {
    label = 'pnpm';
    install = lockfile ? 'pnpm install --frozen-lockfile' : 'pnpm install';
    build = 'pnpm run build';
  } else if (manager === 'yarn') {
    // The field's version is the one Corepack runs; without it, a `.yarnrc.yml` means Yarn 2+.
    const rc =
      (lockfile !== null && files.exists(at(lockFolder, '.yarnrc.yml'))) ||
      files.exists(at(root, '.yarnrc.yml'));
    const berry = field && !Number.isNaN(field.major) ? field.major >= 2 : rc;
    if (berry && !field) notes.push('set packageManager in package.json so Corepack runs Yarn 2+');
    label = berry ? 'Yarn 2+' : 'Yarn 1';
    install = !lockfile
      ? 'yarn install'
      : berry
        ? 'yarn install --immutable'
        : 'yarn install --frozen-lockfile';
    build = 'yarn run build';
  } else {
    label = 'npm';
    install = lockfile ? 'npm ci' : 'npm install';
    build = 'npm run build';
  }

  return {
    install: installIsDefault ? install : input.installCommand,
    build: buildIsDefault ? build : input.buildCommand,
    log: `Package manager: ${label} (${notes.join('; ')})`,
  };
}

/**
 * The container's `sh -c` command: Corepack's shims first on `PATH` (so `pnpm` and `yarn` work in
 * any command), then install and build. A missing or failing Corepack doesn't stop the build.
 */
export function containerCommand(install: string, build: string): string {
  return (
    `mkdir -p ${COREPACK_BIN} && corepack enable --install-directory ${COREPACK_BIN} >/dev/null 2>&1; ` +
    `export PATH=${COREPACK_BIN}:$PATH; ${install} && ${build}`
  );
}
