import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Role } from '../src/generated/prisma/client.js';
import { hashRefreshToken } from '../src/modules/auth/auth.service.js';
import { totpCode } from '../src/modules/auth/totp.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Single sign-on between the account host and the other hosts (architecture 4.3, decision 108).
// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const email = `e2e-sso-${tag}@codeqlick.test`;
const twoFactorEmail = `e2e-sso-2fa-${tag}@codeqlick.test`;
const password = 'sso-password-123';

interface Tokens {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string };
}
interface Session {
  id: string;
  current: boolean;
  client: string | null;
  parentId: string | null;
}

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

const bearer = (tokens: { accessToken: string }) => ({
  Authorization: `Bearer ${tokens.accessToken}`,
});

const step = () => Math.floor(Date.now() / 30_000);

describe('Single sign-on (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let account: Tokens;

  const server = () => app.getHttpServer();
  const newCode = async (tokens: Tokens, client: string, challenge: string) =>
    (
      await request(server())
        .post('/v1/auth/sso/codes')
        .set(bearer(tokens))
        .send({ client, codeChallenge: challenge })
        .expect(201)
    ).body as { code: string; expiresIn: number };
  const exchange = (client: string, code: string, codeVerifier: string) =>
    request(server())
      .post('/v1/auth/sso/exchange')
      .set('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0')
      .send({ client, code, codeVerifier });
  const sessions = async (tokens: Tokens) =>
    (await request(server()).get('/v1/auth/sessions').set(bearer(tokens)).expect(200))
      .body as Session[];
  /** Whether a session was signed out (checked in the database: refresh is limited to 5/min). */
  const signedOut = async (tokens: Tokens) =>
    (
      await prisma.session.findUniqueOrThrow({
        where: { tokenHash: hashRefreshToken(tokens.refreshToken) },
      })
    ).revokedAt !== null;
  /** A signed-in session of `client` through the whole flow. */
  const ssoSession = async (client: string): Promise<Tokens> => {
    const { verifier, challenge } = pkce();
    const { code } = await newCode(account, client, challenge);
    return (await exchange(client, code, verifier).expect(200)).body as Tokens;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    for (const [address, name] of [
      [email, 'E2E SSO'],
      [twoFactorEmail, 'E2E SSO 2FA'],
    ] as const) {
      await prisma.user.create({
        data: { email: address, name, role: Role.CLIENT, passwordHash, registeredAt: new Date() },
      });
    }
    account = (await request(server()).post('/v1/auth/login').send({ email, password }).expect(200))
      .body as Tokens;
  });

  afterAll(async () => {
    if (prisma) await prisma.user.deleteMany({ where: { email: { in: [email, twoFactorEmail] } } });
    await app?.close();
  });

  it('signs a client host in with a code and its PKCE verifier, as a session of its own', async () => {
    const { verifier, challenge } = pkce();
    const { code, expiresIn } = await newCode(account, 'cruising', challenge);
    expect(expiresIn).toBe(60);
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // Only the code's hash is stored.
    const row = await prisma.ssoCode.findUniqueOrThrow({
      where: { codeHash: hashRefreshToken(code) },
    });
    expect(row).toMatchObject({ client: 'cruising', codeChallenge: challenge, usedAt: null });

    const tokens = (await exchange('cruising', code, verifier).expect(200)).body as Tokens;
    expect(tokens.user.email).toBe(email);
    expect(tokens.refreshToken).not.toBe(account.refreshToken);
    await request(server()).get('/v1/auth/me').set(bearer(tokens)).expect(200);

    // One entry per host in the devices list, labelled with its client and its parent.
    const list = await sessions(account);
    const accountSession = list.find((session) => session.current);
    expect(accountSession).toMatchObject({ client: null, parentId: null });
    const cruising = list.find((session) => session.client === 'cruising');
    expect(cruising?.parentId).toBe(accountSession?.id);

    // A refresh keeps the client and the parent.
    const refreshed = (
      await request(server())
        .post('/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(200)
    ).body as Tokens;
    const after = await sessions(refreshed);
    expect(after.find((session) => session.current)).toMatchObject({
      client: 'cruising',
      parentId: accountSession?.id,
    });

    // No new-device email for an exchange: it isn't an interactive sign-in. (No mail is sent in
    // tests; the rule is covered by the unit tests.)
  });

  it('refuses a wrong verifier, and the code is spent anyway', async () => {
    const { verifier, challenge } = pkce();
    const { code } = await newCode(account, 'site', challenge);
    expect((await exchange('site', code, pkce().verifier)).status).toBe(400);
    expect((await exchange('site', code, verifier)).status).toBe(400);
  });

  it('refuses a reused code and signs out the session it gave', async () => {
    const { verifier, challenge } = pkce();
    const { code } = await newCode(account, 'swipe', challenge);
    const tokens = (await exchange('swipe', code, verifier).expect(200)).body as Tokens;

    const again = await exchange('swipe', code, verifier).expect(400);
    expect(again.body.detail).toBe('Invalid or expired code');
    await request(server())
      .post('/v1/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(401);
  });

  it('refuses an expired code, another client’s code and an unknown client', async () => {
    const { verifier, challenge } = pkce();
    const expired = await newCode(account, 'meetings', challenge);
    await prisma.ssoCode.update({
      where: { codeHash: hashRefreshToken(expired.code) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await exchange('meetings', expired.code, verifier)).status).toBe(400);

    const other = await newCode(account, 'citas', challenge);
    await exchange('videochat', other.code, verifier).expect(400);

    await request(server())
      .post('/v1/auth/sso/codes')
      .set(bearer(account))
      .send({ client: 'evil.example.com', codeChallenge: challenge })
      .expect(400);
    expect((await exchange('account', other.code, verifier)).status).toBe(400);
    // A challenge that isn't S256's 43 characters.
    await request(server())
      .post('/v1/auth/sso/codes')
      .set(bearer(account))
      .send({ client: 'site', codeChallenge: 'plain-verifier' })
      .expect(400);
  });

  it('needs a signed-in account session: not anonymous, not an app’s own session', async () => {
    const { challenge } = pkce();
    await request(server())
      .post('/v1/auth/sso/codes')
      .send({ client: 'site', codeChallenge: challenge })
      .expect(401);
    const cloud = await ssoSession('cloud');
    const refused = await request(server())
      .post('/v1/auth/sso/codes')
      .set(bearer(cloud))
      .send({ client: 'site', codeChallenge: challenge });
    expect(refused.status).toBe(401);
  });

  it('refuses the exchange once the account is inactive', async () => {
    const { verifier, challenge } = pkce();
    const { code } = await newCode(account, 'site', challenge);
    await prisma.user.update({ where: { email }, data: { isActive: false } });
    try {
      expect((await exchange('site', code, verifier)).status).toBe(400);
    } finally {
      await prisma.user.update({ where: { email }, data: { isActive: true } });
    }
  });

  it('lists the parts of the platform the caller uses', async () => {
    const apps = await request(server()).get('/v1/auth/apps').set(bearer(account)).expect(200);
    expect(apps.body).toEqual({ items: [{ app: 'portal', count: 0 }] });
  });

  it('issues codes to a two-step account only once the code is entered', async () => {
    const first = (
      await request(server())
        .post('/v1/auth/login')
        .send({ email: twoFactorEmail, password })
        .expect(200)
    ).body as Tokens;
    const setup = await request(server()).post('/v1/auth/2fa/setup').set(bearer(first));
    const secret = setup.body.secret as string;
    await request(server())
      .post('/v1/auth/2fa/enable')
      .set(bearer(first))
      .send({ code: totpCode(secret, step()) })
      .expect(200);

    // The password alone gives a challenge, not a session that could ask for codes.
    const challenged = await request(server())
      .post('/v1/auth/login')
      .send({ email: twoFactorEmail, password })
      .expect(200);
    expect(challenged.body).toMatchObject({ twoFactorRequired: true });
    expect(challenged.body.accessToken).toBeUndefined();

    const verified = (
      await request(server())
        .post('/v1/auth/2fa/verify')
        .send({
          challengeToken: challenged.body.challengeToken as string,
          code: totpCode(secret, step() + 1),
        })
        .expect(200)
    ).body as Tokens;
    const { verifier, challenge } = pkce();
    const { code } = await newCode(verified, 'site', challenge);
    const tokens = (await exchange('site', code, verifier).expect(200)).body as Tokens;
    expect(tokens.user.email).toBe(twoFactorEmail);
  });

  it('signing a device out from the list also ends the apps it signed in', async () => {
    const cruising = await ssoSession('cruising');
    const mine = (await sessions(account)).find((session) => session.current)!;
    // Any session of the account may do it, the app's own too.
    await request(server())
      .delete(`/v1/auth/sessions/${mine.id}`)
      .set(bearer(cruising))
      .expect(204);
    for (const tokens of [account, cruising]) {
      expect(await signedOut(tokens)).toBe(true);
    }
  });

  it('signs this browser out everywhere: the account session and every session it made', async () => {
    account = (await request(server()).post('/v1/auth/login').send({ email, password }).expect(200))
      .body as Tokens;
    const site = await ssoSession('site');
    const videochat = await ssoSession('videochat');
    // Another device of the same account stays signed in.
    const other = (
      await request(server()).post('/v1/auth/login').send({ email, password }).expect(200)
    ).body as Tokens;

    // From an app's session it climbs to the account session first.
    await request(server())
      .post('/v1/auth/sessions/revoke-device')
      .set(bearer(videochat))
      .send({ refreshToken: videochat.refreshToken })
      .expect(204);

    for (const tokens of [account, site, videochat]) {
      expect(await signedOut(tokens)).toBe(true);
    }
    const left = await sessions(other);
    expect(left.map((session) => session.current)).toEqual([true]);

    // A code from a session that ended is refused.
    const { challenge } = pkce();
    await request(server())
      .post('/v1/auth/sso/codes')
      .set(bearer(account))
      .send({ client: 'site', codeChallenge: challenge })
      .expect(401);

    // "Sign out of all devices" ends the last one too.
    account = other;
    const cruising = await ssoSession('cruising');
    await request(server()).post('/v1/auth/sessions/revoke-all').set(bearer(other)).expect(204);
    for (const tokens of [other, cruising]) {
      expect(await signedOut(tokens)).toBe(true);
    }
    const activity = await request(server()).get('/v1/auth/activity').set(bearer(other));
    expect(activity.status).toBe(200);
    const scopes = (activity.body.items as { action: string; details: { scope?: string } }[])
      .filter((item) => item.action === 'account.sessions_revoked')
      .map((item) => item.details.scope);
    expect(scopes).toEqual(['all', 'device', 'one']);
  });
});
