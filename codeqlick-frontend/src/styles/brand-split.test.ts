import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Decision 125: Codeqlick's pages must not carry the word "neoqlick". Next.js links every
 * stylesheet a layout's module graph imports on all the pages under it, so Neoqlick's theme lives
 * in public/ and only Neoqlick's hosts link it (`NeoqlickThemeLink`).
 */
const root = process.cwd();
const styles = join(root, 'src/styles');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const IMPORTS_THEME = /(?:import|@import)[^;\n]*neoqlick(?:\/theme)?\.css/i;

describe('brand CSS split', () => {
  it('keeps Codeqlick’s global stylesheets free of Neoqlick', () => {
    for (const file of ['globals.css', 'tokens.css']) {
      expect(readFileSync(join(styles, file), 'utf8'), file).not.toMatch(/neoqlick/i);
    }
  });

  it('never imports Neoqlick’s theme from the bundle', () => {
    const offenders = walk(join(root, 'src'))
      .filter((file) => /\.(css|tsx?)$/.test(file) && !file.endsWith('.test.ts'))
      .filter((file) => IMPORTS_THEME.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('serves the theme and the Montserrat font from public/', () => {
    const css = readFileSync(join(root, 'public/neoqlick/theme.css'), 'utf8');
    expect(css).toContain('--color-brand: #7c3aed');
    expect(css).toContain('/neoqlick/fonts/montserrat-latin-wght.woff2');
    const font = join(root, 'public/neoqlick/fonts/montserrat-latin-wght.woff2');
    expect(statSync(font).size).toBeGreaterThan(1000);
  });

  it('links the theme only for the Neoqlick brand', () => {
    for (const file of ['src/app/[locale]/layout.tsx', 'src/app/not-found.tsx']) {
      expect(readFileSync(join(root, file), 'utf8'), file).toContain(
        "brand === 'neoqlick' ? <NeoqlickThemeLink /> : null",
      );
    }
  });
});
