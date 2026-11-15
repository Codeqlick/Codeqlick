import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { list } from 'tar';
import { describe, expect, it } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import {
  branchLabel,
  BundleError,
  bundlePath,
  CloudStorage,
  deploymentLabel,
  productionLabel,
} from './cloud.storage.js';

describe('bundlePath', () => {
  it('normalises plain paths', () => {
    expect(bundlePath('./')).toBe('');
    expect(bundlePath('./index.html')).toBe('index.html');
    expect(bundlePath('assets/app.js')).toBe('assets/app.js');
    expect(bundlePath('./docs/guide/')).toBe('docs/guide');
    expect(bundlePath('.well-known/security.txt')).toBe('.well-known/security.txt');
  });

  it('refuses paths that could leave the folder', () => {
    for (const path of ['../etc/passwd', 'a/../../b', '/etc/passwd', 'a/./b', 'a\\b']) {
      expect(() => bundlePath(path)).toThrow(BundleError);
    }
  });

  it('refuses control characters and overlong names', () => {
    expect(() => bundlePath('a\nb')).toThrow(BundleError);
    expect(() => bundlePath(`${'x'.repeat(256)}.html`)).toThrow(BundleError);
    expect(() => bundlePath(`${'abcd/'.repeat(250)}x`)).toThrow(BundleError);
  });
});

describe('host labels', () => {
  it('names production and each deployment', () => {
    expect(productionLabel('docs')).toBe('docs');
    expect(deploymentLabel('docs', 'a1b2c3d4')).toBe('docs--a1b2c3d4');
  });
});

describe('CloudStorage.archive', () => {
  it('packs a deployment folder with its uploaded paths, dotfiles and @ names included', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cq-archive-'));
    try {
      const folder = join(root, 'deployments', 'd1');
      await mkdir(join(folder, 'assets'), { recursive: true });
      await writeFile(join(folder, 'index.html'), '<h1>hi</h1>');
      await writeFile(join(folder, '.nojekyll'), '');
      await writeFile(join(folder, 'assets', 'app.js'), 'console.log(1)');
      // Without a `./`, tar would read these as archives to append.
      await mkdir(join(folder, '@scope'));
      await writeFile(join(folder, '@scope', 'a.js'), 'a');
      await writeFile(join(folder, '@vite.js'), 'v');
      const storage = new CloudStorage({
        cloudHosting: { domain: 'cloud.test', root },
      } as unknown as AppConfigService);

      const stream = await storage.archive('d1');
      const file = join(root, 'out.tar.gz');
      await pipeline(stream!, createWriteStream(file));
      const paths: string[] = [];
      await list({ file, onReadEntry: (entry) => paths.push(entry.path) });

      expect(paths.sort()).toEqual([
        './@scope/',
        './@scope/a.js',
        './@vite.js',
        '.nojekyll',
        'assets/',
        'assets/app.js',
        'index.html',
      ]);
      expect(await storage.archive('gone')).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('branchLabel', () => {
  const shape = /^[a-z0-9]+(?:-[a-z0-9]+)*--b-[a-z0-9]+(?:-[a-z0-9]+)*$/;

  it('names a short branch', () => {
    expect(branchLabel('docs', 'dev')).toBe('docs--b-dev');
  });

  it('lowercases and turns each run of other characters into one dash', () => {
    expect(branchLabel('docs', 'feature/Foo_Bar')).toBe('docs--b-feature-foo-bar');
    expect(branchLabel('docs', '--fix//a..b--')).toBe('docs--b-fix-a-b');
  });

  it('keeps a branch that fills the budget exactly', () => {
    const slug = 'a'.repeat(40);
    const part = 'b'.repeat(63 - 40 - 4);
    expect(branchLabel(slug, part)).toBe(`${slug}--b-${part}`);
  });

  it('cuts a long branch and ends with a hash of it', () => {
    const slug = 'a'.repeat(40);
    const branch = 'feature/' + 'x'.repeat(60);
    const label = branchLabel(slug, branch);
    expect(label).toHaveLength(63);
    expect(label.startsWith(`${slug}--b-feature-xxxx`)).toBe(true);
    expect(label).toMatch(/-[0-9a-f]{6}$/);
    expect(label).toMatch(shape);
    // Two long branches that start alike stay apart.
    expect(branchLabel(slug, `${branch}1`)).not.toBe(label);
  });

  it('drops a trailing dash left by the cut', () => {
    const slug = 'a'.repeat(40); // budget 19, cut at 12
    const label = branchLabel(slug, 'abcdefghijk-lmnopqrstuvwxyz');
    expect(label).toMatch(/^a+--b-abcdefghijk-[0-9a-f]{6}$/);
  });

  it('uses the hash alone when nothing is left after sanitising', () => {
    const label = branchLabel('docs', '___');
    expect(label).toMatch(/^docs--b-[0-9a-f]{6}$/);
    expect(label).toMatch(shape);
    expect(branchLabel('docs', '///')).not.toBe(label);
  });

  it('always yields a valid label of at most 63 characters', () => {
    const slugs = ['abc', 'my-site', 'a'.repeat(40)];
    const branches = [
      'main',
      'x',
      '___',
      'Feature/ÑANDÚ',
      'a'.repeat(200),
      '-',
      'release/1.2.3',
      '日本語',
    ];
    for (const slug of slugs) {
      for (const branch of branches) {
        const label = branchLabel(slug, branch);
        expect(label).toMatch(shape);
        expect(label.length).toBeLessThanOrEqual(63);
        expect(label.startsWith(`${slug}--b-`)).toBe(true);
      }
    }
  });
});
