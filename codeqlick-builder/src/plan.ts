import { isAbsolute, join, normalize, posix, relative } from 'node:path';

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
 * folder mounted.
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
    '-w',
    workdir,
    `node:${input.nodeVersion}-bookworm-slim`,
    'sh',
    '-c',
    input.command,
  ];
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
