import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import type {
  CloudBucket,
  CloudBucketKey,
  CloudDatabase,
  CorsInput,
  CorsMethod,
  CorsRule,
} from './api.ts';

/**
 * The pure parts of `codeqlick db` and `codeqlick buckets` (architecture, "Command line for
 * databases and storage"): name matching, confirmations, CORS flags, tables and psql's invocation.
 */

/** A mistake on the command line or a refusal: its message is printed, the exit code is 1. */
export class CommandError extends Error {}

// ── Names ─────────────────────────────────────────────────────────────────────────────────────

/** What an argument names: the item with that id, else every item with that exact name. */
export function findByRef<T extends { id: string; name: string }>(items: T[], ref: string): T[] {
  const byId = items.find((item) => item.id === ref);
  return byId ? [byId] : items.filter((item) => item.name === ref);
}

/** The one database or bucket an argument names; none or several is an error that says so. */
export function pickByRef<T extends { id: string; name: string; createdAt: string }>(
  items: T[],
  ref: string,
  kind: 'database' | 'bucket',
  project: string,
): T {
  const matches = findByRef(items, ref);
  if (matches.length === 0) throw new CommandError(`There is no ${kind} "${ref}" in ${project}.`);
  if (matches.length > 1) {
    throw new CommandError(
      [
        `${matches.length} ${kind}s are named "${ref}": use an id.`,
        ...matches.map((m) => `  ${m.id}  created ${m.createdAt.slice(0, 10)}`),
      ].join('\n'),
    );
  }
  return matches[0]!;
}

/** The access key an argument names: its id, its access key id, else its name. */
export function pickKey(keys: CloudBucketKey[], ref: string, bucket: string): CloudBucketKey {
  const exact = keys.find((k) => k.id === ref) ?? keys.find((k) => k.accessKeyId === ref);
  const matches = exact ? [exact] : keys.filter((k) => k.name === ref);
  if (matches.length === 0)
    throw new CommandError(`There is no key "${ref}" in the bucket ${bucket}.`);
  if (matches.length > 1) {
    throw new CommandError(
      [
        `${matches.length} keys of ${bucket} are named "${ref}": use an id or access key id.`,
        ...matches.map((k) => `  ${k.id}  ${k.accessKeyId}`),
      ].join('\n'),
    );
  }
  return matches[0]!;
}

// ── Confirmations ─────────────────────────────────────────────────────────────────────────────

/** Whether to ask: `--yes` skips it, a terminal asks, anything else (CI) refuses. */
export function confirmMode(input: {
  yes: boolean | undefined;
  interactive: boolean | undefined;
}): 'skip' | 'ask' | 'refuse' {
  if (input.yes) return 'skip';
  return input.interactive ? 'ask' : 'refuse';
}

/** Only `y` or `yes` (any case) goes on. */
export function isYes(answer: string): boolean {
  return /^(y|yes)$/i.test(answer.trim());
}

export interface ConfirmIo {
  interactive: boolean | undefined;
  ask: (prompt: string) => Promise<string>;
}

/** Asks on standard error, so standard output stays the command's (and `--json`'s). */
async function askOnTerminal(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return await rl.question(prompt);
  } finally {
    rl.close();
  }
}

const terminal: ConfirmIo = {
  get interactive() {
    return process.stdin.isTTY;
  },
  ask: askOnTerminal,
};

/** Goes on when confirmed (or `--yes`); otherwise throws, and nothing is changed. */
export async function confirm(
  question: string,
  yes: boolean | undefined,
  io: ConfirmIo = terminal,
): Promise<void> {
  const mode = confirmMode({ yes, interactive: io.interactive });
  if (mode === 'skip') return;
  if (mode === 'refuse') throw new CommandError(`${question}\nPass --yes to confirm.`);
  if (!isYes(await io.ask(`${question} [y/N] `)))
    throw new CommandError('Cancelled: nothing was changed.');
}

// ── CORS ──────────────────────────────────────────────────────────────────────────────────────

const METHODS: readonly CorsMethod[] = ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'];

/** `a,b, c` as `['a', 'b', 'c']`. */
export function splitList(text: string): string[] {
  return text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * The rule `buckets cors <bucket> set <origin...>` sends: the origins (also comma-separated) and
 * only the flags given, so the API fills in its defaults for the rest.
 */
export function parseCors(
  origins: string[],
  flags: { methods?: string; headers?: string; 'max-age'?: string },
): CorsInput {
  const list = origins.flatMap(splitList);
  if (list.length === 0)
    throw new CommandError('Which origins? codeqlick buckets cors <bucket> set <origin...>');
  if (list.length > 10) throw new CommandError('A CORS rule has at most 10 origins.');
  const rule: CorsInput = { origins: list };
  if (flags.methods !== undefined) {
    const methods = splitList(flags.methods).map((m) => m.toUpperCase());
    const wrong = methods.filter((m) => !METHODS.includes(m as CorsMethod));
    if (methods.length === 0 || wrong.length > 0) {
      throw new CommandError(`--methods takes ${METHODS.join(', ')} (comma-separated).`);
    }
    rule.methods = [...new Set(methods)] as CorsMethod[];
  }
  if (flags.headers !== undefined) {
    const headers = splitList(flags.headers);
    if (headers.length === 0) throw new CommandError('--headers takes header names, a,b,c.');
    rule.headers = headers;
  }
  if (flags['max-age'] !== undefined) {
    const maxAge = Number(flags['max-age']);
    if (!/^\d+$/.test(flags['max-age']) || maxAge > 86_400) {
      throw new CommandError('--max-age is a whole number of seconds, 0 to 86400.');
    }
    rule.maxAge = maxAge;
  }
  return rule;
}

/** A CORS rule as lines of `field  value`. */
export function corsLines(cors: CorsRule | null): string[] {
  if (!cors) return ['No CORS rule.'];
  return columns([
    ['origins', cors.origins.join(', ')],
    ['methods', cors.methods.join(', ')],
    ['headers', cors.headers.join(', ') || '-'],
    ['expose', cors.exposeHeaders.join(', ') || '-'],
    ['max age', `${cors.maxAge} s`],
  ]);
}

// ── Tables ────────────────────────────────────────────────────────────────────────────────────

/** A size as `512 B`, `1.5 KB`, `20.0 MB` or `1.0 GB`. */
export function sizeText(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

/** Rows as aligned columns, two spaces apart (the last column isn't padded). */
export function columns(rows: string[][]): string[] {
  const widths: number[] = [];
  for (const row of rows)
    row.forEach((cell, i) => (widths[i] = Math.max(widths[i] ?? 0, cell.length)));
  return rows.map((row) =>
    row.map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i]!))).join('  '),
  );
}

/** `codeqlick db ls`: name, size against its limit, read-only, connection string. */
export function databaseTable(items: CloudDatabase[]): string[] {
  return columns([
    ['NAME', 'SIZE', 'READ-ONLY', 'CONNECTION'],
    ...items.map((d) => [
      d.name,
      `${sizeText(d.sizeBytes)} / ${sizeText(d.maxBytes)}`,
      d.readOnly ? 'yes' : 'no',
      withoutPassword(d.connectionUrl),
    ]),
  ]);
}

const count = (n: number) => n.toLocaleString('en-US');

/** `codeqlick buckets ls`: usage against the quota, public address, CORS origins, keys. */
export function bucketTable(items: CloudBucket[]): string[] {
  return columns([
    ['NAME', 'SIZE', 'OBJECTS', 'KEYS', 'CORS', 'PUBLIC'],
    ...items.map((b) => [
      b.name,
      `${sizeText(b.sizeBytes)} / ${sizeText(b.maxBytes)}`,
      `${count(b.objects)} / ${count(b.maxObjects)}`,
      String(b.keys.length),
      b.cors ? b.cors.origins.join(',') : '-',
      b.public ? `public ${b.publicUrl ?? ''}`.trimEnd() : 'no',
    ]),
  ]);
}

/** `codeqlick buckets keys <bucket>`: name, access key id, access, created. */
export function keyTable(keys: CloudBucketKey[]): string[] {
  return columns([
    ['NAME', 'ACCESS KEY ID', 'ACCESS', 'CREATED'],
    ...keys.map((k) => [
      k.name,
      k.accessKeyId,
      k.write ? 'read-write' : 'read-only',
      k.createdAt.slice(0, 10),
    ]),
  ]);
}

// ── psql ──────────────────────────────────────────────────────────────────────────────────────

/** A connection URL with any password taken out. */
export function withoutPassword(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.password) return url;
    parsed.password = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

/** The names a command has on this platform (`psql.exe`, … on Windows). */
export function executableNames(
  name: string,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): string[] {
  if (platform !== 'win32') return [name];
  const exts = (env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean);
  return [...exts.map((ext) => name + ext.toLowerCase()), name];
}

/** The first executable called `name` in `PATH`, or null (no `which`, no dependency). */
export async function findExecutable(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  const path = env.PATH ?? env.Path ?? '';
  const sep = platform === 'win32' ? ';' : ':';
  const mode = platform === 'win32' ? constants.F_OK : constants.X_OK;
  for (const dir of path.split(sep).filter(Boolean)) {
    for (const file of executableNames(name, platform, env)) {
      const full = join(dir, file);
      try {
        await access(full, mode);
        return full;
      } catch {
        // Not here.
      }
    }
  }
  return null;
}

/**
 * How `db psql` runs psql: the URL without the password as its only argument; a password (after
 * `--reset`) only in the environment's `PGPASSWORD`, never on the command line.
 */
export function psqlInvocation(
  psql: string,
  connectionUrl: string,
  password: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): { command: string; args: string[]; env: NodeJS.ProcessEnv } {
  const childEnv = { ...env };
  if (password !== undefined) childEnv.PGPASSWORD = password;
  return { command: psql, args: [withoutPassword(connectionUrl)], env: childEnv };
}
