import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('proxy: single sign-on through the account host (decision 108)', () => {
  it('starts the flow from a client host’s sign-in page, with a host-only cookie', async () => {
    const response = await visit('cruising.codeqlick.com', '/fr/login?next=/fr/me');
    const location = new URL(response.headers.get('location')!);
    expect(location.origin).toBe('http://account.codeqlick.com');
    expect(location.pathname).toBe('/fr/authorize');
    expect(location.searchParams.get('client')).toBe('cruising');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^cq_sso_[A-Za-z0-9_-]{16}=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it('answers a Link’s prefetch of the sign-in page with nothing, so it never loops', async () => {
    const response = await proxy(
      new NextRequest('http://videochat.codeqlick.com/en/login?next=%2Fen%2Froom', {
        headers: { host: 'videochat.codeqlick.com', rsc: '1', 'next-router-prefetch': '1' },
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('sends the pages reached from emails to the account host, query kept', async () => {
    const response = await visit('codeqlick.com', '/es/reset-password?token=abc');
    expect(response.headers.get('location')).toBe(
      'http://account.codeqlick.com/es/reset-password?token=abc',
    );
  });

  it('serves the account pages at short addresses on the account host, in six languages', async () => {
    const response = await visit('account.codeqlick.com', '/de/privacy');
    // Signed out: the account's own sign-in page, coming back here.
    expect(response.headers.get('location')).toBe(
      'http://account.codeqlick.com/de/login?next=%2Fde%2Faccount%2Fprivacy',
    );
    const login = await visit('account.codeqlick.com', '/pt/login');
    expect(login.headers.get('location')).toBeNull();
  });
});

describe('proxy: Content Security Policy (architecture 6.4)', () => {
  afterEach(() => vi.unstubAllEnvs());

  function page(host: string, path: string, headers: Record<string, string> = {}) {
    return proxy(
      new NextRequest(`http://${host}${path}`, {
        headers: { host, 'x-forwarded-proto': 'https', 'sec-fetch-dest': 'document', ...headers },
      }),
    );
  }

  /** The request headers the render will see (the override list the proxy answered). */
  function forwarded(response: Response): Record<string, string> {
    const names = response.headers.get('x-middleware-override-headers')?.split(',') ?? [];
    return Object.fromEntries(
      names.map((name) => [name, response.headers.get(`x-middleware-request-${name}`) ?? '']),
    );
  }

  it('sends nothing outside production', async () => {
    const response = await page('codeqlick.com', '/en/about');
    expect(response.headers.get('content-security-policy')).toBeNull();
  });

  it('reports the strict policy and hands its nonce to the render', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const response = await page('codeqlick.com', '/en/about', { 'x-nonce': 'forged' });
    const strict = response.headers.get('content-security-policy-report-only')!;
    const nonce = /'nonce-([^']+)'/.exec(strict)?.[1];
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(response.headers.get('content-security-policy')).toContain("'unsafe-inline'");
    expect(response.headers.get('reporting-endpoints')).toBe(
      'csp="https://codeqlick.com/api/csp-report"',
    );
    const request = forwarded(response);
    expect(request['x-nonce']).toBe(nonce);
    expect(request['content-security-policy']).toBe(strict);
    // The visitor's own headers still reach the page.
    expect(request.host).toBe('codeqlick.com');
  });

  it('enforces it on an app host when CSP_ENFORCE is on, and keeps the rewrite', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CSP_ENFORCE', 'true');
    const response = await page('meetings.codeqlick.com', '/en/abc-defg-hij');
    expect(response.headers.get('x-middleware-rewrite')).toContain('/en/meetings/abc-defg-hij');
    const policy = response.headers.get('content-security-policy')!;
    expect(policy).toContain("'strict-dynamic'");
    expect(policy).not.toContain("'unsafe-inline' https://challenges");
    expect(policy).toContain('https://meetings.codeqlick.com');
    expect(response.headers.get('content-security-policy-report-only')).toBeNull();
    expect(forwarded(response)['x-nonce']).toBe(/'nonce-([^']+)'/.exec(policy)?.[1]);
  });

  it('covers the account host: its nonce, and forms that go on to every client host', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CSP_ENFORCE', 'true');
    const response = await page('account.codeqlick.com', '/fr/login');
    const policy = response.headers.get('content-security-policy')!;
    expect(forwarded(response)['x-nonce']).toBe(/'nonce-([^']+)'/.exec(policy)?.[1]);
    const formAction = /form-action ([^;]+)/.exec(policy)?.[1] ?? '';
    for (const origin of [
      'https://codeqlick.com',
      'https://account.codeqlick.com',
      'https://cruising.codeqlick.com',
    ]) {
      expect(formAction).toContain(origin);
    }
    // No remote images on the account host (no Markdown, no ads there).
    expect(/img-src ([^;]+)/.exec(policy)?.[1]).not.toContain('https:');
  });

  it('makes a new nonce for every response', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const nonces = await Promise.all(
      [1, 2].map(async () => forwarded(await page('codeqlick.com', '/en'))['x-nonce']),
    );
    expect(nonces[0]).not.toBe(nonces[1]);
  });
});
