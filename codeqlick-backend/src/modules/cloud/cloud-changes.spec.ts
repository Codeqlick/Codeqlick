import { describe, expect, it } from 'vitest';
import {
  changesRoot,
  insideRoot,
  normalizeRoot,
  PUSH_COMMITS_CAP,
  PUSH_FILES_PER_COMMIT_CAP,
  pushChangedFiles,
} from './cloud-changes.js';

describe('insideRoot', () => {
  it('matches the folder and what is under it, not a folder that only starts the same', () => {
    expect(insideRoot('apps/web/src/index.ts', 'apps/web')).toBe(true);
    expect(insideRoot('apps/web', 'apps/web')).toBe(true);
    expect(insideRoot('/apps/web/a', 'apps/web')).toBe(true);
    expect(insideRoot('apps/web-old/a.ts', 'apps/web')).toBe(false);
    expect(insideRoot('apps/a.ts', 'apps/web')).toBe(false);
    expect(insideRoot('README.md', 'apps/web')).toBe(false);
  });
});

describe('normalizeRoot', () => {
  it('writes the folder as GitHub writes paths', () => {
    expect(normalizeRoot('./apps/web/')).toBe('apps/web');
    expect(normalizeRoot('/apps/web')).toBe('apps/web');
    expect(normalizeRoot('')).toBe('');
  });
});

describe('pushChangedFiles', () => {
  it('joins the added, modified and removed files of every commit', () => {
    expect(
      pushChangedFiles({
        commits: [
          { added: ['a'], modified: ['b'], removed: [] },
          { added: [], modified: [], removed: ['c'] },
        ],
      }),
    ).toEqual(['a', 'b', 'c']);
  });

  it("is null when the delivery can't tell", () => {
    const commit = { added: [], modified: ['a'], removed: [] };
    expect(pushChangedFiles({ created: true, commits: [commit] })).toBeNull();
    expect(pushChangedFiles({ forced: true, commits: [commit] })).toBeNull();
    expect(pushChangedFiles({ commits: [] })).toBeNull();
    expect(pushChangedFiles({})).toBeNull();
    expect(pushChangedFiles({ commits: [{ added: [] }] })).toBeNull();
    // An empty commit, pushed to force a build.
    expect(pushChangedFiles({ commits: [{ added: [], modified: [], removed: [] }] })).toBeNull();
    // A commit with as many files as GitHub lists: the folder's may be past the cut.
    const many = Array.from({ length: PUSH_FILES_PER_COMMIT_CAP }, (_, i) => `vendor/${i}.js`);
    expect(pushChangedFiles({ commits: [{ added: many, modified: [], removed: [] }] })).toBeNull();
    expect(
      pushChangedFiles({ commits: Array.from({ length: PUSH_COMMITS_CAP }, () => commit) }),
    ).toBeNull();
  });
});

describe('changesRoot', () => {
  const web = { onlyRootChanges: true, rootDir: 'apps/web' };

  it('builds only when a file is inside the root folder', () => {
    expect(changesRoot(web, ['apps/web/x.ts', 'README.md'])).toBe(true);
    expect(changesRoot(web, ['README.md'])).toBe(false);
    expect(changesRoot(web, [])).toBe(false);
  });

  it('always builds when off, without a root folder, or without a trustworthy list', () => {
    expect(changesRoot({ ...web, onlyRootChanges: false }, ['README.md'])).toBe(true);
    expect(changesRoot({ ...web, rootDir: '' }, ['README.md'])).toBe(true);
    expect(changesRoot({ ...web, rootDir: './' }, ['README.md'])).toBe(true);
    expect(changesRoot(web, null)).toBe(true);
  });
});
