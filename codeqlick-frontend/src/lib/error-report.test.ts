import { describe, expect, it } from 'vitest';
import { isBrowserNoise, isExpectedServerError, pathOnly } from './error-report';

describe('error reports', () => {
  it('skips browser noise nobody can fix', () => {
    expect(isBrowserNoise('Script error.')).toBe(true);
    expect(isBrowserNoise('ResizeObserver loop completed with undelivered notifications.')).toBe(
      true,
    );
    expect(isBrowserNoise('x is undefined', 'at f (chrome-extension://abc/content.js:1:1)')).toBe(
      true,
    );
    expect(isBrowserNoise('TypeError: Failed to fetch')).toBe(true);
    expect(isBrowserNoise("TypeError: Cannot read properties of undefined (reading 'id')")).toBe(
      false,
    );
  });

  it('skips the API answers that are not bugs', () => {
    expect(isExpectedServerError({ name: 'ApiError', status: 404 })).toBe(true);
    expect(isExpectedServerError({ name: 'ApiError', status: 503 })).toBe(true);
    expect(isExpectedServerError({ name: 'ApiError', status: 500 })).toBe(false);
    expect(isExpectedServerError(new TypeError('x'))).toBe(false);
  });

  it('drops the query string and fragment', () => {
    expect(pathOnly('/es/citas/cancelar?token=secret#x')).toBe('/es/citas/cancelar');
  });
});
