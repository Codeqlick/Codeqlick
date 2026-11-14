import { describe, expect, it } from 'vitest';
import { RateWindow, hookPrefix, isHookToken, newHookToken } from './cloud-deploy-hooks.js';

describe('deploy hook tokens', () => {
  it('are cqd_ plus 32 random bytes in base64url, never repeated', () => {
    const token = newHookToken();
    expect(token).toMatch(/^cqd_[A-Za-z0-9_-]{43}$/);
    expect(isHookToken(token)).toBe(true);
    expect(newHookToken()).not.toBe(token);
  });

  it('keep their first 12 characters as the prefix', () => {
    const token = newHookToken();
    expect(hookPrefix(token)).toHaveLength(12);
    expect(hookPrefix(token)).toBe(token.slice(0, 12));
    expect(hookPrefix(token).startsWith('cqd_')).toBe(true);
  });

  it('are recognised by shape, so anything else is unknown without a lookup', () => {
    expect(isHookToken('cqd_short')).toBe(false);
    expect(isHookToken(`cqk_${'a'.repeat(43)}`)).toBe(false);
    expect(isHookToken(`cqd_${'a'.repeat(44)}`)).toBe(false);
    expect(isHookToken(`cqd_${'a'.repeat(42)}/`)).toBe(false);
    expect(isHookToken('')).toBe(false);
  });
});

describe('RateWindow', () => {
  it('lets a key take its limit within the window and refuses the next', () => {
    const window = new RateWindow(3, 60_000);
    expect([1, 2, 3, 4].map((n) => window.take('hook', 1000 + n))).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it('counts each key on its own', () => {
    const window = new RateWindow(1, 60_000);
    expect(window.take('a', 0)).toBe(true);
    expect(window.take('b', 0)).toBe(true);
    expect(window.take('a', 1)).toBe(false);
  });

  it('forgets calls older than the window, and does not count refused ones', () => {
    const window = new RateWindow(2, 60_000);
    expect(window.take('a', 0)).toBe(true);
    expect(window.take('a', 30_000)).toBe(true);
    expect(window.take('a', 59_999)).toBe(false);
    expect(window.take('a', 60_001)).toBe(true); // the first call left the window
    expect(window.take('a', 60_002)).toBe(false);
    expect(window.take('a', 90_001)).toBe(true); // the second one left too
  });
});
