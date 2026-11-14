import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, normalize, relative } from 'node:path';

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

/** The most the API takes as `config` (`POST /cloud/config/check` refuses more than 1 MB too). */
const MAX_CONFIG_BYTES = 1024 * 1024;

/**
 * The text of the build root's `codeqlick.json` (redirects, rewrites, headers; architecture 4.13),
 * or undefined when there is none. The API validates the rules; here only a file that isn't JSON
 * (or is absurdly big) fails the build, with a message that says so.
 */
export async function readRulesFile(root: string): Promise<string | undefined> {
  const path = join(root, 'codeqlick.json');
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) return undefined;
  if (info.size > MAX_CONFIG_BYTES) throw new Error('codeqlick.json is over 1 MB');
  const text = await readFile(path, 'utf8');
  try {
    const data: unknown = JSON.parse(text);
    if (typeof data !== 'object' || data === null || Array.isArray(data))
      throw new Error('not an object');
  } catch (error) {
    const reason = error instanceof SyntaxError ? error.message : 'it must be a JSON object';
    throw new Error(`codeqlick.json is not valid JSON: ${reason}`);
  }
  return text;
}
