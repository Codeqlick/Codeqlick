import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
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

/** What the request log reads of a request (pino-http hands over the request, or its wrapper). */
interface LoggedRequest {
  id?: unknown;
  method?: string;
  url?: string;
  originalUrl?: string;
  query?: unknown;
  params?: Record<string, unknown>;
  headers?: IncomingHttpHeaders;
  socket?: { remoteAddress?: string; remotePort?: number };
  raw?: LoggedRequest;
}

/** A hook token in a route parameter: its first 12 characters only. */
const hideToken = (value: unknown): unknown =>
  typeof value === 'string' && value.startsWith('cqd_') ? `${value.slice(0, 12)}…` : value;

/**
 * The request as the log shows it, in pino's standard shape, but a deploy hook's token is hidden
 * in the path and in the route parameters (architecture 4.13, decision 51).
 */
export function serializeRequest(request: LoggedRequest) {
  const raw: LoggedRequest = request.raw ?? request;
  const params = request.params ?? raw.params;
  return {
    id: request.id ?? raw.id,
    method: raw.method,
    url: redactHookPath(raw.originalUrl ?? raw.url ?? ''),
    query: raw.query,
    params: params
      ? Object.fromEntries(Object.entries(params).map(([key, value]) => [key, hideToken(value)]))
      : params,
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
