import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSubject, findHook } from './cli.ts';

test('a hook is found by id first, then by name', () => {
  const list = [
    { id: 'a1', name: 'cms' },
    { id: 'b2', name: 'a1' },
  ];
  assert.equal(findHook(list, 'a1')?.id, 'a1');
  assert.equal(findHook(list, 'cms')?.id, 'a1');
  assert.equal(findHook(list, 'nope'), undefined);
  assert.equal(findHook(list, 'constructor'), undefined);
});

test('a build is shown by pull request, branch, or branch with its hook', () => {
  const base = { pullRequest: null, branch: 'main', trigger: 'push' as const, hookName: null };
  assert.equal(buildSubject(base), 'main');
  assert.equal(buildSubject({ ...base, pullRequest: 7 }), '#7');
  assert.equal(
    buildSubject({ ...base, trigger: 'hook', hookName: 'strapi' }),
    'main (hook strapi)',
  );
});
