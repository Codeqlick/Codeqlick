import { describe, expect, it } from 'vitest';
import { buildLiveIndex, internalLinkExists, internalTarget } from './internal-links.js';

const site = 'https://codeqlick.com';
const target = (path: string, locale: 'EN' | 'ES' = 'EN') =>
  internalTarget(new URL(path, site), locale);

describe('internalTarget', () => {
  it('reads posts and case studies, with or without a locale', () => {
    expect(target('/es/blog/hola')).toEqual({ kind: 'post', slug: 'hola', locale: 'ES' });
    expect(target('/en/work/acme/')).toEqual({ kind: 'portfolio', slug: 'acme', locale: 'EN' });
    // No locale: the language of the translation the link is in.
    expect(target('/blog/hola', 'ES')).toEqual({ kind: 'post', slug: 'hola', locale: 'ES' });
    expect(target('/work/acme?x=1#top', 'EN')).toEqual({
      kind: 'portfolio',
      slug: 'acme',
      locale: 'EN',
    });
  });

  it('knows the site’s own pages, with or without a locale', () => {
    for (const path of ['/en', '/es/', '/', '/es/contact', '/services/ui-ux-design', '/en/blog']) {
      expect(target(path)).toEqual({ kind: 'page', exists: true });
    }
    expect(target('/en/blog/feed.xml')).toEqual({ kind: 'page', exists: true });
    expect(target('/robots.txt')).toEqual({ kind: 'page', exists: true });
    expect(target('/es/nothing-here')).toEqual({ kind: 'page', exists: false });
    expect(target('/en/blog/a/b')).toEqual({ kind: 'page', exists: false });
    expect(target('/constructor')).toEqual({ kind: 'page', exists: false });
  });

  it('can’t tell dynamic pages and the website’s files: unknown, never broken', () => {
    for (const path of [
      '/es/citas/ana-lopez',
      '/citas/editar/3f2a',
      '/en/cloud/status/acme',
      '/es/meetings/abc-defg-hij',
      '/en/website-check/0b5e6f2a-1c3d-4e5f-8a9b-0c1d2e3f4a5b',
      '/es/basic-website/request/preview/bar-pepe/buy',
      '/en/portal/projects/123',
      '/es/videochat/room',
      '/avatar/abc.webp',
      '/api/stats/x',
      '/demos/restaurant/logo.png',
      '/presets/menu.json',
      '/en/blog/cover.webp',
    ]) {
      expect(target(path)).toEqual({ kind: 'unknown' });
    }
    // Not under a dynamic route: still a missing page.
    expect(target('/en/citasx/ana')).toEqual({ kind: 'page', exists: false });
    expect(target('/en/api/stats')).toEqual({ kind: 'page', exists: false });
  });

  it('reads uploaded images by their generated name only', () => {
    const file = '0b5e6f2a-1c3d-4e5f-8a9b-0c1d2e3f4a5b.webp';
    expect(target(`/media/${file}`)).toEqual({ kind: 'media', filename: file });
    expect(target('/media/../etc/passwd')).toEqual({ kind: 'page', exists: false });
    expect(target('/media/photo.png')).toEqual({ kind: 'page', exists: false });
  });
});

describe('internalLinkExists', () => {
  const index = buildLiveIndex([
    { type: 'POST', slug: 'hello', locales: ['EN', 'ES'] },
    { type: 'POST', slug: 'only-english', locales: ['EN'] },
    { type: 'PORTFOLIO', slug: 'acme', locales: ['ES'] },
  ]);
  const noMedia = async () => false;
  const exists = (path: string, locale: 'EN' | 'ES' = 'EN') =>
    internalLinkExists(`${site}${path}`, locale, index, noMedia);

  it('needs a live post or case study; another language is fine (the site falls back)', async () => {
    expect(await exists('/en/blog/hello')).toBe(true);
    expect(await exists('/es/blog/hello')).toBe(true);
    expect(await exists('/en/blog/only-english')).toBe(true);
    expect(await exists('/es/blog/only-english')).toBe(true);
    expect(await exists('/blog/only-english', 'ES')).toBe(true);
    expect(await exists('/es/work/acme')).toBe(true);
    expect(await exists('/en/work/acme')).toBe(true);
    // Not live (a draft, scheduled or deleted) or never there.
    expect(await exists('/en/blog/draft')).toBe(false);
    expect(await exists('/en/work/hello')).toBe(false);
  });

  it('accepts the site’s pages and asks storage about images', async () => {
    expect(await exists('/es/about')).toBe(true);
    expect(await exists('/es/abuot')).toBe(false);
    expect(await exists('/es/citas/ana')).toBeNull();
    expect(await exists('/demos/site/photo.jpg')).toBeNull();
    const file = '0b5e6f2a-1c3d-4e5f-8a9b-0c1d2e3f4a5b.png';
    const stored = async (name: string) => name === file;
    expect(await internalLinkExists(`${site}/media/${file}`, 'EN', index, stored)).toBe(true);
    expect(
      await internalLinkExists(
        `${site}/media/1b5e6f2a-1c3d-4e5f-8a9b-0c1d2e3f4a5b.png`,
        'EN',
        index,
        stored,
      ),
    ).toBe(false);
  });
});
