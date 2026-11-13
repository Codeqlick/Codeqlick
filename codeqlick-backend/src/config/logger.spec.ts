import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { serializeRequest } from './logger.js';

const token = 'cqd_AbCdEfGh1234567890abcdefghijklmnopqrstuvw';

function request(url: string, extra: object = {}) {
  return {
    id: 'req-1',
    method: 'POST',
    url,
    originalUrl: url,
    headers: { host: 'api.codeqlick.com' },
    socket: { remoteAddress: '203.0.113.9', remotePort: 5555 },
    params: { token },
    ...extra,
  } as unknown as Parameters<typeof serializeRequest>[0] & IncomingMessage;
}

describe('serializeRequest', () => {
  it('hides a deploy hook token in the logged url and writes no route parameters', () => {
    const logged = serializeRequest(request(`/v1/cloud/hooks/${token}`));
    expect(logged.url).toBe('/v1/cloud/hooks/cqd_AbCdEfGh…');
    expect(JSON.stringify(logged)).not.toContain(token.slice(12));
  });

  it('logs the rest of a request like pino does', () => {
    expect(serializeRequest(request('/v1/posts?page=2'))).toEqual({
      id: 'req-1',
      method: 'POST',
      url: '/v1/posts?page=2',
      headers: { host: 'api.codeqlick.com' },
      remoteAddress: '203.0.113.9',
      remotePort: 5555,
    });
  });

  it('reads the wrapped request when pino-http hands one over', () => {
    const inner = request(`/v1/cloud/hooks/${token}`);
    const logged = serializeRequest({ raw: inner } as unknown as Parameters<
      typeof serializeRequest
    >[0]);
    expect(logged.url).toBe('/v1/cloud/hooks/cqd_AbCdEfGh…');
    expect(logged.id).toBe('req-1');
  });
});
