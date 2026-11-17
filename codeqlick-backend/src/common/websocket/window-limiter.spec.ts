import { describe, expect, it } from 'vitest';
import { WindowLimiter } from './window-limiter.js';

describe('WindowLimiter', () => {
  it('allows `limit` events per window', () => {
    const limiter = new WindowLimiter(2, 1_000);
    expect(limiter.take(0)).toBe(true);
    expect(limiter.take(10)).toBe(true);
    expect(limiter.take(20)).toBe(false);
    expect(limiter.take(1_000)).toBe(true);
  });
});
