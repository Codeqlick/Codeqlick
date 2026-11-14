import { describe, expect, it } from 'vitest';
import {
  displayLinkUrl,
  isHttpUrl,
  linkResultLabel,
  linkSourceEditHref,
  parseLinkFilter,
} from './links';

describe('broken links helpers', () => {
  it('reads the filter, broken by default', () => {
    expect(parseLinkFilter('all')).toBe('all');
    expect(parseLinkFilter('broken')).toBe('broken');
    expect(parseLinkFilter(undefined)).toBe('broken');
    expect(parseLinkFilter('ALL')).toBe('broken');
  });

  it('labels the result with the HTTP code first, then the network error', () => {
    expect(linkResultLabel({ statusCode: 404, error: null })).toBe('HTTP 404');
    expect(linkResultLabel({ statusCode: 500, error: 'Server error' })).toBe('HTTP 500');
    expect(linkResultLabel({ statusCode: null, error: 'Timed out' })).toBe('Timed out');
    expect(linkResultLabel({ statusCode: null, error: '  ' })).toBeNull();
    expect(linkResultLabel({ statusCode: null, error: null })).toBeNull();
  });

  it('links to the edit page of the post or case study', () => {
    expect(linkSourceEditHref({ type: 'POST', id: 'p1' })).toBe('/admin/posts/p1');
    expect(linkSourceEditHref({ type: 'PORTFOLIO', id: 'c 2' })).toBe('/admin/portfolio/c%202');
  });

  it('shortens URLs for display', () => {
    expect(displayLinkUrl('https://example.com/')).toBe('example.com');
    expect(displayLinkUrl('http://example.com')).toBe('example.com');
    expect(displayLinkUrl('https://example.com/docs/')).toBe('example.com/docs/');
    expect(displayLinkUrl('https://codeqlick.com/es/blog/x?a=1#b')).toBe(
      'codeqlick.com/es/blog/x?a=1#b',
    );
    expect(displayLinkUrl('ftp://example.com/')).toBe('ftp://example.com/');
  });

  it('only treats http(s) addresses as clickable', () => {
    expect(isHttpUrl('https://example.com')).toBe(true);
    expect(isHttpUrl('HTTP://example.com/a')).toBe(true);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('mailto:hello@codeqlick.com')).toBe(false);
    expect(isHttpUrl('/blog/x')).toBe(false);
  });
});
