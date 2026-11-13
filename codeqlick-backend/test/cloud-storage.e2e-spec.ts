import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AppConfigService } from '../src/config/app-config.service.js';
import { Role } from '../src/generated/prisma/client.js';
import { CLOUD_TERMS_VERSION } from '../src/modules/cloud/cloud-plans.js';
import { GarageClient, GarageError } from '../src/modules/cloud/garage.client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// A real Garage when CLOUD_STORAGE_TEST_ADMIN_URL is set (its token in
// CLOUD_STORAGE_TEST_TOKEN); otherwise a fake that behaves like one.
const realGarage = process.env.CLOUD_STORAGE_TEST_ADMIN_URL;

const tag = randomUUID().slice(0, 8);
const password = 'cloud-storage-password-1';
const owner = { email: `e2e-cs-owner-${tag}@codeqlick.test`, password };
const terms = { acceptTerms: true, termsVersion: CLOUD_TERMS_VERSION };

describe('Codeqlick Cloud object storage (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  /** The fake Garage's buckets: objects and quota. */
  const buckets = new Map<string, { name: string; objects: number; maxSize: number }>();
  const keys = new Map<string, { bucketId: string; write: boolean }>();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    vi.spyOn(app.get(AppConfigService), 'cloudStorage', 'get').mockReturnValue({
      adminUrl: realGarage ?? 'http://garage.test:3903',
      token: process.env.CLOUD_STORAGE_TEST_TOKEN ?? 'test',
      endpoint: 'https://s3.cloud.test',
      region: 'garage',
      capacityGb: 10,
    });
    if (!realGarage) {
      const garage = app.get(GarageClient);
      vi.spyOn(garage, 'createBucket').mockImplementation((name, maxSize) => {
        if ([...buckets.values()].some((b) => b.name === name)) {
          return Promise.reject(new GarageError(409, 'exists'));
        }
        const id = randomUUID().replaceAll('-', '');
        buckets.set(id, { name, objects: 0, maxSize });
        return Promise.resolve(id);
      });
      vi.spyOn(garage, 'bucket').mockImplementation((id) => {
        const b = buckets.get(id);
        return b
          ? Promise.resolve({ id, bytes: b.objects * 10, objects: b.objects, maxSize: b.maxSize })
          : Promise.reject(new GarageError(404, 'no bucket'));
      });
      vi.spyOn(garage, 'deleteBucket').mockImplementation((id) => {
        buckets.delete(id);
        return Promise.resolve();
      });
      vi.spyOn(garage, 'createKey').mockImplementation((_name, bucketId, write) => {
        const accessKeyId = `GK${randomUUID().replaceAll('-', '').slice(0, 24)}`;
        keys.set(accessKeyId, { bucketId, write });
        return Promise.resolve({ accessKeyId, secretAccessKey: 'secret-'.padEnd(64, 'x') });
      });
      vi.spyOn(garage, 'deleteKey').mockImplementation((id) => {
        keys.delete(id);
        return Promise.resolve();
      });
    }
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
      await prisma.cloudTeam.deleteMany({ where: { slug: `s-${tag}` } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
  });

  it('makes buckets with quotas and keys of their own, and deletes them', async () => {
    const server = app.getHttpServer();
    const login = await request(server).post('/v1/auth/login').send(owner).expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
    await request(server)
      .post('/v1/cloud/teams')
      .set(auth)
      .send({ name: 'Files', slug: `s-${tag}`, ...terms })
      .expect(201);
    const projectId = (
      await request(server)
        .post(`/v1/cloud/teams/s-${tag}/projects`)
        .set(auth)
        .send({ name: 'App', slug: `sp-${tag}` })
        .expect(201)
    ).body.id as string;
    const base = `/v1/cloud/projects/${projectId}/buckets`;

    await request(server).post(base).set(auth).send({ name: 'Bad_Name' }).expect(400);
    const bucket = await request(server)
      .post(base)
      .set(auth)
      .send({ name: `media-${tag}` })
      .expect(201);
    expect(bucket.body).toMatchObject({
      name: `media-${tag}`,
      endpoint: 'https://s3.cloud.test',
      region: 'garage',
      sizeBytes: 0,
      objects: 0,
      maxBytes: 1024 * 1024 * 1024,
      keys: [],
    });
    // Names are unique across Cloud.
    await request(server)
      .post(base)
      .set(auth)
      .send({ name: `media-${tag}` })
      .expect(409);
    await request(server)
      .post(base)
      .set(auth)
      .send({ name: `backups-${tag}` })
      .expect(201);
    // The free plan has two buckets per project.
    await request(server)
      .post(base)
      .set(auth)
      .send({ name: `third-${tag}` })
      .expect(409);

    const key = await request(server)
      .post(`${base}/${bucket.body.id as string}/keys`)
      .set(auth)
      .send({ name: 'uploader', write: true })
      .expect(201);
    expect(key.body).toMatchObject({ name: 'uploader', write: true });
    expect(key.body.accessKeyId).toMatch(/^GK/);
    expect(key.body.secretAccessKey.length).toBeGreaterThan(20);
    const list = await request(server).get(base).set(auth).expect(200);
    expect(list.body.configured).toBe(true);
    expect(list.body.items[0].keys).toEqual([
      expect.not.objectContaining({ secretAccessKey: expect.anything() }),
    ]);

    // A bucket with objects can't be deleted.
    const row = await prisma.cloudBucket.findUniqueOrThrow({ where: { id: bucket.body.id } });
    if (!realGarage) {
      buckets.get(row.garageId)!.objects = 3;
      await request(server).delete(`${base}/${row.id}`).set(auth).expect(409);
      buckets.get(row.garageId)!.objects = 0;
    }

    await request(server)
      .delete(`${base}/${row.id}/keys/${key.body.id as string}`)
      .set(auth)
      .expect(204);
    await request(server).delete(`${base}/${row.id}`).set(auth).expect(204);
    const left = await request(server).get(base).set(auth).expect(200);
    expect(left.body.items.map((b: { name: string }) => b.name)).toEqual([`backups-${tag}`]);
    await request(server)
      .delete(`${base}/${left.body.items[0].id as string}`)
      .set(auth)
      .expect(204);
    // The fake saw every key deleted (a real Garage was checked by the API's answers).
    expect(realGarage ? 0 : keys.size).toBe(0);
  });
});
