/**
 * Suggested build settings in the console's Git tab (architecture 4.13, Suggested settings).
 * Pure: the connect form uses it on the client, the tests without Next.js.
 */
import type { CloudDetect, CloudDetectNote, CloudFramework } from '@/lib/api/cloud';

/** The fields a suggestion fills, by their form names. */
export type BuildField = 'buildCommand' | 'outputDir' | 'nodeVersion';
export const BUILD_FIELDS: readonly BuildField[] = ['buildCommand', 'outputDir', 'nodeVersion'];

/** The Node versions the form offers. */
export const NODE_VERSIONS = ['24', '22', '20'] as const;

/** Product names: the same in every language. */
export const FRAMEWORK_NAMES: Record<CloudFramework, string> = {
  astro: 'Astro',
  docusaurus: 'Docusaurus',
  gatsby: 'Gatsby',
  next: 'Next.js',
  nuxt: 'Nuxt',
  sveltekit: 'SvelteKit',
  eleventy: 'Eleventy',
  cra: 'Create React App',
  vite: 'Vite',
};

/** The message (under `Cloud.git.detect.notes`) for each note of the API. */
export const NOTE_KEYS = {
  'next-not-static': 'nextNotStatic',
  'sveltekit-no-static-adapter': 'sveltekitNoStaticAdapter',
  'node-unsupported': 'nodeUnsupported',
  'no-package-json': 'noPackageJson',
} as const satisfies Record<CloudDetectNote, string>;

export type DetectNoteKey = (typeof NOTE_KEYS)[CloudDetectNote];

export type DetectQuery = {
  installationId: number;
  repoId: number;
  branch: string;
  rootDir: string;
};

/**
 * What to ask the API for, from the form's repository (`installationId:repoId`), branch and root
 * folder; null while they can't name a folder yet (no repository, or a branch that isn't one).
 */
export function detectQuery(repo: string, branch: string, rootDir: string): DetectQuery | null {
  const [installationId, repoId] = repo.split(':').map(Number);
  const name = branch.trim();
  if (!installationId || !repoId || !/^[\w./-]{1,200}$/.test(name)) return null;
  const folder = rootDir.trim();
  if (folder.length > 200) return null;
  return { installationId, repoId, branch: name, rootDir: folder };
}

/**
 * Whether to ask for a suggestion: only while the project isn't connected (`saved` empty), or when
 * another repository than the connected one is chosen. Both are `installationId:repoId`; the
 * repository id decides, since a repository is the same through any installation.
 */
export function shouldSuggest(saved: string, chosen: string): boolean {
  if (!saved) return true;
  return saved.split(':')[1] !== chosen.split(':')[1];
}

/** The values to put in the form: every suggested field the person hasn't edited. */
export function suggestedValues(
  suggestion: CloudDetect,
  edited: ReadonlySet<BuildField>,
): Partial<Record<BuildField, string>> {
  const values: Partial<Record<BuildField, string>> = {};
  for (const field of BUILD_FIELDS) {
    if (edited.has(field)) continue;
    const value = suggestion[field];
    if (typeof value !== 'string') continue;
    if (field === 'nodeVersion' && !(NODE_VERSIONS as readonly string[]).includes(value)) continue;
    values[field] = value;
  }
  return values;
}

export type DetectStatusPart =
  | { key: 'framework'; values: { framework: string } }
  | { key: 'noFramework'; values?: undefined }
  | { key: 'nodeFile'; values: { version: string; file: string } }
  | { key: 'nodeEngines'; values: { version: string } };

/**
 * The status line's parts (messages under `Cloud.git.detect`), joined with " · ":
 * "Astro detected in package.json · Node 22 from .nvmrc".
 */
export function detectStatusParts(suggestion: CloudDetect): DetectStatusPart[] {
  const parts: DetectStatusPart[] = [
    suggestion.framework
      ? {
          key: 'framework',
          values: { framework: FRAMEWORK_NAMES[suggestion.framework] ?? suggestion.framework },
        }
      : { key: 'noFramework' },
  ];
  if (suggestion.nodeFrom === 'engines') {
    parts.push({ key: 'nodeEngines', values: { version: suggestion.nodeVersion } });
  } else if (suggestion.nodeFrom) {
    parts.push({
      key: 'nodeFile',
      values: { version: suggestion.nodeVersion, file: suggestion.nodeFrom },
    });
  }
  return parts;
}

/** The notes' message keys, skipping any this console doesn't know yet. */
export function detectNoteKeys(suggestion: CloudDetect): DetectNoteKey[] {
  return suggestion.notes.flatMap((note) => (note in NOTE_KEYS ? [NOTE_KEYS[note]] : []));
}
