import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AppConfigService } from '../src/config/app-config.service.js';
import { Role } from '../src/generated/prisma/client.js';
import { CLOUD_TERMS_VERSION } from '../src/modules/cloud/cloud-plans.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'cloud-bypass-password-1';
const owner = { email: `e2e-cb-owner-${tag}@codeqlick.test`, password };
const adminUser = { email: `e2e-cb-admin-${tag}@codeqlick.test`, password };
const member = { email: `e2e-cb-member-${tag}@codeqlick.test`, password };
const terms = { acceptTerms: true, termsVersion: CLOUD_TERMS_VERSION };
const KEY = 'ab'.repeat(32);
const SITE_PASSWORD = 'show-the-client-1';
const SHORT_ID = 'a1b2c3d4';

describe('Codeqlick Cloud protection bypass for automation (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'cq-cloud-bypass-'));
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const config = app.get(AppConfigService);
    vi.spyOn(config, 'cloudHosting', 'get').mockReturnValue({ domain: 'cloud.test', root });
    vi.spyOn(config, 'cloudProtectionKey', 'get').mockReturnValue(KEY);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const registeredAt = new Date();
    for (const [user, name] of [
      [owner, 'Ada'],
      [adminUser, 'Luis'],
      [member, 'Grace'],
    ] as const) {
      await prisma.user.create({
        data: { email: user.email, name, role: Role.CLIENT, passwordHash, registeredAt },
      });
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cloudTeam.deleteMany({ where: { slug: { startsWith: `bt-${tag}` } } });
      await prisma.cloudProject.deleteMany({ where: { slug: { startsWith: `bp-${tag}` } } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('creates, uses, replaces and revokes the bypass token', async () => {
    const server = app.getHttpServer();
    const bearer = async (user: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`,
    });
    const ownerAuth = await bearer(owner);
    const adminAuth = await bearer(adminUser);
    const memberAuth = await bearer(member);
    const teamSlug = `bt-${tag}`;
    const slug = `bp-${tag}`;

    const team = await request(server)
      .post('/v1/cloud/teams')
      .set(ownerAuth)
      .send({ name: 'Bypass', slug: teamSlug, ...terms })
      .expect(201);
    for (const [user, role] of [
      [adminUser, 'ADMIN'],
      [member, 'MEMBER'],
    ] as const) {
      const row = await prisma.user.findUniqueOrThrow({ where: { email: user.email } });
      await prisma.cloudMember.create({
        data: {
          teamId: team.body.id as string,
          userId: row.id,
          role,
          termsVersion: CLOUD_TERMS_VERSION,
          termsAcceptedAt: new Date(),
        },
      });
    }
    const project = await request(server)
      .post(`/v1/cloud/teams/${teamSlug}/projects`)
      .set(ownerAuth)
      .send({ name: 'Bypass project', slug })
      .expect(201);
    const projectId = project.body.id as string;
    await prisma.cloudDeployment.create({
      data: { projectId, shortId: SHORT_ID, target: 'PREVIEW', sizeBytes: 10n, fileCount: 1 },
    });
    const base = `/v1/cloud/projects/${projectId}/protection`;
    const previewHost = `${slug}--${SHORT_ID}.cloud.test`;
    const productionHost = `${slug}.cloud.test`;
    const check = (
      host: string,
      kind: 'previews' | 'production',
      bypass?: string,
      ip = '198.51.100.7',
    ) =>
      request(server)
        .get('/v1/cloud/edge/check')
        .set({
          'X-Cq-Protection-Key': KEY,
          'X-Cq-Host': host,
          'X-Cq-Project': slug,
          'X-Cq-Kind': kind,
          'X-Real-IP': ip,
          ...(bypass === undefined ? {} : { 'X-Cq-Bypass': bypass }),
        });
    const events = (action: string) =>
      prisma.cloudEvent.findMany({ where: { teamId: team.body.id as string, action } });

    // An API token of the team, read-only or not (login happens once per user).
    const makeToken = async (readOnly: boolean) =>
      `Bearer ${
        (
          await request(server)
            .post('/v1/cloud/tokens')
            .set(ownerAuth)
            .send({ name: readOnly ? 'Reader' : 'CI', teamSlug, expiresInDays: 30, readOnly })
            .expect(201)
        ).body.token as string
      }`;
    const writerToken = { Authorization: await makeToken(false) };
    const readerToken = { Authorization: await makeToken(true) };

    // ── Nothing set yet; only admins create it ─────────────────────────────────────────────
    expect((await request(server).get(base).set(memberAuth).expect(200)).body.bypass).toBeNull();
    await request(server).post(`${base}/bypass`).set(memberAuth).expect(403);
    await request(server).delete(`${base}/bypass`).set(memberAuth).expect(403);
    await request(server).post(`${base}/bypass`).set(readerToken).expect(403);
    await request(server).delete(`${base}/bypass`).set(readerToken).expect(403);
    await request(server).post(`${base}/bypass`).expect(401);
    // Revoking when there is none is fine.
    await request(server).delete(`${base}/bypass`).set(adminAuth).expect(204);
    expect(await events('project.protection_bypass_revoked')).toHaveLength(0);

    await request(server)
      .put(base)
      .set(adminAuth)
      .send({ mode: 'ALL', password: SITE_PASSWORD })
      .expect(200);

    // ── Create ─────────────────────────────────────────────────────────────────────────────
    const created = await request(server).post(`${base}/bypass`).set(adminAuth).expect(200);
    const token = created.body.token as string;
    expect(token).toMatch(/^cqb_[\w-]{43}$/);
    expect(created.body.prefix).toBe(token.slice(0, 12));
    expect(created.body.createdAt).toEqual(expect.any(String));
    const stored = await prisma.cloudProject.findUniqueOrThrow({ where: { id: projectId } });
    expect(stored.protectionBypassHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(stored)).not.toContain(token);

    const viewed = await request(server).get(base).set(memberAuth).expect(200);
    expect(viewed.body.bypass).toEqual({
      prefix: token.slice(0, 12),
      createdAt: created.body.createdAt,
      createdBy: { id: expect.any(String), name: 'Luis' },
      lastUsedAt: null,
    });
    expect(JSON.stringify(viewed.body)).not.toContain(token);
    expect(JSON.stringify(viewed.body)).not.toContain(stored.protectionBypassHash!);
    const createdEvents = await events('project.protection_bypass_created');
    expect(createdEvents).toHaveLength(1);
    expect(createdEvents[0]).toMatchObject({ targetLabel: slug, details: { replaced: false } });
    expect(JSON.stringify(createdEvents[0])).not.toContain(token);

    // ── The edge check ─────────────────────────────────────────────────────────────────────
    await check(previewHost, 'previews').expect(401);
    await check(productionHost, 'production').expect(401);
    await check(previewHost, 'previews', token).expect(204);
    await check(productionHost, 'production', token).expect(204);
    await check(previewHost, 'previews', `${token}x`).expect(401);
    await check(previewHost, 'previews', 'x'.repeat(201)).expect(401);
    // The key is still required.
    await check(previewHost, 'previews', token)
      .set('X-Cq-Protection-Key', 'cd'.repeat(32))
      .expect(403);
    // Its last use is stamped (once; the next calls within a minute don't write again).
    const used = await prisma.cloudProject.findUniqueOrThrow({ where: { id: projectId } });
    expect(used.protectionBypassLastUsedAt).toBeInstanceOf(Date);
    const first = used.protectionBypassLastUsedAt!.getTime();
    await check(previewHost, 'previews', token).expect(204);
    expect(
      (
        await prisma.cloudProject.findUniqueOrThrow({ where: { id: projectId } })
      ).protectionBypassLastUsedAt!.getTime(),
    ).toBe(first);
    expect((await request(server).get(base).set(memberAuth).expect(200)).body.bypass).toMatchObject(
      { lastUsedAt: new Date(first).toISOString() },
    );

    // ── Wrong tokens: 10 a minute per IP, then that IP's header is ignored ──────────────────
    for (let i = 0; i < 10; i += 1) {
      await check(previewHost, 'previews', `cqb_wrong${i}`, '198.51.100.50').expect(401);
    }
    await check(previewHost, 'previews', token, '198.51.100.50').expect(401);
    // Other addresses are not affected.
    await check(previewHost, 'previews', token, '198.51.100.51').expect(204);
    await check(previewHost, 'previews', token, '198.51.100.7').expect(204);

    // ── Changing the password or the mode doesn't touch it ─────────────────────────────────
    await request(server)
      .put(base)
      .set(adminAuth)
      .send({ mode: 'PREVIEWS', password: 'another-password-9' })
      .expect(200);
    await check(previewHost, 'previews', token).expect(204);
    // PREVIEWS leaves production open anyway (a marker may linger): through with or without.
    await check(productionHost, 'production').expect(204);
    // OFF keeps the token, harmless meanwhile and valid again once protection is back on.
    await request(server).put(base).set(adminAuth).send({ mode: 'OFF' }).expect(200);
    expect((await request(server).get(base).set(memberAuth).expect(200)).body.bypass).toMatchObject(
      { prefix: token.slice(0, 12) },
    );
    await check(previewHost, 'previews').expect(204);
    await request(server)
      .put(base)
      .set(adminAuth)
      .send({ mode: 'ALL', password: SITE_PASSWORD })
      .expect(200);
    await check(productionHost, 'production').expect(401);
    await check(productionHost, 'production', token).expect(204);

    // ── Replace: the old token stops at once; an API token may do it ────────────────────────
    const replaced = await request(server).post(`${base}/bypass`).set(writerToken).expect(200);
    const second = replaced.body.token as string;
    expect(second).not.toBe(token);
    await check(previewHost, 'previews', token).expect(401);
    await check(previewHost, 'previews', second).expect(204);
    expect((await events('project.protection_bypass_created')).map((e) => e.details)).toEqual(
      expect.arrayContaining([{ replaced: false }, { replaced: true }]),
    );
    expect((await request(server).get(base).set(memberAuth).expect(200)).body.bypass).toMatchObject(
      { prefix: second.slice(0, 12), lastUsedAt: expect.any(String) },
    );

    // ── Suspended: creating is refused, revoking is allowed ────────────────────────────────
    await prisma.cloudProject.update({
      where: { id: projectId },
      data: { suspendedAt: new Date(), suspendedReason: 'test' },
    });
    await request(server).post(`${base}/bypass`).set(adminAuth).expect(403);
    await request(server).delete(`${base}/bypass`).set(adminAuth).expect(204);
    await prisma.cloudProject.update({
      where: { id: projectId },
      data: { suspendedAt: null, suspendedReason: null },
    });

    // ── Revoked ────────────────────────────────────────────────────────────────────────────
    expect((await request(server).get(base).set(memberAuth).expect(200)).body.bypass).toBeNull();
    await check(previewHost, 'previews', second).expect(401);
    expect(await events('project.protection_bypass_revoked')).toHaveLength(1);

    // Without CLOUD_PROTECTION_KEY it can't be created.
    const config = app.get(AppConfigService);
    vi.spyOn(config, 'cloudProtectionKey', 'get').mockReturnValue(undefined);
    await request(server).post(`${base}/bypass`).set(adminAuth).expect(503);
  });
});
