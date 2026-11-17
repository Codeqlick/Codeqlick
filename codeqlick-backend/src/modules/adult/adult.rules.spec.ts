import { describe, expect, it } from 'vitest';
import {
  banExpiry,
  blockRef,
  emailHash,
  endsLater,
  isActiveSuspension,
  isSeriousCategory,
  mostSerious,
  nameStillHeld,
  normalizeEmail,
  PERMANENT_BAN_MS,
  SUSPENSION_CATEGORIES,
  useVerificationTry,
} from './adult.rules.js';

const NOW = new Date('2026-11-17T12:00:00Z');
const HOUR = 60 * 60 * 1000;

describe('which suspensions are shared (decision 114)', () => {
  it('shares MINOR, NON_CONSENSUAL and ILLEGAL only', () => {
    const shared = SUSPENSION_CATEGORIES.filter((category) => isSeriousCategory(category));
    expect(shared).toEqual(['MINOR', 'NON_CONSENSUAL', 'ILLEGAL']);
    for (const other of ['HARASSMENT', 'HATE', 'SPAM', 'STOLEN', 'DANGER', 'WRONG_INFO', 'OTHER']) {
      expect(isSeriousCategory(other)).toBe(false);
    }
    expect(isSeriousCategory(null)).toBe(false);
    expect(isSeriousCategory(undefined)).toBe(false);
  });

  it('picks the most serious of several reasons, MINOR first', () => {
    expect(mostSerious(['SPAM', 'ILLEGAL', 'NON_CONSENSUAL'])).toBe('NON_CONSENSUAL');
    expect(mostSerious(['ILLEGAL', 'MINOR'])).toBe('MINOR');
    expect(mostSerious(['SPAM', 'HATE'])).toBeNull();
  });
});

describe('the banned email hash (decision 120)', () => {
  it('normalises: trimmed, lower-cased, Gmail without dots and +tags', () => {
    expect(normalizeEmail('  Ana.Lopez+swipe@Gmail.com ')).toBe('analopez@gmail.com');
    expect(normalizeEmail('ana.lopez@googlemail.com')).toBe('analopez@gmail.com');
    // Other providers keep dots and tags: they may be different mailboxes there.
    expect(normalizeEmail('Ana.Lopez+x@Example.org')).toBe('ana.lopez+x@example.org');
    expect(normalizeEmail('no-at-sign')).toBe('no-at-sign');
  });

  it('hashes the normalised email with the key (HMAC-SHA256, hex)', () => {
    const hash = emailHash('k'.repeat(32), 'Ana.Lopez+a@gmail.com');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(emailHash('k'.repeat(32), 'analopez@gmail.com')).toBe(hash);
    expect(emailHash('other-key-'.repeat(4), 'analopez@gmail.com')).not.toBe(hash);
    expect(emailHash('k'.repeat(32), 'someone@gmail.com')).not.toBe(hash);
  });

  it('lasts as long as the suspension, or 2 years when permanent', () => {
    const until = new Date(NOW.getTime() + 7 * 24 * HOUR);
    expect(banExpiry(until, NOW)).toEqual(until);
    expect(banExpiry(null, NOW).getTime() - NOW.getTime()).toBe(PERMANENT_BAN_MS);
    expect(PERMANENT_BAN_MS).toBe(730 * 24 * HOUR);
  });
});

describe('suspensions in force', () => {
  it('is active while not lifted and not over', () => {
    expect(isActiveSuspension({ liftedAt: null, until: null }, NOW)).toBe(true);
    expect(isActiveSuspension({ liftedAt: null, until: new Date(NOW.getTime() + HOUR) }, NOW)).toBe(
      true,
    );
    expect(isActiveSuspension({ liftedAt: null, until: new Date(NOW.getTime() - 1) }, NOW)).toBe(
      false,
    );
    expect(isActiveSuspension({ liftedAt: NOW, until: null }, NOW)).toBe(false);
    expect(isActiveSuspension(null, NOW)).toBe(false);
  });

  it('a shared suspension never shortens a longer per-app one', () => {
    const later = new Date(NOW.getTime() + 2 * HOUR);
    const sooner = new Date(NOW.getTime() + HOUR);
    expect(endsLater(null, sooner)).toBe(true);
    expect(endsLater(later, sooner)).toBe(true);
    expect(endsLater(sooner, later)).toBe(false);
    expect(endsLater(later, null)).toBe(false);
    expect(endsLater(null, null)).toBe(true);
  });
});

describe('blocks and verification', () => {
  it('gives each block an opaque, stable reference', () => {
    const ref = blockRef('a', 'b');
    expect(ref).toMatch(/^[0-9a-f]{24}$/);
    expect(blockRef('a', 'b')).toBe(ref);
    expect(blockRef('b', 'a')).not.toBe(ref);
    expect(ref).not.toContain('a');
  });

  it('allows 5 verification photos a day', () => {
    let state = useVerificationTry(0, null, NOW);
    expect(state).toEqual({ tries: 1, since: NOW });
    for (let i = 2; i <= 5; i += 1) {
      state = useVerificationTry(state!.tries, state!.since, NOW);
      expect(state?.tries).toBe(i);
    }
    expect(useVerificationTry(5, NOW, new Date(NOW.getTime() + HOUR))).toBeNull();
    expect(useVerificationTry(5, NOW, new Date(NOW.getTime() + 24 * HOUR))).toEqual({
      tries: 1,
      since: new Date(NOW.getTime() + 24 * HOUR),
    });
  });

  it('keeps a verification while the paper shows one of the account names', () => {
    const names = { username: 'ana_l', cruising: 'pier_fan' };
    expect(nameStillHeld('ana_l', names)).toBe(true);
    expect(nameStillHeld('Pier_Fan', names)).toBe(true);
    expect(nameStillHeld('old_name', names)).toBe(false);
    expect(nameStillHeld('ana_l', { username: null, cruising: null })).toBe(false);
    expect(nameStillHeld(null, names)).toBe(true);
  });
});
