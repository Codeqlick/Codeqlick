import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import { redactHookPath } from '../common/redact-path.js';
import type { AppConfigService } from './app-config.service.js';

const REQUEST_ID_HEADER = 'x-request-id';
const MAX_REQUEST_ID_LENGTH = 128;

/** Reuses a sane incoming X-Request-Id (e.g. from Nginx or the BFF) or creates one. */
export function generateRequestId(req: IncomingMessage, res: ServerResponse): string {
  const header = req.headers[REQUEST_ID_HEADER];
  const incoming = Array.isArray(header) ? header[0] : header;
  const id =
    incoming && incoming.length <= MAX_REQUEST_ID_LENGTH && /^[\w.-]+$/.test(incoming)
      ? incoming
      : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

/** What the request log needs of a request (pino-http hands over the request, or its wrapper). */
interface LoggedRequest extends IncomingMessage {
  id?: unknown;
  originalUrl?: string;
  raw?: LoggedRequest;
}

/**
 * The request as the log shows it: like pino's standard one, but a deploy hook's token is hidden
 * in the path (architecture 4.13, decision 51) and no route parameters are written.
 */
export function serializeRequest(request: LoggedRequest) {
  const raw: LoggedRequest = request.raw ?? request;
  return {
    id: request.id ?? raw.id,
    method: raw.method,
    url: redactHookPath(raw.originalUrl ?? raw.url ?? ''),
    headers: raw.headers,
    remoteAddress: raw.socket?.remoteAddress,
    remotePort: raw.socket?.remotePort,
  };
}

/** nestjs-pino options: JSON logs in production, pretty logs in development. */
export function buildLoggerParams(config: AppConfigService): Params {
  return {
    pinoHttp: {
      level: config.logLevel,
      genReqId: generateRequestId,
      serializers: { req: serializeRequest },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          'password',
          '*.password',
          'passwordHash',
          '*.passwordHash',
          'refreshToken',
          '*.refreshToken',
        ],
        censor: '[redacted]',
      },
      autoLogging: {
        ignore: (req: IncomingMessage) => (req.url ?? '').startsWith('/v1/health'),
      },
      transport: config.isDevelopment
        ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
        : undefined,
    },
  };
}
