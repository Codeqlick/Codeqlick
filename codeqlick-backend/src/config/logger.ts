import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
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

const TOKEN_PARAM = /([?&]token=)[^&#]*/gi;

/**
 * A URL with the value of every `token` query parameter replaced: the unsubscribe links' tokens
 * (and any other link token) never reach the logs.
 */
export function redactUrlTokens(url: string): string {
  return url.replace(TOKEN_PARAM, '$1[redacted]');
}

/** nestjs-pino options: JSON logs in production, pretty logs in development. */
export function buildLoggerParams(config: AppConfigService): Params {
  return {
    pinoHttp: {
      level: config.logLevel,
      genReqId: generateRequestId,
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
          'req.query.token',
        ],
        censor: '[redacted]',
      },
      serializers: {
        // Receives pino's serialized request; only its URL is touched.
        req: (req: { url?: string }) => {
          if (typeof req.url === 'string') req.url = redactUrlTokens(req.url);
          return req;
        },
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
