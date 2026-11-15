import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import type { CheckoutFiles } from './plan.ts';

/** The largest file the package-manager choice reads (a `package.json`). */
export const MAX_READ_BYTES = 1_000_000;

/**
 * The checkout as the package-manager choice sees it (architecture 4.13 "Package managers"). A
 * file counts only when its folder, symlinks resolved, is inside the checkout, so a symlinked root
 * folder or parent can't make the agent probe or read the host; only regular files of at most
 * 1 MB are read (a symlinked `package.json` is not).
 */
export function checkoutFiles(src: string): CheckoutFiles {
  let base: string | null;
  try {
    base = realpathSync(src);
  } catch {
    base = null;
  }
  const entry = (path: string) => {
    if (base === null) return undefined;
    try {
      const folder = realpathSync(dirname(join(base, path)));
      const rel = relative(base, folder);
      if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return undefined;
      const file = join(folder, basename(path));
      const info = lstatSync(file, { throwIfNoEntry: false });
      return info ? { file, info } : undefined;
    } catch {
      return undefined;
    }
  };
  return {
    exists: (path) => entry(path) !== undefined,
    readText: (path) => {
      const found = entry(path);
      if (!found?.info.isFile() || found.info.size > MAX_READ_BYTES) return null;
      try {
        return readFileSync(found.file, 'utf8');
      } catch {
        return null;
      }
    },
  };
}
