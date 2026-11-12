import { StandardSchemaValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter.js';
import { AppConfigService } from './config/app-config.service.js';
import { ErrorsService } from './modules/errors/errors.service.js';

/** Routes any page may call from a browser (Cloud's forms, heartbeats and status, section 4.13). */
export const PUBLIC_CORS_PATH = /^\/v1\/cloud\/(forms|heartbeats|status)\//;

/**
 * Cross-cutting HTTP setup shared by main.ts and the e2e tests, so tests exercise exactly
 * the same pipeline as production.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(AppConfigService);

  app.useLogger(app.get(Logger));
  // Behind Nginx: trust the first proxy hop so req.ip (rate limiting, sessions) is the client's.
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: config.isProduction ? undefined : false }));
  app.enableCors((request, callback) => {
    // Cloud's public endpoints (forms, heartbeats, status) are called from anyone's pages: any
    // origin may ask, and each route checks the origins it accepts (no credentials anywhere).
    const path = (request as { path?: string }).path ?? request.url ?? '';
    callback(null, {
      origin: PUBLIC_CORS_PATH.test(path) ? true : config.corsOrigins,
      credentials: false,
    });
  });
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.useGlobalFilters(new ProblemDetailsFilter(app.get(ErrorsService, { strict: false })));
  app.enableShutdownHooks();
}
