import type { NextFunction, Request, Response } from 'express';

/** An error shaped like body-parser's, which the problem details filter answers with its status. */
function clientError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status, statusCode: status, expose: true });
}

/**
 * Reads the JSON body of the routes matching `path` with a larger limit than the global JSON
 * parser's 100 KB (a `.env` import, architecture 4.13). It runs before that parser, which then
 * sees the request already finished (on-finished's `isFinished`) and leaves it alone. Other
 * requests pass through untouched. Compressed bodies are refused (415), as body-parser would
 * otherwise inflate them past the limit.
 */
export function largeJsonBody(path: RegExp, limit: number) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const url = (req.originalUrl ?? req.url).split('?')[0] ?? '';
    const type = (req.headers['content-type'] ?? '').toLowerCase();
    if (req.method !== 'POST' || !path.test(url) || !type.startsWith('application/json')) {
      next();
      return;
    }
    const encoding = (req.headers['content-encoding'] ?? 'identity').toLowerCase();
    if (encoding !== 'identity') {
      next(clientError(415, `unsupported content encoding "${encoding}"`));
      return;
    }
    if (Number(req.headers['content-length'] ?? 0) > limit) {
      next(clientError(413, 'request entity too large'));
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      next(error);
    };
    req.on('data', (chunk: Buffer) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) finish(clientError(413, 'request entity too large'));
      else chunks.push(chunk);
    });
    req.on('end', () => {
      if (done) return;
      const text = Buffer.concat(chunks).toString('utf8');
      try {
        req.body = text === '' ? {} : (JSON.parse(text) as unknown);
      } catch {
        finish(clientError(400, 'The body is not valid JSON'));
        return;
      }
      finish();
    });
    req.on('error', (error) => finish(error));
  };
}
