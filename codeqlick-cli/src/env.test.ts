import assert from 'node:assert/strict';
import { test } from 'node:test';
import { envTargets, importErrorLines } from './cli.ts';

test('variables apply to both targets unless one is chosen', () => {
  assert.deepEqual(envTargets({}), { production: true, preview: true });
  assert.deepEqual(envTargets({ production: true }), { production: true, preview: false });
  assert.deepEqual(envTargets({ preview: true }), { production: false, preview: true });
  assert.deepEqual(envTargets({ production: true, preview: true }), {
    production: true,
    preview: true,
  });
});

test("a refused import's errors show their line and name", () => {
  assert.deepEqual(
    importErrorLines([
      { path: 'content', line: 2, message: 'Expected KEY=value' },
      { path: 'content', line: 4, key: 'API_KEY', message: 'Already on line 1' },
      { path: 'content', message: 'At most 256 KB' },
    ]),
    ['  line 2: Expected KEY=value', '  line 4: API_KEY: Already on line 1', '  At most 256 KB'],
  );
});
