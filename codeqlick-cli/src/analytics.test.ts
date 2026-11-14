import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changeText } from './cli.ts';

test('the change against the previous period reads as a rounded percentage', () => {
  assert.equal(changeText(112, 100, true), '+12 %');
  assert.equal(changeText(92, 100, true), '-8 %');
  assert.equal(changeText(100, 100, true), '0 %');
  assert.equal(changeText(101, 100, true), '+1 %');
  assert.equal(changeText(1, 3, true), '-67 %');
  assert.equal(changeText(0, 5, true), '-100 %');
});

test('a first period is new, and nothing is said without a comparison', () => {
  assert.equal(changeText(4, 0, true), 'new');
  assert.equal(changeText(0, 0, true), null);
  assert.equal(changeText(112, 100, false), null);
  assert.equal(changeText(4, 0, false), null);
});
