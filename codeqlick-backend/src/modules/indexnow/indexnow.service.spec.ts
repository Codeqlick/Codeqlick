import { Logger, NotFoundException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { IndexNowRepository } from './indexnow.repository.js';
import {
  INDEXNOW_ENDPOINT,
  IndexNowService,
  indexNowKey,
  slugsToAnnounce,
} from './indexnow.service.js';

const secret = 'test-secret-test-secret-test-secret-test-secret';
const now = new Date('2026-11-14T12:00:00Z');
const MINUTE = 60_000;

function service(enabled = true, wentLive = vi.fn()) {
  const config = {
    indexNowEnabled: enabled,
    jwtAccessSecret: secret,
    siteUrl: 'https://codeqlick.com',
    nodeEnv: 'production',
  } as AppConfigService;
  return new IndexNowService(config, { wentLive } as unknown as IndexNowRepository);
}

function accepted(status = 202) {
  return vi.fn().mockResolvedValue(new Response(null, { status }));
}

function body(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
  const [url, init] = fetchMock.mock.calls[call] as [string, RequestInit];
  return { url, init, payload: JSON.parse(init.body as string) as Record<string, unknown> };
}

describe('IndexNowService', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('derives a stable key of 32 hex characters from the secret', () => {
    const key = indexNowKey(secret);
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    expect(indexNowKey(secret)).toBe(key);
    expect(indexNowKey(`${secret}-other`)).not.toBe(key);
    expect(service().publicKey()).toEqual({ key });
  });

  it('hides the key and sends nothing while off', async () => {
    const fetchMock = accepted();
    vi.stubGlobal('fetch', fetchMock);
    const off = service(false);
    expect(() => off.publicKey()).toThrow(NotFoundException);
    off.announce({ kind: 'post', slugs: ['hello'] });
    await off.submit([{ kind: 'post', slugs: ['hello'] }], now);
    await off.runDue(now);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('submits a post in both languages with the blog pages', async () => {
    const fetchMock = accepted();
    vi.stubGlobal('fetch', fetchMock);
    const indexNow = service();
    await indexNow.submit([{ kind: 'post', slugs: ['hello'] }], now);

    const { url, init, payload } = body(fetchMock);
    expect(url).toBe(INDEXNOW_ENDPOINT);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json; charset=utf-8' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(payload).toEqual({
      host: 'codeqlick.com',
      key: indexNowKey(secret),
      keyLocation: 'https://codeqlick.com/indexnow-key.txt',
      urlList: [
        'https://codeqlick.com/en/blog/hello',
        'https://codeqlick.com/es/blog/hello',
        'https://codeqlick.com/en/blog',
        'https://codeqlick.com/es/blog',
      ],
    });
  });

  it('submits a case study under /work, with the old slug after a change', () => {
    expect(service().urlsFor([{ kind: 'portfolio', slugs: ['acme-store', 'acme-shop'] }])).toEqual([
      'https://codeqlick.com/en/work/acme-store',
      'https://codeqlick.com/es/work/acme-store',
      'https://codeqlick.com/en/work/acme-shop',
      'https://codeqlick.com/es/work/acme-shop',
      'https://codeqlick.com/en/work',
      'https://codeqlick.com/es/work',
    ]);
  });

  it('leaves out addresses sent in the last 10 minutes', async () => {
    const fetchMock = accepted(200);
    vi.stubGlobal('fetch', fetchMock);
    const indexNow = service();
    await indexNow.submit([{ kind: 'post', slugs: ['hello'] }], now);
    // Same post again: nothing left to send.
    await indexNow.submit([{ kind: 'post', slugs: ['hello'] }], new Date(now.getTime() + MINUTE));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Another post: only its own addresses, the blog pages were just sent.
    await indexNow.submit([{ kind: 'post', slugs: ['other'] }], new Date(now.getTime() + MINUTE));
    expect(body(fetchMock, 1).payload.urlList).toEqual([
      'https://codeqlick.com/en/blog/other',
      'https://codeqlick.com/es/blog/other',
    ]);

    // Ten minutes later the first one goes again.
    await indexNow.submit(
      [{ kind: 'post', slugs: ['hello'] }],
      new Date(now.getTime() + 10 * MINUTE),
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(body(fetchMock, 2).payload.urlList).toEqual([
      'https://codeqlick.com/en/blog/hello',
      'https://codeqlick.com/es/blog/hello',
      'https://codeqlick.com/en/blog',
      'https://codeqlick.com/es/blog',
    ]);
  });

  it('swallows and logs a failure or a refusal', async () => {
    const warn = vi.mocked(Logger.prototype.warn);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    const indexNow = service();
    await expect(
      indexNow.submit([{ kind: 'post', slugs: ['hello'] }], now),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('timeout'));

    vi.stubGlobal('fetch', accepted(403));
    await indexNow.submit([{ kind: 'portfolio', slugs: ['acme'] }], now);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('403'));
  });

  it('announces without waiting or throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    expect(() => service().announce({ kind: 'post', slugs: ['hello'] })).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
    expect(vi.mocked(Logger.prototype.warn)).toHaveBeenCalledWith(expect.stringContaining('down'));
  });

  it('submits what went live in the last 10 minutes', async () => {
    const fetchMock = accepted();
    vi.stubGlobal('fetch', fetchMock);
    const wentLive = vi.fn().mockResolvedValue({ posts: ['scheduled'], portfolio: [] });
    await service(true, wentLive).runDue(now);

    expect(wentLive).toHaveBeenCalledWith(new Date(now.getTime() - 10 * MINUTE), now);
    expect(body(fetchMock).payload.urlList).toEqual([
      'https://codeqlick.com/en/blog/scheduled',
      'https://codeqlick.com/es/blog/scheduled',
      'https://codeqlick.com/en/blog',
      'https://codeqlick.com/es/blog',
    ]);
  });

  it('sends nothing when nothing went live', async () => {
    const fetchMock = accepted();
    vi.stubGlobal('fetch', fetchMock);
    const wentLive = vi.fn().mockResolvedValue({ posts: [], portfolio: [] });
    await service(true, wentLive).runDue(now);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('slugsToAnnounce', () => {
  const live = { slug: 'hello', status: 'PUBLISHED' as const, publishedAt: new Date(0) };
  const draft = { slug: 'hello', status: 'DRAFT' as const, publishedAt: null };
  const later = { ...live, publishedAt: new Date(now.getTime() + MINUTE) };

  it('names the item when it was live before or is live after', () => {
    expect(slugsToAnnounce(null, live, now)).toEqual(['hello']);
    expect(slugsToAnnounce(live, live, now)).toEqual(['hello']);
    expect(slugsToAnnounce(draft, live, now)).toEqual(['hello']);
    expect(slugsToAnnounce(live, draft, now)).toEqual(['hello']);
    expect(slugsToAnnounce(live, null, now)).toEqual(['hello']);
    expect(slugsToAnnounce(live, { ...live, slug: 'hi' }, now)).toEqual(['hi', 'hello']);
  });

  it('names nothing for drafts and scheduled items', () => {
    expect(slugsToAnnounce(null, draft, now)).toEqual([]);
    expect(slugsToAnnounce(draft, draft, now)).toEqual([]);
    expect(slugsToAnnounce(null, later, now)).toEqual([]);
    expect(slugsToAnnounce(draft, null, now)).toEqual([]);
  });
});
