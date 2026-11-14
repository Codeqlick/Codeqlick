import { describe, expect, it } from 'vitest';
import { slugToRedirect } from './slug-redirects.js';

const publishedAt = new Date('2026-09-01T08:00:00Z');

describe('slugToRedirect', () => {
  it('keeps the old slug of an item with a publication date', () => {
    expect(slugToRedirect({ slug: 'old', publishedAt }, 'new')).toBe('old');
    // Scheduled items have a (future) publication date too.
    const scheduled = new Date(Date.now() + 86_400_000);
    expect(slugToRedirect({ slug: 'old', publishedAt: scheduled }, 'new')).toBe('old');
  });

  it('keeps nothing for a draft that was never published', () => {
    expect(slugToRedirect({ slug: 'old', publishedAt: null }, 'new')).toBeUndefined();
  });

  it('keeps nothing when the slug does not change', () => {
    expect(slugToRedirect({ slug: 'same', publishedAt }, 'same')).toBeUndefined();
    expect(slugToRedirect({ slug: 'same', publishedAt }, undefined)).toBeUndefined();
  });
});
