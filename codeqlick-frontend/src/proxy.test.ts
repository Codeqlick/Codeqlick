import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import proxy from './proxy';

/** A browser's navigation to `path` on `host`, with its own Accept-Language. */
function visit(host: string, path: string, language = 'en') {
  return proxy(
    new NextRequest(`http://${host}${path}`, {
      headers: { host, 'accept-language': language, 'sec-fetch-dest': 'document' },
    }),
  );
}

describe('proxy: languages per host (decision 103)', () => {
  it('redirects Cruising-only languages to English on the website (308)', async () => {
    const response = await visit('codeqlick.com', '/fr/about?x=1');
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('http://codeqlick.com/en/about?x=1');
    const admin = await visit('codeqlick.com', '/de/admin');
    expect(admin.status).toBe(308);
    expect(admin.headers.get('location')).toBe('http://codeqlick.com/en/admin');
  });

  it('does the same on the other apps’ hosts', async () => {
    const response = await visit('videochat.codeqlick.com', '/it/rules');
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('http://videochat.codeqlick.com/en/rules');
  });

  it("serves Cruising's pages in its six languages", async () => {
    const response = await visit('cruising.codeqlick.com', '/pt/rules');
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-rewrite')).toContain('/pt/cruising/rules');
  });

  it("sends the website's Cruising links to Cruising's host in their language", async () => {
    const response = await visit('codeqlick.com', '/de/cruising/map');
    expect(response.headers.get('location')).toBe('http://cruising.codeqlick.com/de/map');
  });

  it('picks the visitor’s language among the host’s own', async () => {
    const cruising = await visit('cruising.codeqlick.com', '/', 'fr-FR,fr;q=0.9');
    expect(cruising.headers.get('location')).toMatch(/\/fr$/);
    // The website doesn't speak French: English.
    const site = await visit('codeqlick.com', '/', 'fr-FR,fr;q=0.9');
    expect(site.headers.get('location')).toMatch(/\/en$/);
    const spanish = await visit('codeqlick.com', '/', 'es-ES,es;q=0.9');
    expect(spanish.headers.get('location')).toMatch(/\/es$/);
  });
});
