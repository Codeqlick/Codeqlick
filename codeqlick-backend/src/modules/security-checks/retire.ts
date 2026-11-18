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

const VERSION = '[0-9][0-9a-z._\\-]+?';

function pattern(source: string): RegExp | null {
  try {
    return new RegExp(source.replaceAll('§§version§§', `(${VERSION})`), 'i');
  } catch {
    return null;
  }
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
  for (const url of scriptUrls) {
    let name = url;
    try {
      name = new URL(url, 'https://x.invalid/').pathname.split('/').pop() ?? url;
    } catch {
      // The raw text is matched.
    }
    for (const [library, entry] of Object.entries(repository)) {
      const candidates = [
        ...entry.filename.map((source) => [pattern(source), name] as const),
        ...entry.uri.map((source) => [pattern(source), url] as const),
      ];
      let version: string | null = null;
      for (const [regex, text] of candidates) {
        const match = regex?.exec(text);
        if (match?.[1]) {
          version = match[1].replace(/[.\-_]+$/, '');
          break;
        }
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
