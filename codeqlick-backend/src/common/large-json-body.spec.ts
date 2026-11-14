import type { Request, Response } from 'express';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { largeJsonBody } from './large-json-body.js';

const middleware = largeJsonBody(/^\/v1\/import$/, 1024);

function send(url: string, body: string, headers: Record<string, string> = {}) {
  const req = Object.assign(new PassThrough(), {
    method: 'POST',
    url,
    originalUrl: url,
    headers: { 'content-type': 'application/json', ...headers },
  }) as unknown as Request & PassThrough;
  return new Promise<{ req: Request; error?: Error & { status?: number } }>((resolve) => {
    middleware(req, {} as Response, (error?: unknown) =>
      resolve({ req, error: error as (Error & { status?: number }) | undefined }),
    );
    req.end(body);
  });
}

describe('largeJsonBody', () => {
  it("reads the matching route's JSON", async () => {
    const { req, error } = await send('/v1/import?x=1', JSON.stringify({ content: 'A=1' }));
    expect(error).toBeUndefined();
    expect(req.body).toEqual({ content: 'A=1' });
  });

  it('refuses bodies over the limit with 413 and bad JSON with 400', async () => {
    const big = await send('/v1/import', JSON.stringify({ content: 'x'.repeat(2000) }));
    expect(big.error?.status).toBe(413);
    const declared = await send('/v1/import', '{}', { 'content-length': '5000' });
    expect(declared.error?.status).toBe(413);
    const bad = await send('/v1/import', '{nope');
    expect(bad.error?.status).toBe(400);
  });

  it('leaves other routes to the global parser', async () => {
    const { req, error } = await send('/v1/other', '{"a":1}');
    expect(error).toBeUndefined();
    expect(req.body).toBeUndefined();
  });
});
