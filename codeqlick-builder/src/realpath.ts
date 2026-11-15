import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, sep } from 'node:path';

/**
 * The real path of `folder` when it is a folder whose real path is inside the real path of `base`
 * (or `base` itself), else null: missing, not a folder, or reached through a link that leaves
 * `base`. Builds run other people's code, which can turn the output folder into a link to a host
 * folder (architecture 8.4).
 */
export async function realFolderInside(base: string, folder: string): Promise<string | null> {
  try {
    const [realBase, realFolder] = await Promise.all([realpath(base), realpath(folder)]);
    const rel = relative(realBase, realFolder);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
    return (await stat(realFolder)).isDirectory() ? realFolder : null;
  } catch {
    return null;
  }
}
