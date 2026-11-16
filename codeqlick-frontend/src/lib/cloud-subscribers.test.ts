import { describe, expect, it } from 'vitest';
import { subscriberFilter, subscriberPage, subscribersHref } from './cloud-subscribers';

describe('status page subscribers in the console', () => {
  it('reads only known status filters', () => {
    expect(subscriberFilter('ACTIVE')).toBe('ACTIVE');
    expect(subscriberFilter(['PENDING', 'ACTIVE'])).toBe('PENDING');
    expect(subscriberFilter('active')).toBeUndefined();
    expect(subscriberFilter(undefined)).toBeUndefined();
  });

  it('reads a page from 1', () => {
    expect(subscriberPage('3')).toBe(3);
    expect(subscriberPage('0')).toBe(1);
    expect(subscriberPage('1.5')).toBe(1);
    expect(subscriberPage('x')).toBe(1);
    expect(subscriberPage(undefined)).toBe(1);
  });

  it('links with its own params, leaving defaults out', () => {
    const base = '/cloud/console/acme/status-page';
    expect(subscribersHref(base, undefined, 1)).toBe(`${base}#subscribers-title`);
    expect(subscribersHref(base, 'UNSUBSCRIBED', 2)).toBe(
      `${base}?subscribers=UNSUBSCRIBED&subscribersPage=2#subscribers-title`,
    );
  });
});
