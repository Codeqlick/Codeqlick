import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..');

/** The only files that may place an ad zone: landing and feed pages, and the videochat room. */
const ALLOWED = [
  'app/[locale]/swipe/deck/page.tsx',
  'app/[locale]/swipe/matches/page.tsx',
  'app/[locale]/swipe/page.tsx',
  'app/[locale]/videochat/page.tsx',
  'components/videochat/VideochatRoom.tsx',
];

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx') ? [path] : [];
  });
}

describe('ad placement', () => {
  it('places ad zones only on landing and feed pages, never on settings or profile pages', () => {
    const placing = sources(SRC)
      .filter((file) => /<AdZone\b/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file).split('\\').join('/'))
      .sort();
    expect(placing).toEqual(ALLOWED);
  });
});
