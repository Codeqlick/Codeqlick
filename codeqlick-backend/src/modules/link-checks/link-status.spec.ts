import { describe, expect, it } from 'vitest';
import {
  classifyError,
  classifyResponse,
  nextLinkState,
  type CheckOutcome,
  type LinkState,
} from './link-status.js';

const OK: CheckOutcome = { result: 'ok', statusCode: 200, error: null };
const GONE: CheckOutcome = { result: 'fail', statusCode: 404, error: null };
const LIMITED: CheckOutcome = { result: 'unknown', statusCode: 429, error: null };

describe('classifyResponse', () => {
  it('counts 2xx and 3xx answers as working', () => {
    expect(classifyResponse(200, {}).result).toBe('ok');
    expect(classifyResponse(204, {}).result).toBe('ok');
    expect(classifyResponse(304, {}).result).toBe('ok');
  });

  it('counts 4xx (but 429) and 5xx as failures, keeping the status', () => {
    expect(classifyResponse(404, {})).toEqual({ result: 'fail', statusCode: 404, error: null });
    expect(classifyResponse(410, {}).result).toBe('fail');
    expect(classifyResponse(401, {}).result).toBe('fail');
    expect(classifyResponse(403, { server: 'nginx' }).result).toBe('fail');
    expect(classifyResponse(500, {}).result).toBe('fail');
    expect(classifyResponse(503, {}).result).toBe('fail');
  });

  it('tells nothing from rate limits, bot walls and odd answers', () => {
    expect(classifyResponse(429, {})).toEqual({ result: 'unknown', statusCode: 429, error: null });
    expect(classifyResponse(403, { 'cf-mitigated': 'challenge' }).result).toBe('unknown');
    expect(
      classifyResponse(403, { server: 'cloudflare', 'set-cookie': ['__cf_chl_rt_tk=abc; path=/'] })
        .result,
    ).toBe('unknown');
    expect(classifyResponse(403, { server: 'cloudflare', 'cf-chl-bypass': '1' }).result).toBe(
      'unknown',
    );
    expect(classifyResponse(403, { 'x-amzn-waf-action': 'captcha' }).result).toBe('unknown');
    expect(classifyResponse(403, { 'x-vercel-mitigated': 'challenge' }).result).toBe('unknown');
    expect(classifyResponse(999, {}).result).toBe('unknown');
  });

  it('counts any other 403 as a failure, behind Cloudflare too', () => {
    expect(classifyResponse(403, { server: 'cloudflare', 'cf-ray': '8a1b-MAD' }).result).toBe(
      'fail',
    );
    expect(classifyResponse(403, { 'cf-mitigated': 'block' }).result).toBe('fail');
    expect(classifyResponse(403, { server: 'AkamaiGHost' }).result).toBe('fail');
    expect(classifyResponse(403, { 'x-amzn-waf-action': 'block' }).result).toBe('fail');
  });
});

describe('classifyError', () => {
  const failure = (code: string, message = 'boom') => Object.assign(new Error(message), { code });

  it('names network failures', () => {
    expect(classifyError(failure('ETIMEDOUT'))).toEqual({
      result: 'fail',
      statusCode: null,
      error: 'timeout',
    });
    expect(classifyError(failure('ENOTFOUND')).error).toBe('DNS');
    expect(classifyError(failure('ECONNREFUSED')).error).toBe('refused');
    expect(classifyError(failure('ECONNRESET')).error).toBe('connection reset');
    expect(classifyError(failure('TOO_MANY_REDIRECTS')).error).toBe('too many redirects');
    expect(classifyError(failure('CERT_HAS_EXPIRED')).error).toBe('certificate');
    expect(classifyError(failure('ERR_TLS_CERT_ALTNAME_INVALID')).error).toBe('certificate');
    expect(classifyError(new Error('socket hang up')).error).toBe('connection reset');
    expect(classifyError(new Error('something else'))).toEqual({
      result: 'fail',
      statusCode: null,
      error: 'network error',
    });
  });

  it('fails a private address, but tells nothing of an address it may not connect to', () => {
    expect(classifyError(failure('UNSAFE_URL', 'The name points to a private address'))).toEqual({
      result: 'fail',
      statusCode: null,
      error: 'private address',
    });
    expect(classifyError(failure('UNSAFE_URL', 'Only the standard ports'))).toEqual({
      result: 'unknown',
      statusCode: null,
      error: 'not checked: Only the standard ports',
    });
  });
});

describe('nextLinkState (two strikes)', () => {
  const day1 = new Date('2026-11-01T10:00:00Z');
  const day8 = new Date('2026-11-08T10:00:00Z');
  const day15 = new Date('2026-11-15T10:00:00Z');

  it('keeps a new link that fails once OK', () => {
    expect(nextLinkState(null, GONE, day1)).toEqual({
      status: 'OK',
      failures: 1,
      brokenSince: null,
      statusCode: 404,
      error: null,
      checkedAt: day1,
    });
  });

  it('makes it BROKEN at the second failure in a row, and keeps the date after', () => {
    const once = nextLinkState(null, GONE, day1);
    const twice = nextLinkState(once, GONE, day8);
    expect(twice).toMatchObject({ status: 'BROKEN', failures: 2, brokenSince: day8 });
    expect(nextLinkState(twice, GONE, day15)).toMatchObject({
      status: 'BROKEN',
      failures: 3,
      brokenSince: day8,
    });
  });

  it('is OK again at the next good check', () => {
    const broken: LinkState = { status: 'BROKEN', failures: 4, brokenSince: day1 };
    expect(nextLinkState(broken, OK, day8)).toEqual({
      status: 'OK',
      failures: 0,
      brokenSince: null,
      statusCode: 200,
      error: null,
      checkedAt: day8,
    });
  });

  it('a good check in between starts the count again', () => {
    const once = nextLinkState(null, GONE, day1);
    const good = nextLinkState(once, OK, day8);
    expect(nextLinkState(good, GONE, day15)).toMatchObject({ status: 'OK', failures: 1 });
  });

  it('an unknown outcome changes neither the status nor the count', () => {
    const once = nextLinkState(null, GONE, day1);
    expect(nextLinkState(once, LIMITED, day8)).toEqual({
      status: 'OK',
      failures: 1,
      brokenSince: null,
      statusCode: 429,
      error: null,
      checkedAt: day8,
    });
    const broken: LinkState = { status: 'BROKEN', failures: 2, brokenSince: day1 };
    expect(nextLinkState(broken, LIMITED, day8)).toMatchObject({
      status: 'BROKEN',
      failures: 2,
      brokenSince: day1,
    });
    expect(nextLinkState(null, LIMITED, day1)).toMatchObject({ status: 'OK', failures: 0 });
  });
});
