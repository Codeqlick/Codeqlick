import { describe, expect, it } from 'vitest';
import { BundleError, bundlePath, deploymentLabel, productionLabel } from './cloud.storage.js';

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
