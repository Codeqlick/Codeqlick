import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from './manifest';

describe('the web app manifest', () => {
  it('describes the website, with icons that exist in public/', () => {
    const result = manifest();
    expect(result).toMatchObject({ display: 'standalone', theme_color: '#d9177e' });
    const icons = result.icons ?? [];
    expect(icons).toHaveLength(4);
    for (const icon of icons) {
      expect(existsSync(join(process.cwd(), 'public', icon.src))).toBe(true);
    }
  });
});
