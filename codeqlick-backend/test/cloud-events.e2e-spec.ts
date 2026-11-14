import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Role } from '../src/generated/prisma/client.js';
import { CLOUD_TERMS_VERSION } from '../src/modules/cloud/cloud-plans.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: the export allows 10 an hour per IP.
const tag = randomUUID().slice(0, 8);
const password = 'cloud-events-password-1';
const owner = { email: `e2e-ce-owner-${tag}@codeqlick.test`, password };
const mate = { email: `e2e-ce-mate-${tag}@codeqlick.test`, password };
const terms = { acceptTerms: true, termsVersion: CLOUD_TERMS_VERSION };
const HEADER = '﻿date,actor,token,action,target,details,ip';
const BULK = 1_005;

const madridToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

describe('Codeqlick Cloud events: filters and CSV export (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const registeredAt = new Date();
    await prisma.user.create({
      data: { email: owner.email, name: 'Ada', role: Role.CLIENT, passwordHash, registeredAt },
    });
    await prisma.user.create({
      data: { email: mate.email, name: 'Grace', role: Role.CLIENT, passwordHash, registeredAt },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cloudTeam.deleteMany({ where: { slug: `ev-${tag}` } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
  });

  it('filters the list and exports it as CSV for admins', async () => {
    const server = app.getHttpServer();
    const bearer = async (user: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`,
    });
    /** A GET whose body comes back as raw bytes (the BOM included). */
    const download = (url: string, auth: Record<string, string>) =>
      request(server)
        .get(url)
        .set(auth)
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        });
    const ownerAuth = await bearer(owner);
    const mateAuth = await bearer(mate);
    const team = `ev-${tag}`;
    await request(server)
      .post('/v1/cloud/teams')
      .set(ownerAuth)
      .send({ name: 'Events', slug: team, ...terms })
      .expect(201);
    const teamRow = await prisma.cloudTeam.findUniqueOrThrow({ where: { slug: team } });
    const mateRow = await prisma.user.findUniqueOrThrow({ where: { email: mate.email } });
    await prisma.cloudMember.create({
      data: {
        teamId: teamRow.id,
        userId: mateRow.id,
        role: 'MEMBER',
        termsVersion: CLOUD_TERMS_VERSION,
        termsAcceptedAt: new Date(),
      },
    });

    // January 2026 (Madrid is UTC+1): a day starts at 23:00 UTC the day before.
    const base = { teamId: teamRow.id, actorName: 'Ada' };
    await prisma.cloudEvent.createMany({
      data: [
        // 9 January, 23:59 in Madrid.
        { ...base, action: 'member.invited', createdAt: new Date('2026-01-09T22:59:00Z') },
        // 10 January, 00:00 in Madrid.
        { ...base, action: 'domain.added', createdAt: new Date('2026-01-09T23:00:00Z') },
        {
          ...base,
          action: 'domain.added',
          targetLabel: 'shop.example',
          details: { name: 'shop.example' },
          ip: '203.0.113.9',
          createdAt: new Date('2026-01-10T10:00:00Z'),
        },
        // 11 January, 00:30 in Madrid; cells a spreadsheet would run.
        {
          ...base,
          actorName: '@evil',
          tokenName: 'CI',
          action: 'project.created',
          targetLabel: '=SUM(A1)',
          createdAt: new Date('2026-01-10T23:30:00Z'),
        },
        { ...base, action: 'domain.removed', createdAt: new Date('2026-01-20T12:00:00Z') },
      ],
    });
    // More than a page of the export, all at the same instant (the cursor falls back on ids).
    await prisma.cloudEvent.createMany({
      data: Array.from({ length: BULK }, () => ({
        ...base,
        action: 'monitor.updated',
        createdAt: new Date('2026-01-25T12:00:00Z'),
      })),
    });

    // ── The list ────────────────────────────────────────────────────────────────────────────
    const events = `/v1/cloud/teams/${team}/events`;
    const oneDay = await request(server)
      .get(`${events}?from=2026-01-10&to=2026-01-10`)
      .set(mateAuth);
    expect(oneDay.status).toBe(200);
    expect(oneDay.body.total).toBe(2);
    expect(oneDay.body.items.map((e: { createdAt: string }) => e.createdAt)).toEqual([
      '2026-01-10T10:00:00.000Z',
      '2026-01-09T23:00:00.000Z',
    ]);
    const prefix = await request(server).get(`${events}?action=domain.`).set(mateAuth);
    expect(prefix.status).toBe(200);
    expect(prefix.body.items.map((e: { action: string }) => e.action)).toEqual([
      'domain.removed',
      'domain.added',
      'domain.added',
    ]);
    const exact = await request(server)
      .get(`${events}?action=domain.added&from=2026-01-10`)
      .set(mateAuth);
    expect(exact.body.total).toBe(2);
    const everything = await request(server).get(events).set(mateAuth);
    expect(everything.body.total).toBe(5 + BULK + 1); // and team.created
    const badDate = await request(server).get(`${events}?from=2026-02-30`).set(mateAuth);
    expect(badDate.status).toBe(400);
    const tooLong = await request(server)
      .get(`${events}?from=2025-01-01&to=2026-01-31`)
      .set(mateAuth);
    expect(tooLong.status).toBe(400);

    // ── The export ──────────────────────────────────────────────────────────────────────────
    const csvUrl = `/v1/cloud/teams/${team}/events.csv`;
    const domains = await download(
      `${csvUrl}?from=2026-01-01&to=2026-01-31&action=domain.`,
      ownerAuth,
    );
    expect(domains.status).toBe(200);
    expect(domains.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(domains.headers['content-disposition']).toBe(
      `attachment; filename="${team}-events-2026-01-01-2026-01-31.csv"`,
    );
    const bytes = domains.body as Buffer;
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.toString('utf8').split('\r\n')).toEqual([
      HEADER,
      '2026-01-20T12:00:00.000Z,Ada,,domain.removed,,,',
      '2026-01-10T10:00:00.000Z,Ada,,domain.added,shop.example,"{""name"":""shop.example""}",203.0.113.9',
      '2026-01-09T23:00:00.000Z,Ada,,domain.added,,,',
      '',
    ]);

    const january = await download(`${csvUrl}?from=2026-01-01&to=2026-01-31`, ownerAuth);
    expect(january.status).toBe(200);
    const lines = (january.body as Buffer).toString('utf8').trimEnd().split('\r\n');
    expect(lines).toHaveLength(1 + 5 + BULK);
    expect(lines.filter((line) => line.includes('monitor.updated'))).toHaveLength(BULK);
    expect(lines).toContain("2026-01-10T23:30:00.000Z,'@evil,CI,project.created,'=SUM(A1),,");
    expect(lines.at(-1)).toBe('2026-01-09T22:59:00.000Z,Ada,,member.invited,,,');

    // By default, the last 30 days up to today (Madrid).
    const recent = await download(csvUrl, ownerAuth);
    expect(recent.status).toBe(200);
    const today = madridToday();
    const monthAgo = new Date(Date.parse(`${today}T12:00:00Z`) - 29 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(recent.headers['content-disposition']).toBe(
      `attachment; filename="${team}-events-${monthAgo}-${today}.csv"`,
    );
    const recentText = (recent.body as Buffer).toString('utf8');
    expect(recentText.startsWith(`${HEADER}\r\n`)).toBe(true);
    expect(recentText).toContain('team.created');
    expect(recentText).not.toContain('monitor.updated');

    // Members read the list but don't export it.
    const asMember = await request(server).get(csvUrl).set(mateAuth);
    expect(asMember.status).toBe(403);

    // A token works too.
    const token = await request(server)
      .post('/v1/cloud/tokens')
      .set(ownerAuth)
      .send({ name: 'CI', teamSlug: team, expiresInDays: 30 })
      .expect(201);
    const viaToken = await download(`${csvUrl}?from=2026-01-20&to=2026-01-20`, {
      Authorization: `Bearer ${token.body.token as string}`,
    });
    expect(viaToken.status).toBe(200);
    expect((viaToken.body as Buffer).toString('utf8')).toBe(
      `${HEADER}\r\n2026-01-20T12:00:00.000Z,Ada,,domain.removed,,,\r\n`,
    );

    // Bad dates and periods.
    const reversed = await request(server)
      .get(`${csvUrl}?from=2026-01-31&to=2026-01-01`)
      .set(ownerAuth);
    expect(reversed.status).toBe(400);
    const overAYear = await request(server)
      .get(`${csvUrl}?from=2025-01-01&to=2026-01-31`)
      .set(ownerAuth);
    expect(overAYear.status).toBe(400);

    // Exporting isn't an event.
    const after = await request(server).get(`${events}?action=team.`).set(ownerAuth);
    expect(after.body.items.map((e: { action: string }) => e.action)).toEqual(['team.created']);

    // 7 exports so far (refused ones count): 3 more, then 429.
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      statuses.push(
        (await request(server).get(`${csvUrl}?from=2026-01-20&to=2026-01-20`).set(ownerAuth))
          .status,
      );
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});
