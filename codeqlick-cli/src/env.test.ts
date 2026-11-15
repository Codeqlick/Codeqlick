import assert from 'node:assert/strict';
import { test } from 'node:test';
import { envBranch, envTargets, importErrorLines } from './cli.ts';

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

test('env add --branch is for previews of that branch only', () => {
  assert.deepEqual(envTargets({ branch: ' staging ' }), {
    production: false,
    preview: true,
    branch: 'staging',
  });
  assert.deepEqual(envTargets({ branch: 'feature/login', preview: true }), {
    production: false,
    preview: true,
    branch: 'feature/login',
  });
  assert.throws(() => envTargets({ branch: 'staging', production: true }), /previews only/);
});

test('--branch needs a name without spaces', () => {
  assert.equal(envBranch({}), undefined);
  assert.equal(envBranch({ branch: 'staging' }), 'staging');
  assert.throws(() => envBranch({ branch: '  ' }), /Git branch name/);
  assert.throws(() => envBranch({ branch: 'my branch' }), /Git branch name/);
});
