import { describe, expect, it } from 'vitest';
import { preferencesProblem, unsubscribeView } from './email-preferences';

describe('unsubscribe page', () => {
  it('tells a dead link from a call worth retrying', () => {
    expect(preferencesProblem(404)).toBe('invalidLink');
    expect(preferencesProblem(400)).toBe('invalidLink');
    expect(preferencesProblem(429)).toBe('retry');
    expect(preferencesProblem(500)).toBe('retry');
    expect(preferencesProblem(503)).toBe('retry');
    expect(preferencesProblem(0)).toBe('retry');
  });

  it('says what the link found, or the change just made', () => {
    expect(unsubscribeView({ subscribed: true, changed: false })).toBe('subscribed');
    expect(unsubscribeView({ subscribed: false, changed: false })).toBe('alreadyUnsubscribed');
    expect(unsubscribeView({ subscribed: false, changed: true })).toBe('unsubscribed');
    expect(unsubscribeView({ subscribed: true, changed: true })).toBe('resubscribed');
  });
});
