import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { configureApp } from '../src/app.setup.js';
import { AppConfigService } from '../src/config/app-config.service.js';
import { indexNowKey } from '../src/modules/indexnow/indexnow.service.js';

// Its own file, so its own app, with IndexNow on. The config is read when the app module is
// loaded, hence the dynamic import after setting it.
process.env.INDEXNOW_ENABLED = 'true';

describe('IndexNow key (e2e)', () => {
  let app: NestExpressApplication;
  let config: AppConfigService;

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    config = app.get(AppConfigService);
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.INDEXNOW_ENABLED;
  });

  it('hands out the key, without signing in, while IndexNow is on', async () => {
    const response = await request(app.getHttpServer()).get('/v1/indexnow/key').expect(200);
    expect(response.body).toEqual({ key: indexNowKey(config.jwtAccessSecret) });
    expect(response.body.key).toMatch(/^[0-9a-f]{32}$/);
  });

  it('answers 404 while IndexNow is off', async () => {
    const off = vi.spyOn(config, 'indexNowEnabled', 'get').mockReturnValue(false);
    try {
      const response = await request(app.getHttpServer()).get('/v1/indexnow/key').expect(404);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({ status: 404, title: 'Not Found' });
    } finally {
      off.mockRestore();
    }
  });
});
