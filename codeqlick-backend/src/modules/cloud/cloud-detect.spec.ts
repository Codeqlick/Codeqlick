import { describe, expect, it } from 'vitest';
import {
  detectSettings,
  frameworkOf,
  nextConfigFile,
  resolveNode,
  type DetectInput,
} from './cloud-detect.js';

const pkg = (value: object) => JSON.stringify(value);

/** A root folder with a `package.json` and whatever else the test gives. */
const input = (overrides: Partial<DetectInput> = {}): DetectInput => ({
  listing: ['package.json'],
  packageJson: pkg({}),
  nvmrc: null,
  nodeVersionFile: null,
  nextConfig: null,
  ...overrides,
});

const withDeps = (deps: Record<string, string>, scripts?: Record<string, string>) =>
  input({ packageJson: pkg({ dependencies: deps, ...(scripts ? { scripts } : {}) }) });

describe('detectSettings: frameworks', () => {
  const cases: Array<[string, string, string, string]> = [
    // dependency, framework, command without a build script, output
    ['astro', 'astro', 'npx astro build', 'dist'],
    ['@docusaurus/core', 'docusaurus', 'npx docusaurus build', 'build'],
    ['gatsby', 'gatsby', 'npx gatsby build', 'public'],
    ['next', 'next', 'npx next build', 'out'],
    ['nuxt', 'nuxt', 'npx nuxi generate', '.output/public'],
    ['@sveltejs/kit', 'sveltekit', 'npx vite build', 'build'],
    ['@11ty/eleventy', 'eleventy', 'npx @11ty/eleventy', '_site'],
    ['react-scripts', 'cra', 'npx react-scripts build', 'build'],
    ['vite', 'vite', 'npx vite build', 'dist'],
  ];

  it.each(cases)('finds %s', (dependency, framework, command, outputDir) => {
    const result = detectSettings(withDeps({ [dependency]: '1.0.0' }));
    expect(result).toMatchObject({ framework, buildCommand: command, outputDir });
  });

  it.each(cases.filter(([, framework]) => framework !== 'nuxt'))(
    'uses the build script for %s when there is one',
    (dependency) => {
      const result = detectSettings(withDeps({ [dependency]: '1.0.0' }, { build: 'make it' }));
      expect(result.buildCommand).toBe('npm run build');
    },
  );

  it('always generates Nuxt statically, even with a build script', () => {
    const result = detectSettings(withDeps({ nuxt: '3.0.0' }, { build: 'nuxt build' }));
    expect(result.buildCommand).toBe('npx nuxi generate');
  });

  it('ignores an empty build script', () => {
    expect(detectSettings(withDeps({ astro: '5' }, { build: '  ' })).buildCommand).toBe(
      'npx astro build',
    );
  });

  it('reads devDependencies too', () => {
    const result = detectSettings(input({ packageJson: pkg({ devDependencies: { vite: '7' } }) }));
    expect(result.framework).toBe('vite');
  });

  it('takes the first framework in the spec order when several are there', () => {
    expect(detectSettings(withDeps({ vite: '7', astro: '5' })).framework).toBe('astro');
    expect(detectSettings(withDeps({ vite: '7', '@sveltejs/kit': '2' })).framework).toBe(
      'sveltekit',
    );
    expect(detectSettings(withDeps({ 'react-scripts': '5', next: '16' })).framework).toBe('next');
    expect(
      detectSettings(
        input({
          packageJson: pkg({ dependencies: { vite: '7' }, devDependencies: { gatsby: '5' } }),
        }),
      ).framework,
    ).toBe('gatsby');
  });

  it('keeps the defaults without a known framework', () => {
    expect(detectSettings(withDeps({ react: '19' }))).toEqual({
      framework: null,
      buildCommand: 'npm run build',
      outputDir: 'dist',
      nodeVersion: '24',
      nodeFrom: null,
      notes: [],
    });
  });

  it('notes a Next.js app that is not a static export', () => {
    const next = withDeps({ next: '16' });
    expect(detectSettings(next).notes).toEqual(['next-not-static']);
    expect(
      detectSettings({ ...next, nextConfig: 'export default { reactStrictMode: true };' }).notes,
    ).toEqual(['next-not-static']);
    expect(
      detectSettings({ ...next, nextConfig: "const config = { output: 'export' };" }).notes,
    ).toEqual([]);
    expect(
      detectSettings({ ...next, nextConfig: 'module.exports = {\n  output  :  "export",\n}' })
        .notes,
    ).toEqual([]);
    expect(
      detectSettings({ ...next, nextConfig: "const config = { output: 'standalone' };" }).notes,
    ).toEqual(['next-not-static']);
  });

  it('notes SvelteKit without the static adapter', () => {
    expect(detectSettings(withDeps({ '@sveltejs/kit': '2' })).notes).toEqual([
      'sveltekit-no-static-adapter',
    ]);
    expect(
      detectSettings(
        input({
          packageJson: pkg({
            dependencies: { '@sveltejs/kit': '2' },
            devDependencies: { '@sveltejs/adapter-static': '3' },
          }),
        }),
      ).notes,
    ).toEqual([]);
  });

  it('keeps the defaults and notes a folder without package.json', () => {
    expect(detectSettings(input({ listing: ['index.html'], packageJson: null }))).toEqual({
      framework: null,
      buildCommand: 'npm run build',
      outputDir: 'dist',
      nodeVersion: '24',
      nodeFrom: null,
      notes: ['no-package-json'],
    });
  });

  it('still reads .nvmrc without package.json', () => {
    const result = detectSettings(
      input({ listing: ['.nvmrc', 'index.html'], packageJson: null, nvmrc: '22\n' }),
    );
    expect(result).toMatchObject({ nodeVersion: '22', nodeFrom: '.nvmrc' });
    expect(result.notes).toEqual(['no-package-json']);
  });

  it('treats an invalid or unreadable package.json as no framework, without a note', () => {
    for (const packageJson of ['{ not json', '[]', '"text"', 'null', null]) {
      expect(detectSettings(input({ packageJson }))).toEqual({
        framework: null,
        buildCommand: 'npm run build',
        outputDir: 'dist',
        nodeVersion: '24',
        nodeFrom: null,
        notes: [],
      });
    }
  });

  it('ignores dependency fields that are not objects', () => {
    expect(detectSettings(input({ packageJson: pkg({ dependencies: ['astro'] }) })).framework).toBe(
      null,
    );
  });
});

describe('detectSettings: Node version', () => {
  it('defaults to 24 without a source', () => {
    expect(detectSettings(input())).toMatchObject({ nodeVersion: '24', nodeFrom: null });
  });

  it('reads .nvmrc first, then .node-version, then engines.node', () => {
    const engines = pkg({ engines: { node: '20' } });
    expect(
      detectSettings(input({ packageJson: engines, nvmrc: '22', nodeVersionFile: '24' })),
    ).toMatchObject({ nodeVersion: '22', nodeFrom: '.nvmrc' });
    expect(
      detectSettings(input({ packageJson: engines, nodeVersionFile: '22.3.0' })),
    ).toMatchObject({ nodeVersion: '22', nodeFrom: '.node-version' });
    expect(detectSettings(input({ packageJson: engines }))).toMatchObject({
      nodeVersion: '20',
      nodeFrom: 'engines',
    });
  });

  it('skips an empty version file and comments', () => {
    expect(
      detectSettings(input({ nvmrc: '  \n', nodeVersionFile: '# pinned\n22\n' })),
    ).toMatchObject({ nodeVersion: '22', nodeFrom: '.node-version' });
  });

  it('notes a version above the newest and keeps its source', () => {
    expect(detectSettings(input({ nvmrc: '26' }))).toMatchObject({
      nodeVersion: '24',
      nodeFrom: '.nvmrc',
      notes: ['node-unsupported'],
    });
  });

  it('notes an unreadable version and keeps the default', () => {
    expect(detectSettings(input({ packageJson: pkg({ engines: { node: 'latest' } }) }))).toEqual(
      expect.objectContaining({
        nodeVersion: '24',
        nodeFrom: 'engines',
        notes: ['node-unsupported'],
      }),
    );
  });

  it('ignores engines.node that is not a string', () => {
    expect(
      detectSettings(input({ packageJson: pkg({ engines: { node: { min: 20 } } }) })),
    ).toMatchObject({ nodeVersion: '24', nodeFrom: null, notes: [] });
  });

  it('combines framework and Node notes', () => {
    const result = detectSettings(
      input({
        listing: ['package.json', '.nvmrc'],
        packageJson: pkg({ dependencies: { next: '16' } }),
        nvmrc: 'lts/hydrogen',
      }),
    );
    expect(result.notes).toEqual(['next-not-static', 'node-unsupported']);
  });
});

describe('resolveNode', () => {
  it.each<[string, string, boolean]>([
    ['22', '22', false],
    ['v20.11.1', '20', false],
    ['20.x', '20', false],
    ['^18', '20', false],
    ['~22.1.0', '22', false],
    ['18 || 20', '20', false],
    ['16', '20', false],
    ['21', '22', false],
    ['23.1', '24', false],
    ['24', '24', false],
    ['>=18', '24', false],
    ['>20', '24', false],
    ['>= 22.0.0', '24', false],
    ['lts/iron', '20', false],
    ['lts/jod', '22', false],
    ['lts/krypton', '24', false],
    ['LTS/Jod', '22', false],
    ['lts/*', '24', false],
    ['26', '24', true],
    ['v25.0.0', '24', true],
    ['lts/hydrogen', '24', true],
    ['lts/-1', '24', true],
    ['node', '24', true],
    ['garbage', '24', true],
    ['', '24', true],
  ])('%j → %s (unsupported: %s)', (raw, version, unsupported) => {
    expect(resolveNode(raw)).toEqual({ version, unsupported });
  });
});

describe('helpers', () => {
  it('names the framework of a package.json', () => {
    expect(frameworkOf(pkg({ dependencies: { next: '16' } }))).toBe('next');
    expect(frameworkOf(pkg({}))).toBeNull();
    expect(frameworkOf('nope')).toBeNull();
    expect(frameworkOf(null)).toBeNull();
  });

  it('finds the Next.js config file in Next.js order', () => {
    expect(nextConfigFile(['package.json'])).toBeNull();
    expect(nextConfigFile(['next.config.ts'])).toBe('next.config.ts');
    expect(nextConfigFile(['next.config.mjs', 'next.config.js'])).toBe('next.config.js');
    expect(nextConfigFile(['next.config.cjs'])).toBe('next.config.cjs');
  });
});
