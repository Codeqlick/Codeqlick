import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, normalizeCode } from './meetings.schemas.js';
import { randomCode } from './meetings.service.js';

describe('meeting room codes', () => {
  it('are made of the unambiguous letters, as abc-defg-hij', () => {
    for (let index = 0; index < 50; index += 1) {
      const code = randomCode();
      expect(code).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
      for (const letter of code.replaceAll('-', '')) expect(CODE_ALPHABET).toContain(letter);
    }
  });

  it('are read forgivingly', () => {
    expect(normalizeCode('ABC-defg-hjk')).toBe('abc-defg-hjk');
    expect(normalizeCode(' abcdefghjk ')).toBe('abc-defg-hjk');
    expect(normalizeCode('abc defg hjk')).toBe('abc-defg-hjk');
    expect(normalizeCode('abc-defg')).toBeNull();
    expect(normalizeCode('abc-defg-hjkm')).toBeNull();
  });
});
