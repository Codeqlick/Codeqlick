import { StandardSchemaValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter.js';
import { AppConfigService } from './config/app-config.service.js';

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
  app.enableCors({ origin: config.corsOrigins, credentials: false });
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();
}
