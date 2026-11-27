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
import { PrismaService } from '../src/prisma/prisma.service.js';

// Single sign-on for a desktop program (Age of Velkara's game and launcher): the system browser,
// PKCE and a redirect to a port on the player's own machine. Its own file, so its own app and its
// own rate limits.
const tag = randomUUID().slice(0, 8);
const email = `e2e-sso-native-${tag}@codeqlick.test`;
const password = 'sso-native-password-123';
const CLIENT = 'ageofvelkara';
const LOOPBACK = 'http://127.0.0.1:49152/callback';
const GAME_AGENT = 'AgeOfVelkara/0.4.0 (Windows NT 10.0; Win64; x64)';

interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; email: string };
}
interface Session {
  id: string;
  current: boolean;
  client: string | null;
  parentId: string | null;
  userAgent: string | null;
}

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/** The fields a validation error names (the pipe writes each as `field: message`). */
const fields = (body: { errors?: { message: string }[] }) =>
  [...new Set((body.errors ?? []).map((error) => error.message.split(':')[0]))].toSorted();

const bearer = (tokens: { accessToken: string }) => ({
  Authorization: `Bearer ${tokens.accessToken}`,
});

describe('Single sign-on for a desktop program (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let account: Tokens;

  const server = () => app.getHttpServer();
  const askCode = (body: Record<string, unknown>, tokens: Tokens = account) =>
    request(server()).post('/v1/auth/sso/codes').set(bearer(tokens)).send(body);
  const newCode = async (challenge: string, redirectUri = LOOPBACK) =>
    (await askCode({ client: CLIENT, codeChallenge: challenge, redirectUri }).expect(201)).body as {
      code: string;
      expiresIn: number;
    };
  const exchange = (body: Record<string, unknown>) =>
    request(server()).post('/v1/auth/sso/exchange').set('User-Agent', GAME_AGENT).send(body);
  const sessions = async (tokens: Tokens) =>
    (await request(server()).get('/v1/auth/sessions').set(bearer(tokens)).expect(200))
      .body as Session[];
  const signedOut = async (tokens: Tokens) =>
    (
      await prisma.session.findUniqueOrThrow({
        where: { tokenHash: hashRefreshToken(tokens.refreshToken) },
      })
    ).revokedAt !== null;
  /** A signed-in session of the game through the whole flow. */
  const gameSession = async (): Promise<Tokens> => {
    const { verifier, challenge } = pkce();
    const { code } = await newCode(challenge);
    return (
      await exchange({
        client: CLIENT,
        code,
        codeVerifier: verifier,
        redirectUri: LOOPBACK,
      }).expect(200)
    ).body as Tokens;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.create({
      data: {
        email,
        name: 'E2E SSO native',
        role: Role.CLIENT,
        passwordHash,
        registeredAt: new Date(),
      },
    });
    account = (await request(server()).post('/v1/auth/login').send({ email, password }).expect(200))
      .body as Tokens;
  });

  afterAll(async () => {
    if (prisma) await prisma.user.deleteMany({ where: { email } });
    await app?.close();
  });

  it('signs the game in: code bound to the loopback address, tokens in the body', async () => {
    const { verifier, challenge } = pkce();
    const { code, expiresIn } = await newCode(challenge);
    expect(expiresIn).toBe(60);
    const row = await prisma.ssoCode.findUniqueOrThrow({
      where: { codeHash: hashRefreshToken(code) },
    });
    expect(row).toMatchObject({ client: CLIENT, redirectUri: LOOPBACK, usedAt: null });

    const tokens = (
      await exchange({
        client: CLIENT,
        code,
        codeVerifier: verifier,
        redirectUri: LOOPBACK,
      }).expect(200)
    ).body as Tokens;
    expect(tokens.user.email).toBe(email);
    expect(tokens.expiresIn).toBeGreaterThan(0);
    expect(tokens.refreshToken).toMatch(/^[A-Za-z0-9_-]+$/);
    await request(server()).get('/v1/auth/me').set(bearer(tokens)).expect(200);

    // Labelled with the program, a child of the account session, described by its User-Agent.
    const list = await sessions(account);
    const accountSession = list.find((session) => session.current)!;
    const game = list.find((session) => session.client === CLIENT);
    expect(game).toMatchObject({ parentId: accountSession.id, userAgent: GAME_AGENT });

    // It refreshes like any session (rotation: the old token no longer works) …
    const refreshed = (
      await request(server())
        .post('/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(200)
    ).body as Tokens;
    expect(refreshed.refreshToken).not.toBe(tokens.refreshToken);
    expect((await sessions(refreshed)).find((session) => session.current)).toMatchObject({
      client: CLIENT,
      parentId: accountSession.id,
    });

    // … and signs out like any session.
    await request(server())
      .post('/v1/auth/logout')
      .set(bearer(refreshed))
      .send({ refreshToken: refreshed.refreshToken })
      .expect(204);
    expect(await signedOut(refreshed)).toBe(true);
  });

  it('refuses a code whose redirect breaks the rule, or is missing', async () => {
    const { challenge } = pkce();
    for (const redirectUri of [
      undefined,
      'http://localhost:49152/callback',
      'http://[::1]:49152/callback',
      'https://127.0.0.1:49152/callback',
      'http://127.0.0.1:80/callback',
      'http://127.0.0.1:65536/callback',
      'http://127.0.0.1:49152/other',
      'http://127.0.0.1:49152/callback?next=x',
      'http://evil@127.0.0.1:49152/callback',
    ]) {
      const refused = await askCode({ client: CLIENT, codeChallenge: challenge, redirectUri });
      expect({ redirectUri, status: refused.status, fields: fields(refused.body) }).toEqual({
        redirectUri,
        status: 400,
        fields: ['redirectUri'],
      });
    }
  });

  it('refuses a redirect for a web client: its callback is never read from a request', async () => {
    const { challenge } = pkce();
    const refused = await askCode({
      client: 'meetings',
      codeChallenge: challenge,
      redirectUri: LOOPBACK,
    }).expect(400);
    expect(fields(refused.body)).toEqual(['redirectUri']);
  });

  it('refuses an exchange with a different or missing address, and the code is spent', async () => {
    const different = pkce();
    const first = await newCode(different.challenge);
    const wrong = await exchange({
      client: CLIENT,
      code: first.code,
      codeVerifier: different.verifier,
      redirectUri: 'http://127.0.0.1:49153/callback',
    }).expect(400);
    expect(wrong.body.detail).toBe('Invalid or expired code');
    // Spent by the failed attempt: the right address no longer helps.
    const after = await exchange({
      client: CLIENT,
      code: first.code,
      codeVerifier: different.verifier,
      redirectUri: LOOPBACK,
    }).expect(400);
    expect(after.body.detail).toBe('Invalid or expired code');

    const missing = pkce();
    const second = await newCode(missing.challenge);
    const none = await exchange({
      client: CLIENT,
      code: second.code,
      codeVerifier: missing.verifier,
    }).expect(400);
    expect(none.body.detail).toBe('Invalid or expired code');

    // The address doesn't replace the verifier.
    const unproven = pkce();
    const third = await newCode(unproven.challenge);
    const noVerifier = await exchange({
      client: CLIENT,
      code: third.code,
      codeVerifier: pkce().verifier,
      redirectUri: LOOPBACK,
    }).expect(400);
    expect(noVerifier.body.detail).toBe('Invalid or expired code');
  });

  it("refuses a web client's code exchanged with an address, or as the game's", async () => {
    const { verifier, challenge } = pkce();
    const { code } = (await askCode({ client: 'site', codeChallenge: challenge }).expect(201))
      .body as { code: string };
    const withAddress = await request(server())
      .post('/v1/auth/sso/exchange')
      .send({ client: 'site', code, codeVerifier: verifier, redirectUri: LOOPBACK })
      .expect(400);
    expect(withAddress.body.detail).toBe('Invalid or expired code');

    const other = pkce();
    const siteCode = (await askCode({ client: 'site', codeChallenge: other.challenge }).expect(201))
      .body as { code: string };
    const asGame = await exchange({
      client: CLIENT,
      code: siteCode.code,
      codeVerifier: other.verifier,
      redirectUri: LOOPBACK,
    }).expect(400);
    expect(asGame.body.detail).toBe('Invalid or expired code');
  });

  it("can't ask for codes itself: the game's session is not the account session", async () => {
    const game = await gameSession();
    const { challenge } = pkce();
    expect(
      (await askCode({ client: CLIENT, codeChallenge: challenge, redirectUri: LOOPBACK }, game))
        .status,
    ).toBe(401);
  });

  it('is signed out by "Sign out of this device everywhere", from either side', async () => {
    const game = await gameSession();
    await request(server())
      .post('/v1/auth/sessions/revoke-device')
      .set(bearer(account))
      .send({ refreshToken: account.refreshToken })
      .expect(204);
    for (const tokens of [account, game]) expect(await signedOut(tokens)).toBe(true);
    await request(server())
      .post('/v1/auth/refresh')
      .send({ refreshToken: game.refreshToken })
      .expect(401);

    // From the game's own session it climbs to the account session first.
    account = (await request(server()).post('/v1/auth/login').send({ email, password }).expect(200))
      .body as Tokens;
    const again = await gameSession();
    await request(server())
      .post('/v1/auth/sessions/revoke-device')
      .set(bearer(again))
      .send({ refreshToken: again.refreshToken })
      .expect(204);
    for (const tokens of [account, again]) expect(await signedOut(tokens)).toBe(true);
  });
});
