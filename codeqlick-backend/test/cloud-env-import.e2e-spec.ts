import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AppConfigService } from '../src/config/app-config.service.js';
import { Role } from '../src/generated/prisma/client.js';
import { SecretBox } from '../src/modules/auth/secret-box.js';
import { CLOUD_TERMS_VERSION } from '../src/modules/cloud/cloud-plans.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const tag = randomUUID().slice(0, 8);
const password = 'cloud-env-import-password-1';
const owner = { email: `e2e-ei-owner-${tag}@codeqlick.test`, password };
const mate = { email: `e2e-ei-mate-${tag}@codeqlick.test`, password };

describe('Codeqlick Cloud: importing a .env file (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let box: SecretBox;
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'cq-cloud-env-import-'));
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: true,
      rawBody: true,
    });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const config = app.get(AppConfigService);
    vi.spyOn(config, 'cloudHosting', 'get').mockReturnValue({ domain: 'cloud.test', root });
    box = new SecretBox(config.credentialsSecret, 'cloud-env-v1');
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    for (const person of [owner, mate]) {
      await prisma.user.create({
        data: {
          email: person.email,
          name: 'Ada',
          role: Role.CLIENT,
          passwordHash,
          registeredAt: new Date(),
        },
      });
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cloudTeam.deleteMany({ where: { slug: `ei-${tag}` } });
      await prisma.cloudProject.deleteMany({ where: { slug: `eip-${tag}` } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('imports variables all or nothing, sealed, and never answers with values', async () => {
    const server = app.getHttpServer();
    const login = async (who: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(who).expect(200)).body.accessToken as string}`,
    });
    const auth = await login(owner);
    const teamSlug = `ei-${tag}`;
    await request(server)
      .post('/v1/cloud/teams')
      .set(auth)
      .send({
        name: 'Imports',
        slug: teamSlug,
        acceptTerms: true,
        termsVersion: CLOUD_TERMS_VERSION,
      })
      .expect(201);
    const project = await request(server)
      .post(`/v1/cloud/teams/${teamSlug}/projects`)
      .set(auth)
      .send({ name: 'Site', slug: `eip-${tag}` })
      .expect(201);
    const projectId = project.body.id as string;
    const url = `/v1/cloud/projects/${projectId}/env/import`;
    const stored = async (key: string) => {
      const row = await prisma.cloudEnvVar.findUniqueOrThrow({
        where: { projectId_key: { projectId, key } },
      });
      expect(row.valueSealed).not.toContain('value-');
      return { value: box.open(row.valueSealed), production: row.production, preview: row.preview };
    };
    const count = () => prisma.cloudEnvVar.count({ where: { projectId } });
    const importEnv = (body: object, as: Record<string, string> = auth) => {
      return request(server).post(url).set(as).send(body);
    };

    await request(server)
      .put(`/v1/cloud/projects/${projectId}/env`)
      .set(auth)
      .send({ key: 'EXISTING', value: 'value-old', production: true, preview: false })
      .expect(200);

    // ── New names are created, an existing one is skipped without `overwrite`.
    const content = [
      '# The site',
      'export API_URL=https://api.test/value-url # the API',
      'SECRET="value-multi',
      'line\\tend"',
      "RAW='value-$raw \\n'",
      '',
      'EXISTING=value-new',
    ].join('\r\n');
    const first = await importEnv({ content, production: true, preview: true, overwrite: false });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({
      created: ['API_URL', 'SECRET', 'RAW'],
      updated: [],
      skipped: ['EXISTING'],
    });
    expect(JSON.stringify(first.body)).not.toContain('value-');
    expect(await stored('API_URL')).toEqual({
      value: 'https://api.test/value-url',
      production: true,
      preview: true,
    });
    expect((await stored('SECRET')).value).toBe('value-multi\nline\tend');
    expect((await stored('RAW')).value).toBe('value-$raw \\n');
    expect(await stored('EXISTING')).toEqual({
      value: 'value-old',
      production: true,
      preview: false,
    });

    // ── With `overwrite` an existing name is replaced, value and targets.
    const second = await importEnv({
      content: 'EXISTING=value-new',
      production: false,
      preview: true,
      overwrite: true,
    });
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ created: [], updated: ['EXISTING'], skipped: [] });
    expect(await stored('EXISTING')).toEqual({
      value: 'value-new',
      production: false,
      preview: true,
    });

    // ── Any wrong line refuses the whole file, with each line's problem and never a value.
    const refused = await importEnv({
      content: 'GOOD=value-good\nvalue-loose line\nlower=value-lower\nGOOD=value-again',
      production: true,
      preview: true,
      overwrite: true,
    });
    expect(refused.status).toBe(400);
    expect(refused.body.errors).toEqual([
      { path: 'content', line: 2, message: 'Expected KEY=value' },
      { path: 'content', line: 3, message: expect.stringContaining('upper-case') },
      { path: 'content', line: 4, key: 'GOOD', message: 'Already on line 1' },
    ]);
    expect(JSON.stringify(refused.body)).not.toContain('value-');
    expect(await count()).toBe(4);

    // ── A target is required, and an empty file imports nothing.
    const noTarget = await importEnv({
      content: 'A=1',
      production: false,
      preview: false,
      overwrite: false,
    });
    expect(noTarget.status).toBe(400);
    const empty = await importEnv({
      content: '# nothing\n',
      production: true,
      preview: true,
      overwrite: false,
    });
    expect(empty.status).toBe(400);

    // ── Files up to 256 KB are read (past the API's usual 100 KB JSON bodies); bigger ones aren't.
    const big = await importEnv({
      content: `# ${'x'.repeat(250 * 1024)}\nBIG=value-big`,
      production: true,
      preview: true,
      overwrite: false,
    });
    expect(big.status).toBe(200);
    expect(big.body.created).toEqual(['BIG']);
    const tooBig = await importEnv({
      content: `# ${'x'.repeat(257 * 1024)}\nHUGE=1`,
      production: true,
      preview: true,
      overwrite: false,
    });
    expect(tooBig.status).toBe(400);
    expect(await count()).toBe(5);

    // ── Past 50 variables nothing is saved; the error names the first one over.
    const many = (n: number) => {
      const lines: string[] = [];
      for (let i = 0; i < n; i += 1) lines.push(`VAR_${i}=value-${i}`);
      return lines.join('\n');
    };
    const over = await importEnv({
      content: many(46),
      production: true,
      preview: true,
      overwrite: false,
    });
    expect(over.status).toBe(400);
    expect(over.body.errors).toEqual([
      { path: 'content', line: 46, key: 'VAR_45', message: 'A project has at most 50 variables' },
    ]);
    expect(await count()).toBe(5);
    const fill = await importEnv({
      content: many(45),
      production: true,
      preview: true,
      overwrite: false,
    });
    expect(fill.status).toBe(200);
    expect(fill.body.created).toHaveLength(45);
    expect(await count()).toBe(50);

    // ── One event per import, with the names and the targets.
    const events = await prisma.cloudEvent.findMany({
      where: { action: 'env.imported', team: { slug: teamSlug } },
      orderBy: { createdAt: 'asc' },
    });
    expect(events).toHaveLength(4);
    expect(events[0]!.details).toEqual({
      keys: { created: ['API_URL', 'SECRET', 'RAW'], updated: [], skipped: ['EXISTING'] },
      production: true,
      preview: true,
    });
    expect(JSON.stringify(events)).not.toContain('value-');

    // ── A MEMBER can't import; a token of the team can.
    const team = await prisma.cloudTeam.findUniqueOrThrow({ where: { slug: teamSlug } });
    const mateRow = await prisma.user.findUniqueOrThrow({ where: { email: mate.email } });
    await prisma.cloudMember.create({
      data: {
        teamId: team.id,
        userId: mateRow.id,
        role: 'MEMBER',
        termsVersion: CLOUD_TERMS_VERSION,
        termsAcceptedAt: new Date(),
      },
    });
    const mateAuth = await login(mate);
    const member = await importEnv(
      { content: 'API_URL=x', production: true, preview: true, overwrite: true },
      mateAuth,
    );
    expect(member.status).toBe(403);
    const created = await request(server)
      .post('/v1/cloud/tokens')
      .set(auth)
      .send({ name: 'CI', teamSlug, expiresInDays: 30 })
      .expect(201);
    const tokenAuth = { Authorization: `Bearer ${created.body.token as string}` };
    const viaToken = await importEnv(
      {
        content: 'API_URL=https://value-token.test',
        production: true,
        preview: false,
        overwrite: true,
      },
      tokenAuth,
    );
    expect(viaToken.status).toBe(200);
    expect(viaToken.body).toEqual({ created: [], updated: ['API_URL'], skipped: [] });
    expect((await stored('API_URL')).value).toBe('https://value-token.test');
  });
});
