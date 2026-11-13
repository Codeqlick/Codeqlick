import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseValue } from './cli.ts';

test('a kv value is JSON when it parses, else the text itself', () => {
  assert.deepEqual(parseValue('{"dark":true}'), { dark: true });
  assert.equal(parseValue('42'), 42);
  assert.equal(parseValue('"quoted"'), 'quoted');
  assert.equal(parseValue('hello world'), 'hello world');
  assert.equal(parseValue('true'), true);
});
