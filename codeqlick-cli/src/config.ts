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

export async function writeProjectFile(file: ProjectFile, cwd = process.cwd()): Promise<void> {
  await writeFile(join(cwd, PROJECT_FILE), `${JSON.stringify(file, null, 2)}\n`);
}

export const DEFAULT_API = 'https://api.codeqlick.com/v1';
