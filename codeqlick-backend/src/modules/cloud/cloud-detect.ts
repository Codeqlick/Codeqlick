/**
 * Suggested build settings from a repository's files (architecture 4.13 "Suggested settings",
 * decision 75). Pure functions: the service reads the files through GitHub and hands them here.
 */

export type DetectedFramework =
  'astro' | 'docusaurus' | 'gatsby' | 'next' | 'nuxt' | 'sveltekit' | 'eleventy' | 'cra' | 'vite';

export type DetectNote =
  'next-not-static' | 'sveltekit-no-static-adapter' | 'node-unsupported' | 'no-package-json';

export type NodeSource = '.nvmrc' | '.node-version' | 'engines';

export interface DetectedSettings {
  framework: DetectedFramework | null;
  buildCommand: string;
  outputDir: string;
  nodeVersion: string;
  nodeFrom: NodeSource | null;
  notes: DetectNote[];
}

export interface DetectInput {
  /** Names of the files in the root folder. */
  listing: string[];
  /** `package.json`'s text; null when it isn't there or couldn't be read (too large). */
  packageJson: string | null;
  nvmrc: string | null;
  nodeVersionFile: string | null;
  /** The Next.js config file's text, when there is one and the framework is Next.js. */
  nextConfig: string | null;
}

/** The defaults of a project's build settings (the `CloudProject` columns). */
export const DETECT_DEFAULTS = { buildCommand: 'npm run build', outputDir: 'dist', node: '24' };

/** Node versions the build server has images for, oldest first. */
export const SUPPORTED_NODE = [20, 22, 24] as const;
const NEWEST_NODE = '24';
const LTS_CODENAMES = new Map([
  ['iron', 20],
  ['jod', 22],
  ['krypton', 24],
]);

/** Largest file read from the repository. */
export const MAX_DETECT_FILE_BYTES = 512 * 1024;

/** Next.js config files, in the order Next.js itself looks for them. */
export const NEXT_CONFIG_FILES = [
  'next.config.js',
  'next.config.mjs',
  'next.config.ts',
  'next.config.cjs',
] as const;

interface FrameworkRule {
  id: DetectedFramework;
  dependency: string;
  /** Used when `package.json` has no `build` script. */
  command: string;
  outputDir: string;
  /** Always this command, even with a `build` script. */
  forceCommand?: boolean;
}

/** In the spec's order: the first one found decides. */
const FRAMEWORKS: FrameworkRule[] = [
  { id: 'astro', dependency: 'astro', command: 'npx astro build', outputDir: 'dist' },
  {
    id: 'docusaurus',
    dependency: '@docusaurus/core',
    command: 'npx docusaurus build',
    outputDir: 'build',
  },
  { id: 'gatsby', dependency: 'gatsby', command: 'npx gatsby build', outputDir: 'public' },
  { id: 'next', dependency: 'next', command: 'npx next build', outputDir: 'out' },
  // The spec gives Nuxt its build command outright: a `build` script runs `nuxt build`, a
  // server, while only `nuxi generate` writes the static pages into `.output/public`.
  {
    id: 'nuxt',
    dependency: 'nuxt',
    command: 'npx nuxi generate',
    outputDir: '.output/public',
    forceCommand: true,
  },
  { id: 'sveltekit', dependency: '@sveltejs/kit', command: 'npx vite build', outputDir: 'build' },
  {
    id: 'eleventy',
    dependency: '@11ty/eleventy',
    command: 'npx @11ty/eleventy',
    outputDir: '_site',
  },
  {
    id: 'cra',
    dependency: 'react-scripts',
    command: 'npx react-scripts build',
    outputDir: 'build',
  },
  { id: 'vite', dependency: 'vite', command: 'npx vite build', outputDir: 'dist' },
];

interface PackageInfo {
  dependencies: Set<string>;
  hasBuildScript: boolean;
  engineNode: unknown;
}

/**
 * `package.json` as far as detection cares, or null when it isn't a JSON object. An invalid
 * `package.json` is not treated as a missing one: the folder is right, the file is broken (the
 * build will say so), so it gets no framework, the defaults and no note.
 */
export function readPackageJson(text: string | null): PackageInfo | null {
  if (text === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(value)) return null;
  const dependencies = new Set<string>();
  for (const field of ['dependencies', 'devDependencies']) {
    const map = value[field];
    if (isObject(map)) for (const name of Object.keys(map)) dependencies.add(name);
  }
  const scripts = value.scripts;
  const build = isObject(scripts) ? scripts.build : undefined;
  const engines = value.engines;
  return {
    dependencies,
    hasBuildScript: typeof build === 'string' && build.trim() !== '',
    engineNode: isObject(engines) ? engines.node : undefined,
  };
}

/** The framework `package.json` names, or null. */
export function frameworkOf(packageJson: string | null): DetectedFramework | null {
  const info = readPackageJson(packageJson);
  return info ? (findFramework(info)?.id ?? null) : null;
}

function findFramework(info: PackageInfo): FrameworkRule | undefined {
  return FRAMEWORKS.find((rule) => info.dependencies.has(rule.dependency));
}

/** The Next.js config file in the listing, if any. */
export function nextConfigFile(listing: string[]): string | null {
  return NEXT_CONFIG_FILES.find((name) => listing.includes(name)) ?? null;
}

/**
 * A Node version string (`.nvmrc`, `.node-version` or `engines.node`) as one the build server
 * has: `lts/*` and `>`/`>=` ranges take the newest; otherwise the first major number decides
 * and takes the smallest supported at or above it. `unsupported` when above the newest or
 * unreadable (then the default).
 */
export function resolveNode(raw: string): { version: string; unsupported: boolean } {
  const value = raw.trim().toLowerCase();
  if (value === 'lts/*') return { version: NEWEST_NODE, unsupported: false };
  if (value.startsWith('lts/')) {
    // Only the codenames of the versions we build with; any other (`lts/hydrogen`, `lts/-1`)
    // is one we can't read.
    const major = LTS_CODENAMES.get(value.slice(4));
    return major === undefined
      ? { version: DETECT_DEFAULTS.node, unsupported: true }
      : { version: String(major), unsupported: false };
  }
  if (value.startsWith('>')) return { version: NEWEST_NODE, unsupported: false };
  const digits = /\d+/.exec(value)?.[0];
  if (digits === undefined) return { version: DETECT_DEFAULTS.node, unsupported: true };
  const major = Number(digits);
  const supported = SUPPORTED_NODE.find((version) => version >= major);
  return supported === undefined
    ? { version: NEWEST_NODE, unsupported: true }
    : { version: String(supported), unsupported: false };
}

/**
 * A version file's version: its first line that isn't empty or a comment (nvm allows `#`
 * comments). An empty file counts as no file, so the next source is tried.
 */
function versionLine(text: string | null): string | null {
  if (text === null) return null;
  for (const line of text.split(/\r?\n/)) {
    const value = line.replace(/#.*$/, '').trim();
    if (value) return value;
  }
  return null;
}

/** The suggested settings for a root folder (architecture 4.13 "Suggested settings"). */
export function detectSettings(input: DetectInput): DetectedSettings {
  const notes: DetectNote[] = [];
  const result: DetectedSettings = {
    framework: null,
    buildCommand: DETECT_DEFAULTS.buildCommand,
    outputDir: DETECT_DEFAULTS.outputDir,
    nodeVersion: DETECT_DEFAULTS.node,
    nodeFrom: null,
    notes,
  };
  if (!input.listing.includes('package.json')) notes.push('no-package-json');
  const info = readPackageJson(input.packageJson);

  const rule = info ? findFramework(info) : undefined;
  if (info && rule) {
    result.framework = rule.id;
    result.outputDir = rule.outputDir;
    result.buildCommand =
      info.hasBuildScript && !rule.forceCommand ? 'npm run build' : rule.command;
    if (rule.id === 'next' && !/output\s*:\s*['"]export['"]/.test(input.nextConfig ?? '')) {
      notes.push('next-not-static');
    }
    if (rule.id === 'sveltekit' && !info.dependencies.has('@sveltejs/adapter-static')) {
      notes.push('sveltekit-no-static-adapter');
    }
  }

  // `.nvmrc`, then `.node-version`, then `engines.node`. A source that is there but can't be
  // read still decides (the default with a note), and stays named in `nodeFrom`.
  const engine = info?.engineNode;
  const sources: Array<{ from: NodeSource; value: string | null }> = [
    { from: '.nvmrc', value: versionLine(input.nvmrc) },
    { from: '.node-version', value: versionLine(input.nodeVersionFile) },
    {
      from: 'engines',
      value:
        typeof engine === 'string' || typeof engine === 'number'
          ? String(engine).trim() || null
          : null,
    },
  ];
  for (const { from, value } of sources) {
    if (value === null) continue;
    const node = resolveNode(value);
    result.nodeVersion = node.version;
    result.nodeFrom = from;
    if (node.unsupported) notes.push('node-unsupported');
    break;
  }
  return result;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
