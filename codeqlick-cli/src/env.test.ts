import assert from 'node:assert/strict';
import { test } from 'node:test';
import { envBranch, envTargets } from './cli.ts';

test('env add is for both targets unless a flag says otherwise', () => {
  assert.deepEqual(envTargets({}), { production: true, preview: true });
  assert.deepEqual(envTargets({ production: true }), { production: true, preview: false });
  assert.deepEqual(envTargets({ preview: true }), { production: false, preview: true });
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
