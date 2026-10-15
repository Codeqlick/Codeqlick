import { describe, expect, it } from 'vitest';
import { estimatedValue } from './lead-value';

describe('estimatedValue', () => {
  it('weighs each budget range, and nothing for unknown or missing ones', () => {
    expect(estimatedValue('5k-15k')).toBe(10_000);
    expect(estimatedValue('gt-40k')).toBe(40_000);
    expect(estimatedValue('not-sure')).toBe(0);
    expect(estimatedValue(null)).toBe(0);
    expect(estimatedValue('toString')).toBe(0);
  });
});
