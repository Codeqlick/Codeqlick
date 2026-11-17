import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NEOQLICK_TAGLINE } from './neoqlick-tagline';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe('Neoqlick’s tagline', () => {
  it('is English, sentence case and has no final period', () => {
    expect(NEOQLICK_TAGLINE).toBe('Closer than you think');
  });

  it('is imported only by Neoqlick’s portal, never written out or in the catalogues', () => {
    const src = join(process.cwd(), 'src');
    const users = walk(src)
      .filter((file) => /\.(tsx?|json|css)$/.test(file) && !/\.test\.tsx?$/.test(file))
      .filter((file) => /NEOQLICK_TAGLINE|Closer than you think/.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(src.length + 1))
      .sort();
    expect(users).toEqual([
      'app/[locale]/neoqlick/page.tsx',
      'app/manifest.ts',
      'components/neoqlick/PortalFrame.tsx',
      'lib/neoqlick-tagline.ts',
    ]);
  });
});
