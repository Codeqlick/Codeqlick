import { describe, expect, it } from 'vitest';
import { redactUrlTokens } from './logger.js';

describe('redactUrlTokens', () => {
  it('hides the value of every token query parameter', () => {
    expect(redactUrlTokens('/v1/email/unsubscribe?token=abc.def')).toBe(
      '/v1/email/unsubscribe?token=[redacted]',
    );
    expect(redactUrlTokens('/v1/email/preferences?a=1&token=abc.def&b=2')).toBe(
      '/v1/email/preferences?a=1&token=[redacted]&b=2',
    );
    expect(redactUrlTokens('/v1/x?TOKEN=abc#top')).toBe('/v1/x?TOKEN=[redacted]#top');
  });

  it('leaves other URLs and parameters alone', () => {
    expect(redactUrlTokens('/v1/posts?page=2')).toBe('/v1/posts?page=2');
    expect(redactUrlTokens('/v1/x?challengeToken=abc')).toBe('/v1/x?challengeToken=abc');
    expect(redactUrlTokens('/v1/token=abc')).toBe('/v1/token=abc');
  });
});
