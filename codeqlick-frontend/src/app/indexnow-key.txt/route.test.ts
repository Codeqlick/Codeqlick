import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

// Next.js-only modules apiFetch imports (vi.mock is hoisted above the imports).
vi.mock('next/headers', () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('next-intl/server', () => ({ getLocale: vi.fn() }));

const KEY = '0123456789abcdef0123456789abcdef';
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('GET /indexnow-key.txt', () => {
  it('answers the key as plain text, cached an hour', async () => {
    fetchMock.mockResolvedValue(json({ key: KEY }));
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(`${KEY}\n`);
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/indexnow\/key$/);
    expect(init?.next).toEqual({ revalidate: 3600 });
  });

  it('answers 404 while the API has IndexNow off', async () => {
    fetchMock.mockResolvedValue(json({ status: 404, title: 'Not Found' }, 404));
    const response = await GET();
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).not.toContain(KEY);
  });

  it('answers 404 when the API cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const response = await GET();
    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
  });

  it('answers 404 when the API sends something that is not a key', async () => {
    fetchMock.mockResolvedValue(json({ key: 'no spaces/allowed' }));
    expect((await GET()).status).toBe(404);
  });
});
