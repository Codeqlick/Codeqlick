import { describe, expect, it } from 'vitest';
import { isValidUsername, normalizeUsername, usernameReason } from './username';

describe('usernames', () => {
  it('accepts letters of either case, digits, dots and underscores', () => {
    for (const name of ['Ana', 'ana', 'ANA', 'Ana.M_1', 'a1B', 'x'.repeat(20)]) {
      expect(isValidUsername(name)).toBe(true);
    }
  });

  it('refuses the wrong length, odd characters, edges other than a letter or digit, and ..', () => {
    for (const name of ['ab', 'x'.repeat(21), 'ana-m', 'Ána', 'ana m', '.Ana', 'Ana_', 'An..a']) {
      expect(isValidUsername(name)).toBe(false);
    }
  });

  it('keeps the capitals and drops a leading @ and the spaces around', () => {
    expect(normalizeUsername('  @Ana.M ')).toBe('Ana.M');
  });

  it('reads why the API refused a username', () => {
    expect(usernameReason('taken')).toBe('taken');
    expect(usernameReason('reserved')).toBe('reserved');
    expect(usernameReason('Required')).toBeNull();
    expect(usernameReason(undefined)).toBeNull();
  });
});
