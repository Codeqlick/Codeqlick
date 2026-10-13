import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { AppConfigService } from './config/app-config.service.js';
import { setupSwagger } from './config/swagger.js';

const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
configureApp(app);

const config = app.get(AppConfigService);
if (!config.isProduction) {
  setupSwagger(app);
}

await app.listen(config.port, '0.0.0.0');
