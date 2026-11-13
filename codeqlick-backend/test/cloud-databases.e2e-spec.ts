import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AppConfigService } from '../src/config/app-config.service.js';
import { Role } from '../src/generated/prisma/client.js';
import { CloudDatabasesService } from '../src/modules/cloud/cloud-databases.service.js';
import { CloudDiskService } from '../src/modules/cloud/cloud-disk.service.js';
import { CLOUD_PLANS, CLOUD_TERMS_VERSION } from '../src/modules/cloud/cloud-plans.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// The test database's server plays cloud-pg: its user is a superuser, as cloud-pg's admin is.
const adminUrl = (() => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/postgres';
  url.search = '';
  return url.toString();
})();
const serverHost = new URL(process.env.DATABASE_URL!).hostname;

const tag = randomUUID().slice(0, 8);
const password = 'cloud-db-password-1';
const owner = { email: `e2e-cd-owner-${tag}@codeqlick.test`, password };
const terms = { acceptTerms: true, termsVersion: CLOUD_TERMS_VERSION };

/** Connects as a database's own role, like a team's app would. */
async function connect(database: string, user: string, secret: string) {
  const client = new pg.Client({ host: serverHost, port: 5432, database, user, password: secret });
  await client.connect();
  return client;
}

describe('Codeqlick Cloud databases (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const sent: MailMessage[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    vi.spyOn(app.get(AppConfigService), 'cloudPg', 'get').mockReturnValue({
      adminUrl,
      host: 'pg.cloud.test',
      port: 5432,
    });
    vi.spyOn(app.get(MailService), 'send').mockImplementation((message) => {
      sent.push(message);
      return Promise.resolve();
    });
    await prisma.user.create({
      data: {
        email: owner.email,
        name: 'Ada',
        role: Role.CLIENT,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        registeredAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      const service = app.get(CloudDatabasesService);
      const project = await prisma.cloudProject.findFirst({ where: { slug: `dp-${tag}` } });
      if (project) {
        await prisma.cloudProject.update({
          where: { id: project.id },
          data: { deletedAt: new Date() },
        });
        await service.check();
      }
      await prisma.cloudTeam.deleteMany({ where: { slug: `d-${tag}` } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
  });

  it('creates a database of its own role, limits it and drops it', async () => {
    const server = app.getHttpServer();
    const login = await request(server).post('/v1/auth/login').send(owner).expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
    await request(server)
      .post('/v1/cloud/teams')
      .set(auth)
      .send({ name: 'Data', slug: `d-${tag}`, ...terms })
      .expect(201);
    const projectId = (
      await request(server)
        .post(`/v1/cloud/teams/d-${tag}/projects`)
        .set(auth)
        .send({ name: 'App', slug: `dp-${tag}` })
        .expect(201)
    ).body.id as string;
    const base = `/v1/cloud/projects/${projectId}/databases`;

    const created = await request(server).post(base).set(auth).send({ name: 'main' }).expect(201);
    const db = created.body as {
      id: string;
      database: string;
      user: string;
      password: string;
      connectionUrl: string;
    };
    expect(db.database).toMatch(/^cq_[0-9a-f]{16}$/);
    expect(db.user).toBe(db.database);
    expect(db.password).toMatch(/^[A-Za-z2-9]{32}$/);
    expect(db.connectionUrl).toBe(
      `postgresql://${db.user}:${db.password}@pg.cloud.test:5432/${db.database}?sslmode=require`,
    );
    // The free plan has one database per project.
    await request(server).post(base).set(auth).send({ name: 'second' }).expect(409);

    // The list never has the password.
    const list = await request(server).get(base).set(auth).expect(200);
    expect(list.body.configured).toBe(true);
    expect(list.body.items[0].connectionUrl).not.toContain(db.password);
    expect(list.body.items[0]).toMatchObject({ maxBytes: CLOUD_PLANS.FREE.databaseBytes });

    // The role owns its database and can work in it.
    const client = await connect(db.database, db.user, db.password);
    await client.query('CREATE TABLE notes (id serial PRIMARY KEY, body text)');
    await client.query("INSERT INTO notes (body) VALUES ('hello')");
    const settings = await client.query<{ setting: string }>(
      "SELECT setting FROM pg_settings WHERE name = 'statement_timeout'",
    );
    expect(settings.rows[0]!.setting).toBe('60000');
    await client.end();

    // Over its size: read-only; far over it: no connections.
    const service = app.get(CloudDatabasesService);
    const limit = CLOUD_PLANS.FREE.databaseBytes;
    try {
      CLOUD_PLANS.FREE.databaseBytes = 1;
      await service.check();
      const full = await prisma.cloudDatabase.findUniqueOrThrow({ where: { id: db.id } });
      expect(full).toMatchObject({ readOnly: true, blocked: true });
      expect(Number(full.sizeBytes)).toBeGreaterThan(0);
      await expect(connect(db.database, db.user, db.password)).rejects.toThrow(/too many/i);
      expect(sent.some((m) => /is full/.test(m.subject))).toBe(true);
    } finally {
      CLOUD_PLANS.FREE.databaseBytes = limit;
    }
    await service.check();
    const back = await prisma.cloudDatabase.findUniqueOrThrow({ where: { id: db.id } });
    expect(back).toMatchObject({ readOnly: false, blocked: false });
    const again = await connect(db.database, db.user, db.password);
    await again.query("INSERT INTO notes (body) VALUES ('writable again')");
    await again.end();

    // A full server disk freezes every database (decision 49), without blaming the team.
    const emails = sent.length;
    const full = vi.spyOn(app.get(CloudDiskService), 'full', 'get').mockReturnValue(true);
    await service.check();
    expect(await prisma.cloudDatabase.findUniqueOrThrow({ where: { id: db.id } })).toMatchObject({
      readOnly: true,
      blocked: false,
    });
    expect(sent.length).toBe(emails);
    await request(server).post(base).set(auth).send({ name: 'more' }).expect(507);
    full.mockRestore();
    await service.check();
    expect((await prisma.cloudDatabase.findUniqueOrThrow({ where: { id: db.id } })).readOnly).toBe(
      false,
    );

    // A new password replaces the old one.
    const reset = await request(server).post(`${base}/${db.id}/password`).set(auth).expect(200);
    expect(reset.body.password).not.toBe(db.password);
    await expect(connect(db.database, db.user, db.password)).rejects.toThrow(/password/i);
    (await connect(db.database, db.user, reset.body.password as string)).end();

    // Deleting drops the database and its role.
    await request(server).delete(`${base}/${db.id}`).set(auth).expect(204);
    await expect(connect(db.database, db.user, reset.body.password as string)).rejects.toThrow(
      /does not exist|password/i,
    );
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    const left = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [db.database]);
    await admin.end();
    expect(left.rowCount).toBe(0);
  });
});
