import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { MailService } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: the endpoint is limited to 20 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const blockedOrigin = `https://csp-${tag}.example`;

describe('CSP reports (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let mailSend: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    mailSend = vi.spyOn(app.get(MailService), 'send');
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.errorGroup.deleteMany({ where: { message: { contains: `csp-${tag}` } } });
    }
    await app?.close();
  });

  it('counts violations by directive and origin, keeps a sample and no IP, never emails', async () => {
    const server = app.getHttpServer();
    // A report-uri report, then the same violation from another page through the Reporting API.
    await request(server)
      .post('/v1/csp-reports')
      .set('X-Forwarded-For', '203.0.113.7')
      .set('User-Agent', 'Firefox/140')
      .send({
        'csp-report': {
          'document-uri': 'https://codeqlick.com/en/blog/a?email=ada@example.com',
          'violated-directive': 'script-src-elem',
          'blocked-uri': `${blockedOrigin}/x.js?secret=1`,
          disposition: 'report',
        },
      })
      .expect(204);
    await request(server)
      .post('/v1/csp-reports')
      .send([
        {
          type: 'csp-violation',
          user_agent: 'Chrome/150',
          body: {
            documentURL: 'https://cruising.codeqlick.com/en/map',
            effectiveDirective: 'script-src-elem',
            blockedURL: `${blockedOrigin}/y.js`,
            disposition: 'enforce',
          },
        },
        { type: 'deprecation', body: {} },
      ])
      .expect(204);
    // A browser extension's report is dropped.
    await request(server)
      .post('/v1/csp-reports')
      .send({
        'csp-report': {
          'effective-directive': 'script-src',
          'blocked-uri': 'inline',
          'source-file': `chrome-extension://csp-${tag}/content.js`,
        },
      })
      .expect(204);

    const groups = await prisma.errorGroup.findMany({
      where: { message: { contains: `csp-${tag}` } },
    });
    expect(groups).toHaveLength(1);
    const [group] = groups;
    expect(group).toMatchObject({
      source: 'CSP',
      message: `script-src-elem blocked ${blockedOrigin}`,
      count: 2,
      path: '/en/map',
      userAgent: 'Chrome/150',
      stack: 'disposition: enforce',
      resolvedAt: null,
    });
    expect(JSON.stringify(group)).not.toContain('203.0.113.7');
    expect(JSON.stringify(group)).not.toContain('secret');
    expect(mailSend).not.toHaveBeenCalled();
  });

  it('refuses what is not a report', async () => {
    const server = app.getHttpServer();
    const object = await request(server).post('/v1/csp-reports').send({ hello: 'world' });
    const empty = await request(server).post('/v1/csp-reports').send([]);
    expect([object.status, empty.status]).toEqual([400, 400]);
  });

  it('is limited to 20 a minute per IP', async () => {
    const server = app.getHttpServer();
    const statuses: number[] = [];
    for (let i = 0; i < 21; i += 1) {
      const response = await request(server)
        .post('/v1/csp-reports')
        .set('X-Forwarded-For', '198.51.100.20')
        .send({
          'csp-report': {
            'effective-directive': 'img-src',
            'blocked-uri': `${blockedOrigin}/i.png`,
          },
        });
      statuses.push(response.status);
    }
    expect(statuses.at(-1)).toBe(429);
  });

  it('sends the protective headers', async () => {
    const response = await request(app.getHttpServer()).get('/v1/health');
    expect(response.headers['strict-transport-security']).toBe(
      'max-age=31536000; includeSubDomains',
    );
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cross-origin-opener-policy']).toBe('same-origin');
  });
});
