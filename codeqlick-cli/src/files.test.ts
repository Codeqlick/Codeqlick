import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diffLines, filesLines } from './cli.ts';

test('files prints right-aligned sizes, the path and a total', () => {
  assert.deepEqual(
    filesLines({
      items: [
        { path: '_astro/app.js', size: 2048 },
        { path: 'favicon.svg', size: 300 },
        { path: 'index.html', size: 3 * 1024 * 1024 },
      ],
      count: 3,
      totalBytes: 3 * 1024 * 1024 + 2348,
    }),
    ['2.0 KB  _astro/app.js', ' 300 B  favicon.svg', '3.0 MB  index.html', '3 files, 3.0 MB'],
  );
  assert.deepEqual(filesLines({ items: [{ path: 'a', size: 1 }], count: 1, totalBytes: 1 }), [
    '1 B  a',
    '1 file, 1 B',
  ]);
  assert.deepEqual(filesLines({ items: [], count: 0, totalBytes: 0 }), ['No files.']);
});

test('files says how many the API left out of a long list', () => {
  assert.deepEqual(
    filesLines({
      items: [
        { path: 'a.html', size: 10 },
        { path: 'b.html', size: 20 },
      ],
      count: 12_345,
      totalBytes: 4096,
    }),
    [
      '10 B  a.html',
      '20 B  b.html',
      '… 12,343 more files not listed (first 2 shown)',
      '12,345 files, 4.0 KB',
    ],
  );
});

test('diff groups added, removed and changed files, then counts them', () => {
  assert.deepEqual(
    diffLines({
      deploymentId: 'd1',
      withId: 'd0',
      added: [{ path: 'new.html', size: 10 }],
      removed: [
        { path: 'old.css', size: 5 },
        { path: 'old.html', size: 7 },
      ],
      changed: [{ path: 'index.html', size: 2048, previousSize: 1024 }],
      unchanged: 120,
      totalBytes: 2058,
      withTotalBytes: 1036,
    }),
    [
      '+ new.html',
      '- old.css',
      '- old.html',
      '~ index.html (1.0 KB → 2.0 KB)',
      '1 added, 2 removed, 1 changed, 120 unchanged',
    ],
  );
});

test('an identical comparison prints only the counts', () => {
  assert.deepEqual(
    diffLines({
      deploymentId: 'd1',
      withId: 'd1',
      added: [],
      removed: [],
      changed: [],
      unchanged: 4,
      totalBytes: 40,
      withTotalBytes: 40,
    }),
    ['0 added, 0 removed, 0 changed, 4 unchanged'],
  );
});
