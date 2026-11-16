import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Role } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SoftAuthenticator } from './webauthn-authenticator.js';

// Its own file, so its own app: the passkey routes have per-minute limits per IP.
const email = `e2e-passkeys-${randomUUID().slice(0, 8)}@codeqlick.test`;
const otherEmail = `e2e-passkeys-other-${randomUUID().slice(0, 8)}@codeqlick.test`;
const password = 'passkeys-password-1';

describe('Passkeys (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;
  let auth: { Authorization: string };
  let userId: string;
  const passkey = new SoftAuthenticator();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    server = app.getHttpServer();
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await prisma.user.create({
      data: { email, name: 'E2E Passkeys', role: Role.CLIENT, passwordHash },
    });
    userId = user.id;
    await prisma.user.create({
      data: { email: otherEmail, name: 'E2E Other', role: Role.CLIENT, passwordHash },
    });
    const login = await request(server)
      .post('/v1/auth/login')
      .send({ email, password })
      .expect(200);
    auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
  });

  afterAll(async () => {
    if (prisma) await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
    await app?.close();
  });

  const loginOptions = async () => {
    const res = await request(server).post('/v1/auth/passkeys/login/options').expect(200);
    return res.body as { options: { challenge: string; rpId: string }; challengeId: string };
  };

  it('adds a passkey after the password, with a single-use challenge', async () => {
    await request(server)
      .post('/v1/auth/passkeys/register/options')
      .set(auth)
      .send({ password: 'wrong-password' })
      .expect(400);

    const options = await request(server)
      .post('/v1/auth/passkeys/register/options')
      .set(auth)
      .send({ password })
      .expect(200);
    expect(options.body.rp).toEqual({ name: 'Codeqlick', id: 'localhost' });
    expect(options.body.authenticatorSelection).toMatchObject({
      residentKey: 'required',
      userVerification: 'required',
    });
    expect(options.body.excludeCredentials).toEqual([]);

    // From a page the API doesn't serve: refused, and the challenge is spent.
    const foreign = passkey.register(options.body, 'https://evil.example');
    await request(server)
      .post('/v1/auth/passkeys/register/verify')
      .set(auth)
      .send({ response: foreign })
      .expect(400);
    await request(server)
      .post('/v1/auth/passkeys/register/verify')
      .set(auth)
      .send({ response: passkey.register(options.body), name: 'Laptop' })
      .expect(400);

    const again = await request(server)
      .post('/v1/auth/passkeys/register/options')
      .set(auth)
      .send({ password })
      .expect(200);
    const response = passkey.register(again.body);
    const created = await request(server)
      .post('/v1/auth/passkeys/register/verify')
      .set(auth)
      .send({ response, name: 'Laptop' })
      .expect(201);
    expect(created.body).toMatchObject({ name: 'Laptop', lastUsedAt: null });
    expect(created.body).not.toHaveProperty('publicKey');

    // The same attestation again: its challenge is gone.
    await request(server)
      .post('/v1/auth/passkeys/register/verify')
      .set(auth)
      .send({ response, name: 'Laptop' })
      .expect(400);

    const stored = await prisma.passkey.findMany({ where: { userId } });
    expect(stored).toHaveLength(1);
    expect(stored[0]!.credentialId).toBe(passkey.id);
    const log = await prisma.activityLog.findFirst({
      where: { actorId: userId, action: 'account.passkey_added' },
    });
    expect(log?.targetLabel).toBe('Laptop');
  });

  it('signs in with the passkey: tokens without two-step verification', async () => {
    // Two-step verification on: a passkey counts as both factors.
    await prisma.user.update({ where: { id: userId }, data: { totpEnabledAt: new Date() } });
    try {
      const { options, challengeId } = await loginOptions();
      expect(options.rpId).toBe('localhost');
      const response = passkey.authenticate(options);
      const signedIn = await request(server)
        .post('/v1/auth/passkeys/login/verify')
        .set('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0')
        .send({ challengeId, response })
        .expect(200);
      expect(signedIn.body.accessToken).toBeTruthy();
      expect(signedIn.body.refreshToken).toBeTruthy();
      expect(signedIn.body.user.email).toBe(email);
      await request(server)
        .get('/v1/auth/me')
        .set({ Authorization: `Bearer ${signedIn.body.accessToken as string}` })
        .expect(200);

      // The challenge was spent: the same assertion can't sign in twice.
      await request(server)
        .post('/v1/auth/passkeys/login/verify')
        .send({ challengeId, response })
        .expect(401);
    } finally {
      await prisma.user.update({ where: { id: userId }, data: { totpEnabledAt: null } });
    }
    const stored = await prisma.passkey.findFirstOrThrow({ where: { userId } });
    expect(stored.counter).toBe(1n);
    expect(stored.lastUsedAt).not.toBeNull();
  });

  it('refuses an unknown passkey, an expired challenge, a replayed counter and inactive accounts', async () => {
    const sessionsBefore = await prisma.session.count({ where: { userId } });
    const stranger = new SoftAuthenticator();
    stranger.register({ challenge: 'x', user: { id: Buffer.from(userId).toString('base64url') } });
    let { options, challengeId } = await loginOptions();
    await request(server)
      .post('/v1/auth/passkeys/login/verify')
      .send({ challengeId, response: stranger.authenticate(options) })
      .expect(401);

    ({ options, challengeId } = await loginOptions());
    await prisma.webAuthnChallenge.update({
      where: { id: challengeId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(server)
      .post('/v1/auth/passkeys/login/verify')
      .send({ challengeId, response: passkey.authenticate(options) })
      .expect(401);

    ({ options, challengeId } = await loginOptions());
    await request(server)
      .post('/v1/auth/passkeys/login/verify')
      .send({ challengeId, response: passkey.authenticate(options, { counter: 1 }) })
      .expect(401);

    await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    try {
      ({ options, challengeId } = await loginOptions());
      await request(server)
        .post('/v1/auth/passkeys/login/verify')
        .send({ challengeId, response: passkey.authenticate(options) })
        .expect(401);
    } finally {
      await prisma.user.update({ where: { id: userId }, data: { isActive: true } });
    }

    await request(server)
      .post('/v1/auth/passkeys/login/verify')
      .send({ challengeId: randomUUID(), response: passkey.authenticate(options) })
      .expect(401);
    // None of them started a session.
    expect(await prisma.session.count({ where: { userId } })).toBe(sessionsBefore);
  });

  it('allows up to 10 passkeys', async () => {
    await prisma.passkey.createMany({
      data: Array.from({ length: 8 }, (_, index) => ({
        userId,
        credentialId: randomBytes(16).toString('base64url'),
        publicKey: new Uint8Array([index]),
        deviceType: 'singleDevice',
        backedUp: false,
        name: `Key ${index + 2}`,
      })),
    });
    const tenth = new SoftAuthenticator();
    const options = await request(server)
      .post('/v1/auth/passkeys/register/options')
      .set(auth)
      .send({ password })
      .expect(200);
    expect(options.body.excludeCredentials).toHaveLength(9);
    await request(server)
      .post('/v1/auth/passkeys/register/verify')
      .set(auth)
      .send({ response: tenth.register(options.body) })
      .expect(201);
    await request(server)
      .post('/v1/auth/passkeys/register/options')
      .set(auth)
      .send({ password })
      .expect(409);
  });

  it('lists, renames and deletes (with the password) only the caller’s passkeys', async () => {
    const list = await request(server).get('/v1/auth/passkeys').set(auth).expect(200);
    const items = list.body.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(10);
    expect(Object.keys(items[0]!).toSorted()).toEqual([
      'backedUp',
      'createdAt',
      'deviceType',
      'id',
      'lastUsedAt',
      'name',
    ]);
    const laptop = items.find((item) => item.name === 'Laptop')!;
    const id = laptop.id as string;

    const renamed = await request(server)
      .patch(`/v1/auth/passkeys/${id}`)
      .set(auth)
      .send({ name: 'Work laptop' })
      .expect(200);
    expect(renamed.body.name).toBe('Work laptop');
    await request(server)
      .patch(`/v1/auth/passkeys/${id}`)
      .set(auth)
      .send({ name: 'x'.repeat(41) })
      .expect(400);

    const other = await request(server)
      .post('/v1/auth/login')
      .send({ email: otherEmail, password })
      .expect(200);
    const otherAuth = { Authorization: `Bearer ${other.body.accessToken as string}` };
    await request(server)
      .patch(`/v1/auth/passkeys/${id}`)
      .set(otherAuth)
      .send({ name: 'Mine now' })
      .expect(404);
    await request(server)
      .delete(`/v1/auth/passkeys/${id}`)
      .set(otherAuth)
      .send({ password })
      .expect(404);

    await request(server)
      .delete(`/v1/auth/passkeys/${id}`)
      .set(auth)
      .send({ password: 'wrong-password' })
      .expect(400);

    const exported = await request(server).get('/v1/auth/me/export').set(auth).expect(200);
    const data = JSON.parse(exported.text) as { passkeys: Array<Record<string, unknown>> };
    expect(data.passkeys).toHaveLength(10);
    expect(data.passkeys[0]).toMatchObject({ name: 'Work laptop', deviceType: 'singleDevice' });
    expect(exported.text).not.toContain(passkey.id);
    expect(Object.keys(data.passkeys[0]!)).not.toContain('publicKey');

    await request(server)
      .delete(`/v1/auth/passkeys/${id}`)
      .set(auth)
      .send({ password })
      .expect(204);
    const after = await request(server).get('/v1/auth/passkeys').set(auth).expect(200);
    expect(after.body.items).toHaveLength(9);

    // Deleted: it can't sign in any more.
    const { options, challengeId } = await loginOptions();
    await request(server)
      .post('/v1/auth/passkeys/login/verify')
      .send({ challengeId, response: passkey.authenticate(options) })
      .expect(401);
  });
});
