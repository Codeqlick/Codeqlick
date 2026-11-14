import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { contentPath, lookUpSlug } from './slug-redirect';

const notFound = () => Promise.reject(new ApiError(404, { title: 'Not Found' }));

describe('lookUpSlug', () => {
  it('returns the item without asking for a redirect when the slug is current', async () => {
    const findRedirect = vi.fn();
    const result = await lookUpSlug('new', (slug) => Promise.resolve({ slug }), findRedirect);
    expect(result).toEqual({ status: 'found', item: { slug: 'new' } });
    expect(findRedirect).not.toHaveBeenCalled();
  });

  it('follows an old slug to the current one', async () => {
    const findRedirect = vi.fn(() => Promise.resolve({ slug: 'new' }));
    const result = await lookUpSlug('old', notFound, findRedirect);
    expect(result).toEqual({ status: 'moved', slug: 'new' });
    expect(findRedirect).toHaveBeenCalledWith('old');
  });

  it('is missing when neither the item nor a redirect exists', async () => {
    await expect(lookUpSlug('gone', notFound, notFound)).resolves.toEqual({ status: 'missing' });
  });

  it('never redirects a slug to itself', async () => {
    const result = await lookUpSlug('same', notFound, () => Promise.resolve({ slug: 'same' }));
    expect(result).toEqual({ status: 'missing' });
  });

  it('rethrows errors other than 404', async () => {
    const down = new ApiError(503, { title: 'API unreachable' });
    await expect(lookUpSlug('x', () => Promise.reject(down), notFound)).rejects.toBe(down);
    await expect(lookUpSlug('x', notFound, () => Promise.reject(down))).rejects.toBe(down);
  });
});

describe('contentPath', () => {
  it('builds the localized public path of a post or case study', () => {
    expect(contentPath('es', 'blog', 'client-portal')).toBe('/es/blog/client-portal');
    expect(contentPath('en', 'work', 'logistics-dashboard')).toBe('/en/work/logistics-dashboard');
  });

  it('encodes characters that are not safe in a path segment', () => {
    expect(contentPath('en', 'blog', 'a/b?c')).toBe('/en/blog/a%2Fb%3Fc');
  });
});
