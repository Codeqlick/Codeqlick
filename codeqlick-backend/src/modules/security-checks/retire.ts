import { z } from 'zod';

/** What is kept of Retire.js's `jsrepository.json` (MIT licence): URL and file name patterns. */
const vulnerabilitySchema = z.object({
  atOrAbove: z.string().optional(),
  below: z.string().optional(),
  severity: z.string().optional(),
  info: z.array(z.string()).optional(),
  identifiers: z.object({ summary: z.string().optional() }).loose().optional(),
});

const libSchema = z.object({
  vulnerabilities: z.array(vulnerabilitySchema).default([]),
  extractors: z
    .object({
      filename: z.array(z.string()).optional(),
      uri: z.array(z.string()).optional(),
    })
    .loose()
    .optional(),
});

/** The repository as Retire.js publishes it (extra fields ignored). */
export const retireSourceSchema = z.record(z.string(), libSchema);

export interface RetireVulnerability {
  atOrAbove?: string;
  below?: string;
  severity?: string;
  info?: string[];
}
export interface RetireLibrary {
  vulnerabilities: RetireVulnerability[];
  filename: string[];
  uri: string[];
}
export type RetireRepository = Record<string, RetireLibrary>;

/** Parses and strips the repository down to what the matching needs. */
export function parseRetire(json: unknown): RetireRepository {
  const source = retireSourceSchema.parse(json);
  const repository: RetireRepository = {};
  for (const [name, lib] of Object.entries(source)) {
    // Libraries without URL patterns can't be matched (they are detected by file contents).
    const filename = lib.extractors?.filename ?? [];
    const uri = lib.extractors?.uri ?? [];
    if (filename.length === 0 && uri.length === 0) continue;
    repository[name] = {
      filename,
      uri,
      vulnerabilities: lib.vulnerabilities.map((vulnerability) => ({
        atOrAbove: vulnerability.atOrAbove,
        below: vulnerability.below,
        severity: vulnerability.severity,
        info: vulnerability.info,
      })),
    };
  }
  return repository;
}

/** What is kept in the `settings` row: the stripped repository and when it was fetched. */
export const storedRetireSchema = z.object({
  fetchedAt: z.string(),
  data: z.record(
    z.string(),
    z.object({
      filename: z.array(z.string()),
      uri: z.array(z.string()),
      vulnerabilities: z.array(
        z.object({
          atOrAbove: z.string().optional(),
          below: z.string().optional(),
          severity: z.string().optional(),
          info: z.array(z.string()).optional(),
        }),
      ),
    }),
  ),
});

/** A version number: bounded, so a pattern can't run away on a long file name. */
const VERSION = '[0-9][0-9a-z._-]{0,30}?';
/** Longest pattern accepted from the downloaded data. */
const MAX_PATTERN_CHARS = 200;
/** A group that holds a quantifier and is itself quantified (`(a+)+`, `(.*)*`): catastrophic. */
const NESTED_QUANTIFIER = /\([^)]*[+*}][^)]*\)[+*{]/;
/** A back-reference (`\1`). */
const BACKREFERENCE = /\\[1-9]/;
/** Longest script URL and file name matched; longer ones are skipped. */
export const MAX_URL_CHARS = 512;
export const MAX_FILENAME_CHARS = 128;
/** Most distinct scripts matched per page. */
export const MAX_SCRIPTS = 50;
/** Hard time limit of one matching run (the caps above should keep it far below). */
const MATCH_BUDGET_MS = 250;

/** A pattern of the downloaded data as a RegExp, or null when it is unsafe or invalid. */
export function pattern(source: string): RegExp | null {
  if (source.length > MAX_PATTERN_CHARS) return null;
  if (NESTED_QUANTIFIER.test(source) || BACKREFERENCE.test(source)) return null;
  try {
    return new RegExp(source.replaceAll('§§version§§', `(${VERSION})`), 'i');
  } catch {
    return null;
  }
}

interface CompiledLibrary {
  library: string;
  entry: RetireLibrary;
  filename: RegExp[];
  uri: RegExp[];
}

/** Patterns compiled once per loaded repository (the object identity is the key). */
const compiledRepositories = new WeakMap<RetireRepository, CompiledLibrary[]>();

function compiled(repository: RetireRepository): CompiledLibrary[] {
  let libraries = compiledRepositories.get(repository);
  if (!libraries) {
    const usable = (sources: string[]) =>
      sources.map(pattern).filter((regex): regex is RegExp => regex !== null);
    libraries = Object.entries(repository).map(([library, entry]) => ({
      library,
      entry,
      filename: usable(entry.filename),
      uri: usable(entry.uri),
    }));
    compiledRepositories.set(repository, libraries);
  }
  return libraries;
}

/** Numeric parts of a version (`1.8.0-beta` → [1, 8, 0]). */
function parts(version: string): number[] {
  return version
    .split(/[.\-_]/)
    .map((piece) => Number.parseInt(piece, 10))
    .filter((piece) => Number.isFinite(piece));
}

/** < 0, 0 or > 0 as `a` is before, equal to or after `b`. */
export function compareVersions(a: string, b: string): number {
  const left = parts(a);
  const right = parts(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export interface LibraryFinding {
  library: string;
  version: string;
  fixedIn: string | null;
  severity: string;
  advisory: string | null;
}

/** The known-vulnerable libraries among `scriptUrls`, by their URLs and file names only. */
export function findVulnerableLibraries(
  scriptUrls: string[],
  repository: RetireRepository,
): LibraryFinding[] {
  const found = new Map<string, LibraryFinding>();
  const libraries = compiled(repository);
  const deadline = Date.now() + MATCH_BUDGET_MS;
  const urls = [...new Set(scriptUrls)]
    .filter((url) => url.length <= MAX_URL_CHARS)
    .slice(0, MAX_SCRIPTS);
  for (const url of urls) {
    let name = url;
    try {
      name = new URL(url, 'https://x.invalid/').pathname.split('/').pop() ?? url;
    } catch {
      // The raw text is matched.
    }
    if (name.length > MAX_FILENAME_CHARS) continue;
    for (const { library, entry, filename, uri } of libraries) {
      if (Date.now() > deadline) return [...found.values()];
      let version: string | null = null;
      for (const [regexes, text] of [
        [filename, name],
        [uri, url],
      ] as const) {
        for (const regex of regexes) {
          const match = regex.exec(text);
          if (match?.[1]) {
            version = match[1].replace(/[.\-_]+$/, '');
            break;
          }
        }
        if (version) break;
      }
      if (!version) continue;
      const hits = entry.vulnerabilities.filter(
        (vulnerability) =>
          (!vulnerability.atOrAbove || compareVersions(version, vulnerability.atOrAbove) >= 0) &&
          (!vulnerability.below || compareVersions(version, vulnerability.below) < 0),
      );
      if (hits.length === 0) continue;
      const worst =
        hits.find((hit) => hit.severity === 'critical') ??
        hits.find((hit) => hit.severity === 'high') ??
        hits[0]!;
      const fixed = hits
        .map((hit) => hit.below)
        .filter((below): below is string => !!below)
        .toSorted(compareVersions)
        .at(-1);
      found.set(`${library}@${version}`, {
        library,
        version,
        fixedIn: fixed ?? null,
        severity: worst.severity ?? 'medium',
        advisory: worst.info?.[0] ?? null,
      });
    }
  }
  return [...found.values()];
}
