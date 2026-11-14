import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lockNote, unlockMessage } from './cli.ts';

const tail =
  'locked: builds from Git deploy as previews until you publish with `codeqlick deploy --prod`, promote a newer deployment, or run `codeqlick unlock`.';
const unlocked = { productionLock: null };
const locked = {
  productionLock: { at: '2026-11-14T10:00:00.000Z', by: { id: 'u1', name: 'Ana' } },
};

test('rollback and promote say whether production is now or still locked', () => {
  assert.equal(lockNote(unlocked, unlocked), null);
  assert.equal(lockNote(locked, unlocked), null);
  assert.equal(lockNote(unlocked, locked), `Production is now ${tail}`);
  assert.equal(lockNote(locked, locked), `Production is still ${tail}`);
  assert.equal(
    lockNote(unlocked, { productionLock: { at: '2026-11-14T10:00:00.000Z', by: null } }),
    `Production is now ${tail}`,
  );
});

test('unlock says whether there was a lock', () => {
  assert.equal(unlockMessage(true), 'Production unlocked: the next production build goes live.');
  assert.equal(unlockMessage(false), "Production wasn't locked.");
});
