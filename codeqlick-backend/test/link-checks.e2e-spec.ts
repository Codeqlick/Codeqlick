import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// The external sites the links point at: what they answer is up to the test (no network). The
// address checks stay the real ones.
const fetched = vi.hoisted(() => [] as { url: string; method?: string; userAgent?: string }[]);
vi.mock('../src/modules/site-audits/safe-fetch.js', async (original) => {
  const actual = await original<typeof import('../src/modules/site-audits/safe-fetch.js')>();
  return {
    ...actual,
    safeFetch: vi.fn((url: string, options: { method?: string; userAgent?: string } = {}) => {
      fetched.push({ url, method: options.method, userAgent: options.userAgent });
      return Promise.resolve({
        url,
        status: url.includes('gone') ? 404 : 200,
        headers: {},
        body: '',
        bytes: 0,
        truncated: false,
        ttfbMs: 20,
        redirects: [],
        certificateValidTo: null,
      });
    }),
  };
});

const { AppModule } = await import('../src/app.module.js');
const { configureApp } = await import('../src/app.setup.js');
const { AppConfigService } = await import('../src/config/app-config.service.js');
const { Role } = await import('../src/generated/prisma/client.js');
const { LinkChecksService } = await import('../src/modules/link-checks/link-checks.service.js');
const { SETTINGS_KEY } = await import('../src/modules/link-checks/link-checks.repository.js');
const { PrismaService } = await import('../src/prisma/prisma.service.js');

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'links-pass-1234';
const admin = { email: `e2e-links-${tag}@codeqlick.test`, password };
const client = { email: `e2e-links-client-${tag}@codeqlick.test`, password };
const postSlug = `e2e-links-${tag}`;
const caseSlug = `e2e-links-case-${tag}`;
const missingSlug = `e2e-links-missing-${tag}`;
const GONE = `https://gone-${tag}.example/page`;

interface LinkItem {
  id: string;
  url: string;
  internal: boolean;
  status: 'OK' | 'BROKEN';
  statusCode: number | null;
  error: string | null;
  failures: number;
  brokenSince: string | null;
  checkedAt: string;
  source: { type: string; id: string; slug: string; title: string; locale: string };
}

describe('Broken links (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: InstanceType<typeof PrismaService>;
  let postId = '';
  let caseId = '';
  // Relative links are resolved against the website's address.
  let siteUrl = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    siteUrl = app.get(AppConfigService).siteUrl;
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.create({
      data: { email: admin.email, name: 'A', role: Role.ADMIN, passwordHash },
    });
    await prisma.user.create({
      data: { email: client.email, name: 'C', role: Role.CLIENT, passwordHash },
    });

    const publishedAt = new Date(Date.now() - 60_000);
    // A case study in English only.
    caseId = (
      await prisma.portfolioItem.create({
        data: {
          slug: caseSlug,
          status: 'PUBLISHED',
          publishedAt,
          translations: {
            create: [{ locale: 'EN', title: 'Case', summary: 'S', content: 'Back [home](/en).' }],
          },
        },
      })
    ).id;
    postId = (
      await prisma.post.create({
        data: {
          slug: postSlug,
          status: 'PUBLISHED',
          publishedAt,
          translations: {
            create: [
              {
                locale: 'EN',
                title: `Links ${tag}`,
                excerpt: 'E',
                content: [
                  `Our [case](/en/work/${caseSlug}), a [missing post](/en/blog/${missingSlug}),`,
                  `[a gone site](${GONE}) and [the same, further down](${GONE}#more).`,
                  '',
                  '```',
                  '[in code](/en/nowhere)',
                  '```',
                ].join('\n'),
              },
              {
                locale: 'ES',
                title: `Enlaces ${tag}`,
                excerpt: 'E',
                // The case study has no Spanish: the website shows its English instead.
                content: `Nuestro [caso](/es/work/${caseSlug}).`,
              },
            ],
          },
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.linkCheck.deleteMany({ where: { sourceId: { in: [postId, caseId] } } });
      await prisma.post.deleteMany({ where: { slug: { in: [postSlug, missingSlug] } } });
      await prisma.portfolioItem.deleteMany({ where: { slug: caseSlug } });
      // The run's times: the next test run (and any app on this database) starts afresh.
      await prisma.setting.deleteMany({ where: { key: SETTINGS_KEY } });
      await prisma.user.deleteMany({ where: { email: { in: [admin.email, client.email] } } });
    }
    await app?.close();
  });

  it('checks the links of the published content and lists the broken ones', async () => {
    const server = app.getHttpServer();
    const login = async (who: typeof admin) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(who).expect(200)).body.accessToken as string}`,
    });
    const auth = await login(admin);
    const clientAuth = await login(client);

    await request(server).get('/v1/admin/links').expect(401);
    await request(server).get('/v1/admin/links').set(clientAuth).expect(403);
    await request(server).get('/v1/admin/links?status=nope').set(auth).expect(400);

    // The weekly run (off in tests): every link checked once.
    // No pacing: other files' leftover content may hold more links (all answered by the mock).
    const summary = await app.get(LinkChecksService).runFull(new Date(), { intervalMs: 0 });
    expect(summary).not.toBeNull();
    // The gone site is requested once (HEAD, as the link check), whatever its fragment.
    const gone = fetched.filter((call) => call.url.startsWith(`https://gone-${tag}.example`));
    expect(gone).toEqual([
      {
        url: GONE,
        method: 'HEAD',
        userAgent: 'CodeqlickLinkCheck/1 (+https://codeqlick.com)',
      },
    ]);

    const all = await request(server).get('/v1/admin/links?status=all').set(auth).expect(200);
    expect(typeof all.body.lastRunAt).toBe('string');
    const mine = (all.body.items as LinkItem[]).filter(
      (item) => item.source.id === postId || item.source.id === caseId,
    );
    const byUrl = (url: string, locale = 'en') =>
      mine.find((item) => item.url === url && item.source.locale === locale);
    expect(mine).toHaveLength(6);
    expect(mine.some((item) => item.url.includes('nowhere'))).toBe(false);

    expect(byUrl(`${siteUrl}/en/work/${caseSlug}`)).toMatchObject({
      internal: true,
      status: 'OK',
      failures: 0,
      source: { type: 'POST', id: postId, slug: postSlug, title: `Links ${tag}`, locale: 'en' },
    });
    expect(byUrl(`${siteUrl}/en`)).toMatchObject({
      status: 'OK',
      source: { type: 'PORTFOLIO', id: caseId, slug: caseSlug, title: 'Case', locale: 'en' },
    });
    // Failed once: not broken yet.
    const missing = byUrl(`${siteUrl}/en/blog/${missingSlug}`)!;
    expect(missing).toMatchObject({
      internal: true,
      status: 'OK',
      statusCode: 404,
      failures: 1,
      brokenSince: null,
    });
    expect(byUrl(`${siteUrl}/es/work/${caseSlug}`, 'es')).toMatchObject({
      status: 'OK',
      statusCode: 200,
      failures: 0,
      source: { title: `Enlaces ${tag}`, locale: 'es' },
    });
    const goneLink = byUrl(GONE)!;
    expect(goneLink).toMatchObject({ internal: false, statusCode: 404, failures: 1 });
    expect(byUrl(`${GONE}#more`)).toMatchObject({ internal: false, failures: 1 });

    // Not broken yet: not in the default list.
    const before = await request(server).get('/v1/admin/links').set(auth).expect(200);
    expect((before.body.items as LinkItem[]).some((item) => item.source.id === postId)).toBe(false);

    // "Check again": the second failure in a row makes it broken.
    const checked = await request(server)
      .post(`/v1/admin/links/${missing.id}/check`)
      .set(auth)
      .expect(200);
    expect(checked.body).toMatchObject({
      id: missing.id,
      status: 'BROKEN',
      statusCode: 404,
      failures: 2,
      source: { type: 'POST', id: postId, locale: 'en' },
    });
    expect(typeof checked.body.brokenSince).toBe('string');
    const brokenAt = checked.body.brokenSince as string;

    await request(server).post(`/v1/admin/links/${goneLink.id}/check`).set(auth).expect(200);

    const broken = await request(server).get('/v1/admin/links').set(auth).expect(200);
    const brokenMine = (broken.body.items as LinkItem[]).filter(
      (item) => item.source.id === postId,
    );
    expect(brokenMine.map((item) => item.id).toSorted()).toEqual(
      [missing.id, goneLink.id].toSorted(),
    );
    expect((broken.body.items as LinkItem[]).every((item) => item.status === 'BROKEN')).toBe(true);

    const stats = await request(server).get('/v1/admin/stats').set(auth).expect(200);
    expect(stats.body.links.broken).toBeGreaterThanOrEqual(2);

    // Failing again keeps the date it broke; once the post exists, the link is OK at once.
    const again = await request(server)
      .post(`/v1/admin/links/${missing.id}/check`)
      .set(auth)
      .expect(200);
    expect(again.body).toMatchObject({ status: 'BROKEN', failures: 3, brokenSince: brokenAt });
    await prisma.post.create({
      data: {
        slug: missingSlug,
        status: 'PUBLISHED',
        publishedAt: new Date(Date.now() - 60_000),
        translations: {
          create: [{ locale: 'EN', title: 'Now here', excerpt: 'E', content: 'Hi' }],
        },
      },
    });
    const fixed = await request(server)
      .post(`/v1/admin/links/${missing.id}/check`)
      .set(auth)
      .expect(200);
    expect(fixed.body).toMatchObject({
      status: 'OK',
      statusCode: 200,
      failures: 0,
      brokenSince: null,
    });

    await request(server).post(`/v1/admin/links/${missing.id}/check`).set(clientAuth).expect(403);
    await request(server).post(`/v1/admin/links/${randomUUID()}/check`).set(auth).expect(404);

    // Unpublished, its links are neither listed, counted nor checked again (the rows stay until
    // the next run); published again, they are back.
    const shownStats = await request(server).get('/v1/admin/stats').set(auth).expect(200);
    const brokenBefore = shownStats.body.links.broken as number;
    await prisma.post.update({ where: { id: postId }, data: { status: 'DRAFT' } });
    const hidden = await request(server).get('/v1/admin/links?status=all').set(auth).expect(200);
    expect((hidden.body.items as LinkItem[]).some((item) => item.source.id === postId)).toBe(false);
    const hiddenBroken = await request(server).get('/v1/admin/links').set(auth).expect(200);
    expect((hiddenBroken.body.items as LinkItem[]).some((item) => item.id === goneLink.id)).toBe(
      false,
    );
    const hiddenStats = await request(server).get('/v1/admin/stats').set(auth).expect(200);
    // The gone site is the post's only broken link left.
    expect(hiddenStats.body.links.broken).toBe(brokenBefore - 1);
    await request(server).post(`/v1/admin/links/${goneLink.id}/check`).set(auth).expect(404);
    expect(await prisma.linkCheck.count({ where: { sourceId: postId } })).toBe(5);
    await prisma.post.update({ where: { id: postId }, data: { status: 'PUBLISHED' } });
    const shown = await request(server).get('/v1/admin/links').set(auth).expect(200);
    expect((shown.body.items as LinkItem[]).some((item) => item.id === goneLink.id)).toBe(true);

    // Deleting the post deletes its links.
    await request(server).delete(`/v1/admin/posts/${postId}`).set(auth).expect(204);
    expect(await prisma.linkCheck.count({ where: { sourceId: postId } })).toBe(0);
    expect(await prisma.linkCheck.count({ where: { sourceId: caseId } })).toBe(1);
  });
});
