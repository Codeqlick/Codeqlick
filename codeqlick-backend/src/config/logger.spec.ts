import { describe, expect, it } from 'vitest';
import { serializeRequest } from './logger.js';

const token = 'cqd_AbCdEfGh1234567890abcdefghijklmnopqrstuvw';

function request(url: string, params: Record<string, string> = { token }) {
  return {
    id: 'req-1',
    method: 'POST',
    url,
    originalUrl: url,
    query: { page: '2' },
    params,
    headers: { host: 'api.codeqlick.com' },
    socket: { remoteAddress: '203.0.113.9', remotePort: 5555 },
  };
}

describe('serializeRequest', () => {
  it('hides a deploy hook token in the logged url and the route parameters', () => {
    const logged = serializeRequest(request(`/v1/cloud/hooks/${token}`));
    expect(logged.url).toBe('/v1/cloud/hooks/cqd_AbCdEfGh…');
    expect(logged.params).toEqual({ token: 'cqd_AbCdEfGh…' });
    expect(JSON.stringify(logged)).not.toContain(token.slice(12));
  });

  it('logs the rest of a request in pino standard shape', () => {
    expect(serializeRequest(request('/v1/posts?page=2', { slug: 'hello' }))).toEqual({
      id: 'req-1',
      method: 'POST',
      url: '/v1/posts?page=2',
      query: { page: '2' },
      params: { slug: 'hello' },
      headers: { host: 'api.codeqlick.com' },
      remoteAddress: '203.0.113.9',
      remotePort: 5555,
    });
  });

  it('reads the wrapped request when pino-http hands one over', () => {
    const wrapped = { raw: request(`/v1/cloud/hooks/${token}`) };
    const logged = serializeRequest(wrapped);
    expect(logged.url).toBe('/v1/cloud/hooks/cqd_AbCdEfGh…');
    expect(logged.id).toBe('req-1');
  });
});
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
