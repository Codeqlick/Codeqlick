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
import { signCommentToken } from '../src/modules/cloud/cloud-comments.js';
import { CLOUD_TERMS_VERSION } from '../src/modules/cloud/cloud-plans.js';
import { protectionKey as deriveKey } from '../src/modules/cloud/cloud-protection.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'cloud-comments-password-1';
const owner = { email: `e2e-cc-owner-${tag}@codeqlick.test`, password };
const adminUser = { email: `e2e-cc-admin-${tag}@codeqlick.test`, password };
const member = { email: `e2e-cc-member-${tag}@codeqlick.test`, password };
const outsider = { email: `e2e-cc-outsider-${tag}@codeqlick.test`, password };
const terms = { acceptTerms: true, termsVersion: CLOUD_TERMS_VERSION };
const KEY = 'cd'.repeat(32);
const SHORT_ID = 'c0ffee12';

describe('Codeqlick Cloud preview comments (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let root: string;
  const sent: MailMessage[] = [];

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'cq-cloud-comments-'));
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const config = app.get(AppConfigService);
    vi.spyOn(config, 'cloudHosting', 'get').mockReturnValue({ domain: 'cloud.test', root });
    vi.spyOn(config, 'cloudProtectionKey', 'get').mockReturnValue(KEY);
    vi.spyOn(app.get(MailService), 'send').mockImplementation((message: MailMessage) => {
      sent.push(message);
      return Promise.resolve();
    });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    for (const [user, name] of [
      [owner, 'Ada'],
      [adminUser, 'Luis'],
      [member, 'Grace'],
      [outsider, 'Eve'],
    ] as const) {
      await prisma.user.create({
        data: {
          email: user.email,
          name,
          role: Role.CLIENT,
          passwordHash,
          registeredAt: new Date(),
        },
      });
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cloudTeam.deleteMany({ where: { slug: { startsWith: `ct-${tag}` } } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('pins threads on previews only, with mentions, resolving and a scoped token', async () => {
    const server = app.getHttpServer();
    const bearer = async (user: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`,
    });
    const ownerAuth = await bearer(owner);
    const memberAuth = await bearer(member);
    const outsiderAuth = await bearer(outsider);
    const teamSlug = `ct-${tag}`;
    const slug = `cp-${tag}`;

    const team = await request(server)
      .post('/v1/cloud/teams')
      .set(ownerAuth)
      .send({ name: 'Comments', slug: teamSlug, ...terms })
      .expect(201);
    const teamId = team.body.id as string;
    const ids: Record<string, string> = {};
    for (const [user, role] of [
      [adminUser, 'ADMIN'],
      [member, 'MEMBER'],
    ] as const) {
      const row = await prisma.user.findUniqueOrThrow({ where: { email: user.email } });
      await prisma.cloudMember.create({
        data: {
          teamId,
          userId: row.id,
          role,
          termsVersion: CLOUD_TERMS_VERSION,
          termsAcceptedAt: new Date(),
        },
      });
    }
    for (const user of [owner, adminUser, member, outsider]) {
      ids[user.email] = (await prisma.user.findUniqueOrThrow({ where: { email: user.email } })).id;
    }
    const projectId = (
      await request(server)
        .post(`/v1/cloud/teams/${teamSlug}/projects`)
        .set(ownerAuth)
        .send({ name: 'Shop', slug })
        .expect(201)
    ).body.id as string;
    const deployment = await prisma.cloudDeployment.create({
      data: { projectId, shortId: SHORT_ID, target: 'PREVIEW', sizeBytes: 10n, fileCount: 1 },
    });
    const previewHost = `${slug}--${SHORT_ID}.cloud.test`;
    const productionHost = `${slug}.cloud.test`;
    const base = `/v1/cloud/projects/${projectId}/comments`;

    // ── The console opens a session: signed-in people only, members of the team ─────────────
    await request(server)
      .post(`${base}/session`)
      .set({ Authorization: `Bearer cqk_${'a'.repeat(43)}` })
      .send({ deploymentId: deployment.id })
      .expect(401);
    await request(server)
      .post(`${base}/session`)
      .set(outsiderAuth)
      .send({ deploymentId: deployment.id })
      .expect(404);
    await request(server)
      .post(`${base}/session`)
      .set(memberAuth)
      .send({ deploymentId: randomUUID() })
      .expect(404);
    const session = await request(server)
      .post(`${base}/session`)
      .set(memberAuth)
      .send({ deploymentId: deployment.id, path: '/shop' })
      .expect(200);
    const url = new URL(session.body.url as string);
    expect(`${url.origin}${url.pathname}${url.search}`).toBe(
      `https://${previewHost}/__codeqlick/comments?path=%2Fshop`,
    );
    const token = decodeURIComponent(url.hash.replace('#token=', ''));
    const expiresIn = Date.parse(session.body.expiresAt as string) - Date.now();
    expect(expiresIn).toBeGreaterThan(7_100_000);
    expect(expiresIn).toBeLessThanOrEqual(7_200_000);

    const nginx = (host: string, kind: string) => ({
      'X-Cq-Protection-Key': KEY,
      'X-Cq-Host': host,
      'X-Cq-Project': slug,
      'X-Cq-Kind': kind,
    });
    const overlay = { ...nginx(previewHost, 'previews'), 'X-Codeqlick-Comments': token };
    const api = '/v1/cloud/protection/comments/api';

    // ── The page: previews only, its own strict headers, nothing for production ─────────────
    const page = await request(server)
      .get('/v1/cloud/protection/comments?path=/shop')
      .set(nginx(previewHost, 'previews'))
      .expect(200);
    expect(page.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(page.headers['cache-control']).toBe('no-store');
    expect(page.text).toContain('/__codeqlick/comments/overlay.js');
    await request(server)
      .get('/v1/cloud/protection/comments')
      .set(nginx(productionHost, 'production'))
      .expect(404);
    await request(server)
      .get('/v1/cloud/protection/comments')
      .set({ ...nginx(previewHost, 'previews'), 'X-Cq-Protection-Key': 'ef'.repeat(32) })
      .expect(403);
    const script = await request(server).get('/v1/cloud/comments/overlay.js').expect(200);
    expect(script.headers['content-type']).toContain('javascript');

    // ── The token: only Nginx, only previews, only its own address, only while valid ────────
    await request(server)
      .get(`${api}/me`)
      .set({ ...overlay, ...nginx(productionHost, 'production') })
      .expect(404);
    await request(server)
      .get(`${api}/me`)
      .set({ ...overlay, 'X-Cq-Host': `${slug}--00000000.cloud.test` })
      .expect(401);
    await request(server)
      .get(`${api}/me`)
      .set({ ...overlay, 'X-Codeqlick-Comments': '' })
      .expect(401);
    await request(server)
      .get(`${api}/me`)
      .set({ ...overlay, 'X-Cq-Protection-Key': 'ef'.repeat(32) })
      .expect(403);
    const commentsKey = deriveKey(app.get(AppConfigService).credentialsSecret, 'cloud-comments-v1');
    const expired = signCommentToken(
      commentsKey,
      {
        userId: ids[member.email]!,
        projectId,
        deploymentId: deployment.id,
        expiresAt: Math.floor(Date.now() / 1000) - 1,
      },
      previewHost,
    );
    await request(server)
      .get(`${api}/me`)
      .set({ ...overlay, 'X-Codeqlick-Comments': expired })
      .expect(401);
    // An outsider's well-signed token is still refused: not a member.
    const foreign = signCommentToken(
      commentsKey,
      {
        userId: ids[outsider.email]!,
        projectId,
        deploymentId: deployment.id,
        expiresAt: Math.floor(Date.now() / 1000) + 600,
      },
      previewHost,
    );
    await request(server)
      .get(`${api}/me`)
      .set({ ...overlay, 'X-Codeqlick-Comments': foreign })
      .expect(404);

    const me = await request(server).get(`${api}/me`).set(overlay).expect(200);
    expect(me.body).toMatchObject({
      user: { id: ids[member.email], name: 'Grace' },
      admin: false,
      project: { name: 'Shop', slug },
      deployment: { id: deployment.id, shortId: SHORT_ID },
    });
    expect((me.body.members as Array<{ name: string }>).map((m) => m.name).toSorted()).toEqual([
      'Ada',
      'Grace',
      'Luis',
    ]);

    // ── A thread, mentioning the admin, the author and an outsider ──────────────────────────
    await request(server)
      .post(`${api}/threads`)
      .set(overlay)
      .send({ path: '//evil.test', x: 1, y: 1, body: 'x' })
      .expect(400);
    const created = await request(server)
      .post(`${api}/threads`)
      .set(overlay)
      .send({
        path: '/shop',
        x: 12.5,
        y: 40,
        selector: 'main > h1:nth-of-type(1)',
        viewportWidth: 390,
        body: 'The title is cut @Luis',
        mentions: [ids[adminUser.email], ids[member.email], ids[outsider.email]],
      })
      .expect(201);
    expect(created.body).toMatchObject({
      deploymentId: deployment.id,
      deploymentShort: SHORT_ID,
      path: '/shop',
      x: 12.5,
      y: 40,
      viewportWidth: 390,
      resolvedAt: null,
      comments: [
        {
          body: 'The title is cut @Luis',
          author: { id: ids[member.email], name: 'Grace' },
          mentions: [{ id: ids[adminUser.email], name: 'Luis' }],
        },
      ],
    });
    const threadId = created.body.id as string;
    expect(sent.map((m) => m.to)).toEqual([adminUser.email]);
    expect(sent[0]!.subject).toBe('Grace mentioned you on Shop');
    expect(sent[0]!.text).toContain('The title is cut @Luis');
    expect(sent[0]!.text).toContain(`/console/${teamSlug}/${slug}?tab=comments`);

    // ── The console: the inbox, a reply with a mention, resolve and reopen ──────────────────
    const inbox = await request(server).get(base).set(ownerAuth).expect(200);
    expect(inbox.body.open).toBe(1);
    expect(inbox.body.items).toHaveLength(1);
    const reply = await request(server)
      .post(`${base}/${threadId}/comments`)
      .set(ownerAuth)
      .send({ body: 'Fixed in the next deploy @Grace', mentions: [ids[member.email]] })
      .expect(201);
    expect(reply.body.mentions).toEqual([{ id: ids[member.email], name: 'Grace' }]);
    expect(sent.map((m) => m.to)).toEqual([adminUser.email, member.email]);

    const resolved = await request(server)
      .patch(`${api}/threads/${threadId}`)
      .set(overlay)
      .send({ resolved: true })
      .expect(200);
    expect(resolved.body.resolvedBy).toEqual({ id: ids[member.email], name: 'Grace' });
    expect((await request(server).get(base).set(ownerAuth).expect(200)).body).toMatchObject({
      open: 0,
      items: [],
    });
    expect(
      (await request(server).get(`${base}?status=resolved`).set(ownerAuth).expect(200)).body.items,
    ).toHaveLength(1);
    await request(server)
      .patch(`${base}/${threadId}`)
      .set(ownerAuth)
      .send({ resolved: false })
      .expect(200);

    const threads = await request(server).get(`${api}/threads`).set(overlay).expect(200);
    expect(threads.body.items[0].comments).toHaveLength(2);

    // ── Deleting: the author or an admin ────────────────────────────────────────────────────
    const ownerComment = reply.body.id as string;
    await request(server)
      .delete(`${api}/threads/${threadId}/comments/${ownerComment}`)
      .set(overlay)
      .expect(403);
    const firstComment = created.body.comments[0].id as string;
    await request(server)
      .delete(`${base}/${threadId}/comments/${firstComment}`)
      .set(ownerAuth)
      .expect(204);
    await request(server)
      .delete(`${base}/${threadId}/comments/${ownerComment}`)
      .set(ownerAuth)
      .expect(204);
    // The last comment took the thread with it.
    expect(await prisma.cloudCommentThread.count({ where: { id: threadId } })).toBe(0);

    const actions = (
      await prisma.cloudEvent.findMany({ where: { teamId, action: { startsWith: 'comment.' } } })
    ).map((e) => e.action);
    expect(actions.toSorted()).toEqual([
      'comment.created',
      'comment.created',
      'comment.deleted',
      'comment.deleted',
      'comment.reopened',
      'comment.resolved',
    ]);

    // ── Protected previews: the session goes through the members' ticket, then the page ─────
    await request(server)
      .put(`/v1/cloud/projects/${projectId}/protection`)
      .set(ownerAuth)
      .send({ mode: 'PREVIEWS', password: 'show-the-client-1' })
      .expect(200);
    const guarded = await request(server)
      .post(`${base}/session`)
      .set(memberAuth)
      .send({ deploymentId: deployment.id })
      .expect(200);
    const enter = new URL(guarded.body.url as string);
    expect(enter.pathname).toBe('/__codeqlick/enter');
    expect(enter.searchParams.get('next')).toBe('/__codeqlick/comments?path=%2F');
    const entered = await request(server)
      .get(`/v1/cloud/protection/enter${enter.search}`)
      .set(nginx(previewHost, 'previews'))
      .expect(303);
    expect(entered.headers.location).toBe('/__codeqlick/comments?path=%2F');

    // ── A member who leaves loses the overlay at once; the project takes its threads along ──
    await request(server)
      .post(`${api}/threads`)
      .set(overlay)
      .send({ path: '/', x: 1, y: 1, body: 'Before leaving' })
      .expect(201);
    await prisma.cloudMember.deleteMany({ where: { teamId, userId: ids[member.email] } });
    await request(server).get(`${api}/threads`).set(overlay).expect(404);
    await request(server).delete(`/v1/cloud/projects/${projectId}`).set(ownerAuth).expect(204);
    expect(await prisma.cloudCommentThread.count({ where: { projectId } })).toBe(0);
  });
});
