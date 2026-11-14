import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** Where the token is kept: ~/.config/codeqlick/config.json (or $XDG_CONFIG_HOME), mode 600. */
export function configPath(env = process.env): string {
  const base = env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'codeqlick', 'config.json');
}

export interface StoredConfig {
  token?: string;
  apiUrl?: string;
}

export async function readConfig(path = configPath()): Promise<StoredConfig> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as StoredConfig;
  } catch {
    return {};
  }
}

export async function saveConfig(config: StoredConfig, path = configPath()): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

export async function forgetConfig(path = configPath()): Promise<void> {
  await rm(path, { force: true });
}

/** `codeqlick.json` in a project's folder: which team and project it deploys, and from where. */
export interface ProjectFile {
  team?: string;
  project?: string;
  dir?: string;
}

export const PROJECT_FILE = 'codeqlick.json';

export async function readProjectFile(cwd = process.cwd()): Promise<ProjectFile> {
  try {
    const data = JSON.parse(await readFile(join(cwd, PROJECT_FILE), 'utf8')) as ProjectFile;
    return typeof data === 'object' && data ? data : {};
  } catch {
    return {};
  }
}

/** The keys that make a `codeqlick.json` carry routing rules (architecture 4.13). */
export const RULE_KEYS = ['cleanUrls', 'trailingSlash', 'redirects', 'rewrites', 'headers'];

/** A `codeqlick.json` that can't be used as it is (not JSON, or not an object). */
export class ProjectFileError extends Error {}

/**
 * Parses the text of a `codeqlick.json`: its object, or a ProjectFileError that says what is wrong.
 */
export function parseProjectText(text: string): Record<string, unknown> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new ProjectFileError(
      `${PROJECT_FILE} isn't valid JSON (${(error as Error).message}): fix it first, it was left as it is.`,
    );
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new ProjectFileError(
      `${PROJECT_FILE} must be a JSON object: fix it first, it was left as it is.`,
    );
  }
  return data as Record<string, unknown>;
}

/** The file with `link`'s keys set and every other key (and the order of keys) as it was. */
export function mergeProjectFile(
  existing: Record<string, unknown>,
  link: ProjectFile,
): Record<string, unknown> {
  const merged = { ...existing };
  for (const key of ['team', 'project', 'dir'] as const) {
    if (link[key] !== undefined) merged[key] = link[key];
  }
  return merged;
}

/** The text of the folder's `codeqlick.json`, or null when there is none. */
export async function readProjectText(cwd = process.cwd()): Promise<string | null> {
  try {
    return await readFile(join(cwd, PROJECT_FILE), 'utf8');
  } catch {
    return null;
  }
}

/** True when the text sets any routing rule; text that doesn't parse counts (the API says why). */
export function hasRules(text: string): boolean {
  try {
    const data = parseProjectText(text);
    return RULE_KEYS.some((key) => data[key] !== undefined);
  } catch {
    return true;
  }
}

/**
 * Writes the project link into `codeqlick.json`, keeping everything else in the file (rules,
 * `$schema`, unknown keys). A file that isn't valid JSON is never overwritten.
 */
export async function writeProjectFile(file: ProjectFile, cwd = process.cwd()): Promise<void> {
  const text = await readProjectText(cwd);
  const existing = text === null || text.trim() === '' ? {} : parseProjectText(text);
  await writeFile(
    join(cwd, PROJECT_FILE),
    `${JSON.stringify(mergeProjectFile(existing, file), null, 2)}\n`,
  );
}

export const DEFAULT_API = 'https://api.codeqlick.com/v1';
