import { safeFetch, type FetchedPage, type FetchOptions } from '../site-audits/safe-fetch.js';
import { classifyError, classifyResponse, type CheckOutcome } from './link-status.js';

/** How the check introduces itself to the sites it visits. */
export const LINK_CHECK_USER_AGENT = 'CodeqlickLinkCheck/1 (+https://codeqlick.com)';
export const LINK_CHECK_TIMEOUT_MS = 10_000;
export const LINK_CHECK_MAX_REDIRECTS = 5;
/** At most two requests a second overall. */
export const LINK_CHECK_INTERVAL_MS = 500;

export type Fetcher = (
  url: string,
  options: FetchOptions,
) => Promise<Pick<FetchedPage, 'status' | 'headers'>>;

/**
 * Checks an external link (architecture 4.6, Broken links): a `HEAD` through `safeFetch` (public
 * addresses only on every hop, at most 5 redirects, 10 s), then a `GET` when the server doesn't
 * take `HEAD` (405 or 501). `pace` is awaited before each request. Never throws.
 */
export async function checkExternalLink(
  url: string,
  pace: () => Promise<void> = async () => {},
  fetcher: Fetcher = safeFetch,
): Promise<CheckOutcome> {
  const options = {
    timeoutMs: LINK_CHECK_TIMEOUT_MS,
    maxRedirects: LINK_CHECK_MAX_REDIRECTS,
    // Only the status matters: a GET's page is cut short.
    maxBytes: 16 * 1024,
    userAgent: LINK_CHECK_USER_AGENT,
  } satisfies FetchOptions;
  try {
    await pace();
    let answer = await fetcher(url, { ...options, method: 'HEAD' });
    if (answer.status === 405 || answer.status === 501) {
      await pace();
      answer = await fetcher(url, { ...options, method: 'GET' });
    }
    return classifyResponse(answer.status, answer.headers);
  } catch (error) {
    return classifyError(error);
  }
}

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** Spaces requests out: each `next()` resolves at least `intervalMs` after the previous one. */
export class Pacer {
  private nextAt = 0;

  constructor(
    private readonly intervalMs: number,
    private readonly clock: Clock = systemClock,
  ) {}

  async next(): Promise<void> {
    const now = this.clock.now();
    // The slot is taken before waiting, so callers waiting together each get their own.
    const at = Math.max(now, this.nextAt);
    this.nextAt = at + this.intervalMs;
    if (at > now) await this.clock.sleep(at - now);
  }
}

/**
 * Runs `work` once for each URL: the URLs of one host one after another, different hosts side by
 * side (the overall rate is up to `work`'s pacing). `work` must not throw.
 */
export async function forEachHostSerially<T>(
  urls: readonly string[],
  work: (url: string) => Promise<T>,
): Promise<Map<string, T>> {
  const byHost = new Map<string, string[]>();
  for (const url of new Set(urls)) {
    const host = new URL(url).host.toLowerCase();
    const list = byHost.get(host);
    if (list) list.push(url);
    else byHost.set(host, [url]);
  }
  const results = new Map<string, T>();
  await Promise.all(
    [...byHost.values()].map(async (list) => {
      for (const url of list) results.set(url, await work(url));
    }),
  );
  return results;
}
