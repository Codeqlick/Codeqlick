import { describe, expect, it } from 'vitest';
import type { FetchOptions } from '../site-audits/safe-fetch.js';
import {
  checkExternalLink,
  forEachHostSerially,
  LINK_CHECK_USER_AGENT,
  Pacer,
  type Clock,
  type Fetcher,
} from './external-links.js';

/** A fetcher answering from a table, recording each request. */
function fakeFetcher(answers: Record<string, number | Error>) {
  const calls: { url: string; options: FetchOptions }[] = [];
  const fetcher: Fetcher = async (url, options) => {
    calls.push({ url, options });
    const answer = answers[`${options.method} ${url}`] ?? answers[url];
    if (answer instanceof Error) throw answer;
    return { status: answer ?? 200, headers: {} };
  };
  return { fetcher, calls };
}

describe('checkExternalLink', () => {
  it('asks with HEAD, as the link check, within the limits', async () => {
    const { fetcher, calls } = fakeFetcher({ 'https://example.com/a': 200 });
    const outcome = await checkExternalLink('https://example.com/a', undefined, fetcher);
    expect(outcome).toEqual({ result: 'ok', statusCode: 200, error: null });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.options).toMatchObject({
      method: 'HEAD',
      timeoutMs: 10_000,
      maxRedirects: 5,
      userAgent: LINK_CHECK_USER_AGENT,
    });
  });

  it('falls back to GET when HEAD is not allowed or not implemented', async () => {
    for (const refused of [405, 501]) {
      const { fetcher, calls } = fakeFetcher({
        'HEAD https://example.com/b': refused,
        'GET https://example.com/b': 404,
      });
      let paced = 0;
      const outcome = await checkExternalLink(
        'https://example.com/b',
        async () => {
          paced += 1;
        },
        fetcher,
      );
      expect(outcome).toEqual({ result: 'fail', statusCode: 404, error: null });
      expect(calls.map((call) => call.options.method)).toEqual(['HEAD', 'GET']);
      expect(paced).toBe(2);
    }
  });

  it('turns a failed request into an outcome instead of throwing', async () => {
    const { fetcher } = fakeFetcher({
      'https://gone.example/': Object.assign(new Error('getaddrinfo ENOTFOUND'), {
        code: 'ENOTFOUND',
      }),
    });
    expect(await checkExternalLink('https://gone.example/', undefined, fetcher)).toEqual({
      result: 'fail',
      statusCode: null,
      error: 'DNS',
    });
  });
});

describe('Pacer', () => {
  it('spaces requests out, even when asked for at the same time', async () => {
    let now = 1_000;
    const waits: number[] = [];
    const clock: Clock = {
      now: () => now,
      sleep: async (ms) => {
        waits.push(ms);
      },
    };
    const pacer = new Pacer(500, clock);
    await Promise.all([pacer.next(), pacer.next(), pacer.next()]);
    expect(waits).toEqual([500, 1000]);

    // Long after: no wait.
    now = 10_000;
    await pacer.next();
    expect(waits).toEqual([500, 1000]);
  });
});

describe('forEachHostSerially', () => {
  it('runs each URL once, one at a time per host, hosts side by side', async () => {
    const running = new Map<string, number>();
    let most = 0;
    let mostPerHost = 0;
    let inFlight = 0;
    const seen: string[] = [];
    const results = await forEachHostSerially(
      [
        'https://a.example/1',
        'https://a.example/2',
        'https://b.example/1',
        'https://a.example/1',
        'https://A.example/3',
      ],
      async (url) => {
        const host = new URL(url).host;
        seen.push(url);
        running.set(host, (running.get(host) ?? 0) + 1);
        inFlight += 1;
        mostPerHost = Math.max(mostPerHost, running.get(host)!);
        most = Math.max(most, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running.set(host, running.get(host)! - 1);
        inFlight -= 1;
        return url.length;
      },
    );
    expect(seen.toSorted()).toEqual([
      'https://A.example/3',
      'https://a.example/1',
      'https://a.example/2',
      'https://b.example/1',
    ]);
    expect(mostPerHost).toBe(1);
    expect(most).toBe(2);
    expect(results.get('https://b.example/1')).toBe('https://b.example/1'.length);
  });
});
