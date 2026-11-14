import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import type { CloudBuildStatus } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const tag = randomUUID().slice(0, 8);
const slugOf = (name: string) => `badge-${name}-${tag}`;

describe('Codeqlick Cloud README badges (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let teamId: string;

  /**
   * A project with an optional production deployment (made `productionAt` minutes from now) and
   * production builds, oldest first, queued one minute apart up to 10 minutes ago.
   */
  async function project(
    name: string,
    options: { productionAt?: number; builds?: CloudBuildStatus[]; suspended?: boolean } = {},
  ): Promise<void> {
    const row = await prisma.cloudProject.create({
      data: {
        teamId,
        slug: slugOf(name),
        name,
        suspendedAt: options.suspended ? new Date() : null,
      },
    });
    if (options.productionAt !== undefined) {
      const deployment = await prisma.cloudDeployment.create({
        data: {
          projectId: row.id,
          shortId: randomUUID().slice(0, 8),
          target: 'PRODUCTION',
          sizeBytes: 10n,
          fileCount: 1,
          createdAt: new Date(Date.now() + options.productionAt * 60_000),
        },
      });
      await prisma.cloudProject.update({
        where: { id: row.id },
        data: { productionDeploymentId: deployment.id },
      });
    }
    for (const [index, status] of (options.builds ?? []).entries()) {
      await prisma.cloudBuild.create({
        data: {
          projectId: row.id,
          number: index + 1,
          trigger: 'PUSH',
          target: 'PRODUCTION',
          branch: 'main',
          commit: String(index).padStart(40, 'a'),
          status,
          queuedAt: new Date(Date.now() - (10 - index) * 60_000),
        },
      });
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    teamId = (await prisma.cloudTeam.create({ data: { slug: `badges-${tag}`, name: 'Badges' } }))
      .id;
    await project('live', { productionAt: -20, builds: ['SUCCEEDED'] });
    await project('broken', { productionAt: -20, builds: ['SUCCEEDED', 'FAILED'] });
    // Deployed with the CLI after the failed build: the site is fine.
    await project('fixed', { productionAt: -1, builds: ['FAILED'] });
    await project('busy', { productionAt: -20, builds: ['FAILED', 'RUNNING'] });
    await project('canceled', { productionAt: -20, builds: ['SUCCEEDED', 'CANCELED'] });
    await project('empty');
    await project('banned', { productionAt: -20, suspended: true });
  });

  afterAll(async () => {
    if (prisma) await prisma.cloudTeam.deleteMany({ where: { slug: `badges-${tag}` } });
    await app?.close();
  });

  it('draws the production state of each project, embeddable anywhere', async () => {
    const server = app.getHttpServer();
    const badge = async (file: string) => {
      const response = await request(server).get(`/v1/cloud/badges/${file}`).expect(200);
      expect(response.headers['content-type']).toMatch(/image\/svg\+xml/);
      expect(response.headers['cache-control']).toBe('public, max-age=60');
      expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
      return String(response.body instanceof Buffer ? response.body : response.text);
    };

    expect(await badge(`${slugOf('live')}.svg`)).toContain('codeqlick: deployed');
    expect(await badge(`${slugOf('broken')}.svg`)).toContain('codeqlick: failed');
    expect(await badge(`${slugOf('fixed')}.svg`)).toContain('codeqlick: deployed');
    expect(await badge(`${slugOf('busy')}.svg`)).toContain('codeqlick: building');
    expect(await badge(`${slugOf('canceled')}.svg`)).toContain('codeqlick: deployed');
    expect(await badge(`${slugOf('empty')}.svg`)).toContain('codeqlick: not deployed');
    // Suspended and unknown projects look alike: the badge reveals nothing more.
    expect(await badge(`${slugOf('banned')}.svg`)).toContain('codeqlick: unknown');
    expect(await badge(`nothing-here-${tag}.svg`)).toContain('codeqlick: unknown');
  });

  it('refuses names that are not a project slug and .svg', async () => {
    const server = app.getHttpServer();
    for (const file of [slugOf('live'), 'a_b.svg', 'ab.svg']) {
      const response = await request(server).get(`/v1/cloud/badges/${file}`);
      expect(response.status).toBe(400);
    }
  });
});
