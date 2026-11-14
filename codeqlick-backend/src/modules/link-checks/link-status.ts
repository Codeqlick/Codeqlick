import type { IncomingHttpHeaders } from 'node:http';
import { LinkStatus } from '../../generated/prisma/client.js';

/**
 * What one check of a link says (architecture 4.6, Broken links): it works, it failed (4xx other
 * than 429, 5xx, a network error), or nothing can be told (429, a bot wall's 403, odd answers).
 */
export interface CheckOutcome {
  result: 'ok' | 'fail' | 'unknown';
  statusCode: number | null;
  /** Why the request failed, in English (timeout, DNS, refused, private address…). */
  error: string | null;
}

/** Failed checks in a row that make a link broken: a site that blinks once isn't reported. */
export const FAILURES_TO_BREAK = 2;

/**
 * A 403 that is a challenge for automated visitors (the page may be fine for people), not the
 * site's own refusal: Cloudflare's (`cf-mitigated: challenge`, or `server: cloudflare` with a
 * `cf-chl` marker in a header's name or value), AWS WAF's and Vercel's challenge headers. Any other
 * 403, behind Cloudflare or not, is a failure.
 */
export function isBotWall(headers: IncomingHttpHeaders): boolean {
  const value = (name: string) => {
    const raw = headers[name];
    return (Array.isArray(raw) ? raw.join(', ') : String(raw ?? '')).toLowerCase();
  };
  if (value('cf-mitigated') === 'challenge') return true;
  if (value('server') === 'cloudflare') {
    const marked = Object.entries(headers).some(
      ([name, raw]) =>
        /cf[-_]chl/i.test(name) ||
        /cf[-_]chl/i.test(Array.isArray(raw) ? raw.join(', ') : String(raw ?? '')),
    );
    if (marked) return true;
  }
  if (/^(captcha|challenge)$/.test(value('x-amzn-waf-action'))) return true;
  return value('x-vercel-mitigated') === 'challenge';
}

/** An HTTP answer (after redirects) as a check outcome. */
export function classifyResponse(status: number, headers: IncomingHttpHeaders): CheckOutcome {
  const outcome = (result: CheckOutcome['result']): CheckOutcome => ({
    result,
    statusCode: status,
    error: null,
  });
  // A 3xx here is one without a Location (or a 304): the server answered.
  if (status >= 200 && status < 400) return outcome('ok');
  if (status === 429) return outcome('unknown');
  if (status === 403 && isBotWall(headers)) return outcome('unknown');
  if (status >= 400 && status < 600) return outcome('fail');
  // Non-standard answers (LinkedIn's 999 to robots, 1xx…).
  return outcome('unknown');
}

const ERROR_LABELS: ReadonlyArray<[RegExp, string]> = [
  [/^(ETIMEDOUT|ESOCKETTIMEDOUT|UND_ERR_CONNECT_TIMEOUT)$/, 'timeout'],
  [/^(ENOTFOUND|EAI_AGAIN|EAI_FAIL|EAI_NODATA|EAI_NONAME)$/, 'DNS'],
  [/^ECONNREFUSED$/, 'refused'],
  [/^(ECONNRESET|EPIPE|ECONNABORTED)$/, 'connection reset'],
  [/^(EHOSTUNREACH|ENETUNREACH|EHOSTDOWN|ENETDOWN)$/, 'unreachable'],
  [/^TOO_MANY_REDIRECTS$/, 'too many redirects'],
  [/^ERR_INVALID_URL$/, 'invalid address'],
  [/^HPE_/, 'invalid response'],
  [/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|^ERR_TLS_|^ERR_SSL_/, 'certificate'],
];

/** A failed request (from `safeFetch`) as a check outcome. */
export function classifyError(error: unknown): CheckOutcome {
  const code = String((error as { code?: unknown } | null)?.code ?? '');
  const message = error instanceof Error ? error.message : String(error);
  if (code === 'UNSAFE_URL') {
    // A private address can't be reached by visitors either; another port or credentials in the
    // address are only beyond what this check may connect to.
    return /private/i.test(message)
      ? { result: 'fail', statusCode: null, error: 'private address' }
      : { result: 'unknown', statusCode: null, error: `not checked: ${message}`.slice(0, 200) };
  }
  for (const [pattern, label] of ERROR_LABELS) {
    if (pattern.test(code)) return { result: 'fail', statusCode: null, error: label };
  }
  if (/socket hang up/i.test(message)) {
    return { result: 'fail', statusCode: null, error: 'connection reset' };
  }
  return { result: 'fail', statusCode: null, error: 'network error' };
}

export interface LinkState {
  status: LinkStatus;
  failures: number;
  brokenSince: Date | null;
}

export interface CheckedLinkState extends LinkState {
  statusCode: number | null;
  error: string | null;
  checkedAt: Date;
}

/**
 * A link's state after a check (`previous` null: first seen). Two failures in a row make it
 * BROKEN; a good check makes it OK again at once; an unknown outcome changes neither.
 */
export function nextLinkState(
  previous: LinkState | null,
  outcome: CheckOutcome,
  now: Date,
): CheckedLinkState {
  const last = { statusCode: outcome.statusCode, error: outcome.error, checkedAt: now };
  if (outcome.result === 'ok') {
    return { ...last, status: LinkStatus.OK, failures: 0, brokenSince: null };
  }
  if (outcome.result === 'unknown') {
    return {
      ...last,
      status: previous?.status ?? LinkStatus.OK,
      failures: previous?.failures ?? 0,
      brokenSince: previous?.brokenSince ?? null,
    };
  }
  const failures = (previous?.failures ?? 0) + 1;
  const broken = failures >= FAILURES_TO_BREAK;
  return {
    ...last,
    status: broken ? LinkStatus.BROKEN : LinkStatus.OK,
    failures,
    brokenSince: broken ? (previous?.brokenSince ?? now) : null,
  };
}
