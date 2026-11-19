import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import proxy, { config } from './proxy';

/** A browser's navigation to `path` on `host`, with its own Accept-Language. */
function visit(host: string, path: string, language = 'en') {
  return proxy(
    new NextRequest(`http://${host}${path}`, {
      headers: { host, 'accept-language': language, 'sec-fetch-dest': 'document' },
    }),
  );
}

describe('proxy: languages', () => {
  it('picks the visitor’s language among English and Spanish', async () => {
    const spanish = await visit('codeqlick.com', '/', 'es-ES,es;q=0.9');
    expect(spanish.headers.get('location')).toMatch(/\/es$/);
    // Anything else: English.
    const french = await visit('codeqlick.com', '/', 'fr-FR,fr;q=0.9');
    expect(french.headers.get('location')).toMatch(/\/en$/);
  });

  it('serves an app host at its short addresses, in the page’s language', async () => {
    const response = await visit('meetings.codeqlick.com', '/es/rooms');
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-rewrite')).toContain('/es/meetings/rooms');
  });
});

describe('proxy: single sign-on through the account host (decision 108)', () => {
  it('starts the flow from a client host’s sign-in page, with a host-only cookie', async () => {
    const response = await visit('meetings.codeqlick.com', '/es/login?next=/es/rooms');
    const location = new URL(response.headers.get('location')!);
    expect(location.origin).toBe('http://account.codeqlick.com');
    expect(location.pathname).toBe('/es/authorize');
    expect(location.searchParams.get('client')).toBe('meetings');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^cq_sso_[A-Za-z0-9_-]{16}=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it('answers a Link’s prefetch of the sign-in page with nothing, so it never loops', async () => {
    const response = await proxy(
      new NextRequest('http://meetings.codeqlick.com/en/login?next=%2Fen%2Froom', {
        headers: { host: 'meetings.codeqlick.com', rsc: '1', 'next-router-prefetch': '1' },
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

  it('serves the account pages at short addresses on the account host', async () => {
    const response = await visit('account.codeqlick.com', '/es/privacy');
    // Signed out: the account's own sign-in page, coming back here.
    expect(response.headers.get('location')).toBe(
      'http://account.codeqlick.com/es/login?next=%2Fes%2Faccount%2Fprivacy',
    );
    const login = await visit('account.codeqlick.com', '/es/login');
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
    const response = await page('account.codeqlick.com', '/en/login');
    const policy = response.headers.get('content-security-policy')!;
    expect(forwarded(response)['x-nonce']).toBe(/'nonce-([^']+)'/.exec(policy)?.[1]);
    const formAction = /form-action ([^;]+)/.exec(policy)?.[1] ?? '';
    for (const origin of [
      'https://codeqlick.com',
      'https://account.codeqlick.com',
      'https://meetings.codeqlick.com',
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

describe('proxy: which paths reach it', () => {
  // Next.js reads the matcher as a path pattern; its negative lookahead is plain regex.
  const matches = (path: string) => {
    const [source] = config.matcher;
    return new RegExp(`^${source}$`).test(path);
  };

  it('skips the API, Next internals, the draft previews and files', () => {
    for (const path of [
      '/api',
      '/api/csp-report',
      '/site-draft/key/x',
      '/_next/static/chunk.js',
      '/_vercel/insights',
      '/favicon.ico',
      '/robots.txt',
    ]) {
      expect(matches(path), path).toBe(false);
    }
  });

  it('lets pages through, slugs that only start like an excluded name too', () => {
    for (const path of [
      '/',
      '/es',
      '/es/blog',
      '/apio-bar',
      '/apiario',
      '/_nextdoor',
      '/site-drafts',
    ]) {
      expect(matches(path), path).toBe(true);
    }
  });

  it('serves the short link of a menu called apio-bar on the menu host', async () => {
    const response = await visit('menu.codeqlick.com', '/apio-bar');
    expect(response.headers.get('x-middleware-rewrite')).toContain('/en/menu/qr/short/apio-bar');
  });
});
