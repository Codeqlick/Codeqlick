/**
 * Which pushes and pull requests change a project's root folder (architecture 4.13 "Only when the
 * root folder changes"). Pure: the webhook hands it GitHub's payloads.
 */

/** GitHub's cap on the commits of a push delivery: at it, the list may be cut. */
export const PUSH_COMMITS_CAP = 2048;
/** GitHub's cap on the files of a comparison: at it, the list may be cut. */
export const COMPARE_FILES_CAP = 300;

/** Whether a repository path is the folder or inside it. `root` has no leading or trailing `/`. */
export function insideRoot(path: string, root: string): boolean {
  const clean = path.replace(/^\/+/, '');
  return clean === root || clean.startsWith(`${root}/`);
}

/** `rootDir` as the paths in GitHub's payloads write it: no `./`, no leading or trailing `/`. */
export function normalizeRoot(rootDir: string): string {
  return rootDir
    .replace(/^(\.\/)+/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

/**
 * The files a push changed, or null when the delivery can't tell for sure (a new branch, a forced
 * push, no commits, or as many commits as GitHub sends at most).
 */
export function pushChangedFiles(payload: Record<string, unknown>): string[] | null {
  if (payload.created === true || payload.forced === true) return null;
  const commits = payload.commits;
  if (!Array.isArray(commits) || commits.length === 0 || commits.length >= PUSH_COMMITS_CAP) {
    return null;
  }
  const files: string[] = [];
  for (const commit of commits as Array<Record<string, unknown>>) {
    for (const key of ['added', 'modified', 'removed'] as const) {
      const list = commit?.[key];
      if (!Array.isArray(list)) return null;
      for (const file of list) if (typeof file === 'string') files.push(file);
    }
  }
  return files;
}

/**
 * Whether a project should build for these changed files: always when the setting is off, the
 * root folder is the repository's, or the files are unknown (`null`).
 */
export function changesRoot(
  project: { onlyRootChanges: boolean; rootDir: string },
  files: string[] | null,
): boolean {
  const root = normalizeRoot(project.rootDir);
  if (!project.onlyRootChanges || root === '' || root === '.' || files === null) return true;
  return files.some((file) => insideRoot(file, root));
}
