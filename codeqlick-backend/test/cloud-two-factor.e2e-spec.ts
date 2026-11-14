import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Role } from '../src/generated/prisma/client.js';
import { totpCode } from '../src/modules/auth/totp.js';
import { CLOUD_TERMS_VERSION } from '../src/modules/cloud/cloud-plans.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'cloud-2fa-password-1';
const owner = { email: `e2e-cloud2fa-owner-${tag}@codeqlick.test`, password };
const mate = { email: `e2e-cloud2fa-mate-${tag}@codeqlick.test`, password };
const terms = { acceptTerms: true, termsVersion: CLOUD_TERMS_VERSION };
const step = () => Math.floor(Date.now() / 30_000);
const BLOCKED = 'This team requires two-step verification';

describe('Codeqlick Cloud teams requiring two-step verification (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const sent: MailMessage[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    vi.spyOn(app.get(MailService), 'send').mockImplementation((message) => {
      sent.push(message);
      return Promise.resolve();
    });
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
      await prisma.cloudTeam.deleteMany({ where: { slug: { startsWith: `t2fa-${tag}` } } });
      await prisma.user.deleteMany({ where: { email: { in: [owner.email, mate.email] } } });
    }
    await app?.close();
  });

  it('lets owners require it and keeps members without it out of the team', async () => {
    const server = app.getHttpServer();
    const bearer = async (user: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`,
    });
    const ownerAuth = await bearer(owner);
    const mateAuth = await bearer(mate);
    const teamSlug = `t2fa-${tag}`;
    const enableTwoFactor = async (auth: { Authorization: string }) => {
      const setup = await request(server).post('/v1/auth/2fa/setup').set(auth).expect(200);
      await request(server)
        .post('/v1/auth/2fa/enable')
        .set(auth)
        .send({ code: totpCode(setup.body.secret as string, step()) })
        .expect(200);
    };

    const team = await request(server)
      .post('/v1/cloud/teams')
      .set(ownerAuth)
      .send({ name: 'Ada Labs', slug: teamSlug, ...terms })
      .expect(201);
    expect(team.body).toMatchObject({ requireTwoFactor: false, twoFactorBlocked: false });

    // Turning it on needs it on the owner's own account first.
    const refused = await request(server)
      .patch(`/v1/cloud/teams/${teamSlug}`)
      .set(ownerAuth)
      .send({ requireTwoFactor: true })
      .expect(409);
    expect(refused.body.detail).toBe('Turn on two-step verification on your own account first');
    await enableTwoFactor(ownerAuth);
    const on = await request(server)
      .patch(`/v1/cloud/teams/${teamSlug}`)
      .set(ownerAuth)
      .send({ requireTwoFactor: true })
      .expect(200);
    expect(on.body).toMatchObject({ requireTwoFactor: true, twoFactorBlocked: false });

    // The invitation says so, in the email and on the invite page.
    await request(server)
      .post(`/v1/cloud/teams/${teamSlug}/invites`)
      .set(ownerAuth)
      .send({ email: mate.email, role: 'ADMIN', locale: 'en' })
      .expect(201);
    const email = sent.find((m) => m.to === mate.email);
    expect(email?.text).toContain('This team requires two-step verification');
    const inviteToken = /invite\?token=([\w-]+)/.exec(email?.text ?? '')?.[1];
    expect(inviteToken).toBeTruthy();
    const invite = await request(server)
      .get(`/v1/cloud/invites/${inviteToken}`)
      .set(mateAuth)
      .expect(200);
    expect(invite.body.team).toEqual({ name: 'Ada Labs', slug: teamSlug, requireTwoFactor: true });
    await request(server)
      .post(`/v1/cloud/invites/${inviteToken}/accept`)
      .set(mateAuth)
      .send(terms)
      .expect(200);

    // Without it, the new member sees the team and the teams list, and nothing else.
    const seen = await request(server).get(`/v1/cloud/teams/${teamSlug}`).set(mateAuth).expect(200);
    expect(seen.body).toMatchObject({ requireTwoFactor: true, twoFactorBlocked: true });
    const me = await request(server).get('/v1/cloud/me').set(mateAuth).expect(200);
    expect(me.body.teams).toEqual([
      expect.objectContaining({ slug: teamSlug, requireTwoFactor: true, twoFactorBlocked: true }),
    ]);
    const blocked = await request(server)
      .get(`/v1/cloud/teams/${teamSlug}/members`)
      .set(mateAuth)
      .expect(403);
    expect(blocked.body.detail).toBe(BLOCKED);
    await request(server)
      .patch(`/v1/cloud/teams/${teamSlug}`)
      .set(mateAuth)
      .send({ name: 'Grace Labs' })
      .expect(403);
    // Through an API token too, and no token restricted to that team is issued.
    const created = await request(server)
      .post('/v1/cloud/tokens')
      .set(mateAuth)
      .send({ name: 'Laptop', expiresInDays: 30 })
      .expect(201);
    const tokenAuth = { Authorization: `Bearer ${created.body.token as string}` };
    await request(server).get(`/v1/cloud/teams/${teamSlug}/usage`).set(tokenAuth).expect(403);
    await request(server)
      .post('/v1/cloud/tokens')
      .set(mateAuth)
      .send({ name: 'CI', teamSlug, expiresInDays: 30 })
      .expect(403);

    // The members list shows who has it.
    const members = await request(server)
      .get(`/v1/cloud/teams/${teamSlug}/members`)
      .set(ownerAuth)
      .expect(200);
    const items = members.body.items as Array<{
      userId: string;
      email: string;
      twoFactor: boolean;
    }>;
    expect(items.map((m) => [m.email, m.twoFactor])).toEqual([
      [owner.email, true],
      [mate.email, false],
    ]);
    const mateId = items.find((m) => m.email === mate.email)?.userId;

    // Setting it up opens the team at once, to the same session and token.
    await enableTwoFactor(mateAuth);
    await request(server).get(`/v1/cloud/teams/${teamSlug}/members`).set(mateAuth).expect(200);
    await request(server).get(`/v1/cloud/teams/${teamSlug}/usage`).set(tokenAuth).expect(200);

    // Only owners turn it on or off; an admin still renames the team.
    await request(server)
      .patch(`/v1/cloud/teams/${teamSlug}`)
      .set(mateAuth)
      .send({ requireTwoFactor: false })
      .expect(403);
    await request(server)
      .patch(`/v1/cloud/teams/${teamSlug}`)
      .set(mateAuth)
      .send({ name: 'Ada Labs 2' })
      .expect(200);
    await request(server).patch(`/v1/cloud/teams/${teamSlug}`).set(ownerAuth).send({}).expect(400);

    // A member who loses it is blocked again, and can still leave.
    await prisma.user.update({ where: { email: mate.email }, data: { totpEnabledAt: null } });
    await request(server).get(`/v1/cloud/teams/${teamSlug}/usage`).set(mateAuth).expect(403);
    await request(server)
      .delete(`/v1/cloud/teams/${teamSlug}/members/${mateId}`)
      .set(mateAuth)
      .expect(204);

    const off = await request(server)
      .patch(`/v1/cloud/teams/${teamSlug}`)
      .set(ownerAuth)
      .send({ requireTwoFactor: false })
      .expect(200);
    expect(off.body).toMatchObject({ requireTwoFactor: false, twoFactorBlocked: false });

    const events = await request(server)
      .get(`/v1/cloud/teams/${teamSlug}/events`)
      .set(ownerAuth)
      .expect(200);
    const changes = (events.body.items as Array<{ action: string; details: unknown }>)
      .filter((e) => e.action === 'team.two_factor_required')
      .map((e) => e.details);
    expect(changes).toEqual([{ enabled: false }, { enabled: true }]);
  });
});
