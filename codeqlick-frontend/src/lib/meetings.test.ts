import { describe, expect, it } from 'vitest';
import { normalizeMeetingCode } from './meetings';

describe('meeting codes', () => {
  it('reads codes forgivingly', () => {
    expect(normalizeMeetingCode('ABC-defg-hjk')).toBe('abc-defg-hjk');
    expect(normalizeMeetingCode('abcdefghjk')).toBe('abc-defg-hjk');
    expect(normalizeMeetingCode('abc-defg')).toBeNull();
  });
});
