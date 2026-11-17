import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Role } from '../src/generated/prisma/client.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Realms (architecture 4.18, decision 124): two user bases in one database. Its own file, so its own
// app: sign-in, sign-up and reset are limited per minute and per IP.
const tag = randomUUID().slice(0, 8);
const shared = `e2e-realm-shared-${tag}@codeqlick.test`;
const codeqlickPassword = 'codeqlick-password-1';
const neoqlickPassword = 'neoqlick-password-2';
const NEO = { 'X-Realm': 'NEOQLICK' };

let ipCounter = 10;
/** A distinct client address per call: the limits are per IP. */
const ip = () => ({ 'X-Forwarded-For': `203.0.113.${ipCounter++}` });

const tokenIn = (message: MailMessage | undefined, path: string) =>
  new RegExp(`${path}\\?(?:token|invitation)=([\\w-]+)`).exec(message?.text ?? '')?.[1];

interface Tokens {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; realm: string; role: string };
}

const bearer = (tokens: { accessToken: string }) => ({
  Authorization: `Bearer ${tokens.accessToken}`,
});

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

describe('Realms (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  const sent: MailMessage[] = [];
  const to = (email: string) => sent.filter((message) => message.to === email);
  const server = () => app.getHttpServer();

  const login = (email: string, password: string, headers: Record<string, string> = {}) =>
    request(server()).post('/v1/auth/login').set(ip()).set(headers).send({ email, password });

  let admin: Tokens;
  let codeqlick: Tokens;
  let neoqlick: Tokens;
  let codeqlickUserId: string;
  let neoqlickUserId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    vi.spyOn(app.get(MailService), 'send').mockImplementation((message: MailMessage) => {
      sent.push(message);
      return Promise.resolve();
    });
    const hash = (password: string) => argon2.hash(password, { type: argon2.argon2id });
    const now = new Date();
    const adminUser = await prisma.user.create({
      data: {
        email: `e2e-realm-admin-${tag}@codeqlick.test`,
        name: 'Realm Admin',
        role: Role.ADMIN,
        passwordHash: await hash(codeqlickPassword),
        registeredAt: now,
      },
    });
    // The same email in both realms: two accounts, with their own passwords.
    const codeqlickUser = await prisma.user.create({
      data: {
        email: shared,
        name: 'Ada (Codeqlick)',
        role: Role.CLIENT,
        passwordHash: await hash(codeqlickPassword),
        registeredAt: now,
      },
    });
    const neoqlickUser = await prisma.user.create({
      data: {
        email: shared,
        realm: 'NEOQLICK',
        name: 'Ada (Neoqlick)',
        role: Role.CLIENT,
        passwordHash: await hash(neoqlickPassword),
        registeredAt: now,
      },
    });
    codeqlickUserId = codeqlickUser.id;
    neoqlickUserId = neoqlickUser.id;
    admin = (await login(adminUser.email, codeqlickPassword).expect(200)).body as Tokens;
    codeqlick = (await login(shared, codeqlickPassword).expect(200)).body as Tokens;
    neoqlick = (await login(shared, neoqlickPassword, NEO).expect(200)).body as Tokens;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.signupToken.deleteMany({ where: { email: { contains: `-${tag}@` } } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
  });

  describe('the same email in both realms', () => {
    it('signs each realm in separately, with its own password, and says which it is', () => {
      expect(codeqlick.user).toMatchObject({ id: codeqlickUserId, realm: 'CODEQLICK' });
      expect(neoqlick.user).toMatchObject({ id: neoqlickUserId, realm: 'NEOQLICK' });
      expect(codeqlickUserId).not.toBe(neoqlickUserId);
    });

    it('refuses the other realm’s password and never signs into the other user base', async () => {
      await login(shared, neoqlickPassword).expect(401);
      await login(shared, codeqlickPassword, NEO).expect(401);
      // An X-Realm that isn't NEOQLICK is CODEQLICK.
      await login(shared, codeqlickPassword, { 'X-Realm': 'CODEQLICK' }).expect(200);
      await login(shared, codeqlickPassword, { 'X-Realm': 'anything' }).expect(200);
      // An email only one realm has.
      await login(`e2e-realm-nobody-${tag}@codeqlick.test`, neoqlickPassword, NEO).expect(401);
      expect(await prisma.user.count({ where: { email: shared } })).toBe(2);
    });

    it('signs the realm into the access token, and reads one without it as CODEQLICK', async () => {
      const claims = jwt.decode<{ rlm?: string }>(neoqlick.accessToken);
      expect(claims.rlm).toBe('NEOQLICK');
      expect(jwt.decode<{ rlm?: string }>(codeqlick.accessToken).rlm).toBe('CODEQLICK');

      // A token issued before realms existed carries no claim.
      const legacy = await jwt.signAsync({
        sub: codeqlickUserId,
        email: shared,
        name: 'Ada',
        role: 'CLIENT',
      });
      const me = await request(server())
        .get('/v1/auth/me')
        .set(bearer({ accessToken: legacy }));
      expect(me.status).toBe(200);
      expect(me.body.realm).toBe('CODEQLICK');
      await request(server())
        .get('/v1/swipe/me')
        .set(bearer({ accessToken: legacy }))
        .expect(403);
    });

    it('keeps usernames apart per realm', async () => {
      const username = `ada${tag.replace(/-/g, '')}`;
      await request(server())
        .put('/v1/auth/me/username')
        .set(bearer(codeqlick))
        .send({ username })
        .expect(200);
      // The same name is free in the other user base.
      await request(server())
        .put('/v1/auth/me/username')
        .set(bearer(neoqlick))
        .send({ username })
        .expect(200);
      expect(await prisma.user.count({ where: { username } })).toBe(2);
    });
  });

  describe('the realm guard on real routes', () => {
    it('refuses a Codeqlick token on a Neoqlick route and the reverse, with 403', async () => {
      const wrong = await request(server()).get('/v1/swipe/me').set(bearer(codeqlick));
      expect(wrong.status).toBe(403);
      expect(wrong.body.detail ?? wrong.body.message).toContain('Wrong account type');
      await request(server()).get('/v1/cruising/me').set(bearer(codeqlick)).expect(403);
      await request(server()).get('/v1/videochat/me').set(bearer(codeqlick)).expect(403);

      await request(server()).get('/v1/portal/projects').set(bearer(neoqlick)).expect(403);
      await request(server()).get('/v1/cloud/me').set(bearer(neoqlick)).expect(403);
      await request(server()).get('/v1/admin/users').set(bearer(neoqlick)).expect(403);
      await request(server()).get('/v1/admin/overview').set(bearer(neoqlick)).expect(403);
    });

    it('lets each realm into its own routes', async () => {
      await request(server()).get('/v1/portal/projects').set(bearer(codeqlick)).expect(200);
      expect((await request(server()).get('/v1/swipe/me').set(bearer(neoqlick))).status).not.toBe(
        403,
      );
    });

    it('serves the account routes to both', async () => {
      for (const tokens of [codeqlick, neoqlick]) {
        const me = await request(server()).get('/v1/auth/me').set(bearer(tokens)).expect(200);
        expect(me.body.realm).toBe(tokens.user.realm);
        await request(server()).get('/v1/auth/sessions').set(bearer(tokens)).expect(200);
        await request(server()).get('/v1/auth/2fa').set(bearer(tokens)).expect(200);
        await request(server()).get('/v1/auth/passkeys').set(bearer(tokens)).expect(200);
      }
    });

    it('lists a Neoqlick account’s apps without the portal or the admin', async () => {
      const apps = await request(server()).get('/v1/auth/apps').set(bearer(neoqlick)).expect(200);
      const names = (apps.body.items as { app: string }[]).map((item) => item.app);
      expect(names).not.toContain('portal');
      expect(names).not.toContain('admin');
      const own = await request(server()).get('/v1/auth/apps').set(bearer(codeqlick)).expect(200);
      expect((own.body.items as { app: string }[]).map((item) => item.app)).toContain('portal');
    });

    it('refuses a Cloud API token of a Neoqlick account', async () => {
      const token = `cqk_${randomBytes(32).toString('base64url').slice(0, 43)}`;
      const sha = createHash('sha256').update(token).digest('hex');
      await prisma.cloudToken.create({
        data: { userId: neoqlickUserId, name: 'x', prefix: token.slice(0, 12), tokenHash: sha },
      });
      try {
        await request(server())
          .get('/v1/cloud/me')
          .set({ Authorization: `Bearer ${token}` })
          .expect(401);
      } finally {
        await prisma.cloudToken.deleteMany({ where: { userId: neoqlickUserId } });
      }
      expect(await prisma.cloudToken.count({ where: { userId: neoqlickUserId } })).toBe(0);
    });
  });

  describe('sign-up per realm', () => {
    const fresh = `e2e-realm-new-${tag}@codeqlick.test`;
    const body = {
      name: 'Eva',
      email: fresh,
      password: 'brand-new-password-3',
      locale: 'es',
      acceptPrivacy: true,
    };

    it('needs the terms and a Neoqlick app in Neoqlick, and the reverse in Codeqlick', async () => {
      const register = (extra: object, headers: Record<string, string>) =>
        request(server())
          .post('/v1/auth/register')
          .set(ip())
          .set(headers)
          .send({ ...body, ...extra });
      const noTerms = await register({}, NEO).expect(400);
      expect(noTerms.body.errors).toEqual([expect.objectContaining({ path: 'acceptTerms' })]);
      await register({ acceptTerms: true, app: 'meetings' }, NEO).expect(400);
      await register({ app: 'cruising' }, {}).expect(400);
      expect(to(fresh)).toHaveLength(0);
    });

    it('creates the account in the realm of the request, with the terms version', async () => {
      await request(server())
        .post('/v1/auth/register')
        .set(ip())
        .set(NEO)
        .send({ ...body, acceptTerms: true, app: 'cruising' })
        .expect(202);
      const email = to(fresh).at(-1);
      expect(email?.brand).toBe('neoqlick');
      expect(email?.text.toLowerCase()).not.toContain('codeqlick');
      expect(email?.text).toContain('/es/register/confirm?token=');
      const token = tokenIn(email, '/es/register/confirm');

      // The other realm can't spend it.
      await request(server())
        .post('/v1/auth/register/confirm')
        .set(ip())
        .send({ token })
        .expect(400);
      const done = await request(server())
        .post('/v1/auth/register/confirm')
        .set(ip())
        .set(NEO)
        .send({ token })
        .expect(200);
      expect(done.body.user).toMatchObject({ email: fresh, realm: 'NEOQLICK', role: 'CLIENT' });
      const row = await prisma.user.findUniqueOrThrow({
        where: { realm_email: { realm: 'NEOQLICK', email: fresh } },
      });
      expect(row).toMatchObject({ signupApp: 'cruising', termsVersion: '2026-11-17.1' });
      expect(row.termsAcceptedAt).toBeInstanceOf(Date);
      expect(await prisma.user.count({ where: { realm: 'CODEQLICK', email: fresh } })).toBe(0);
    });

    it('lets the same email sign up in the other realm too, as its own account', async () => {
      await request(server())
        .post('/v1/auth/register')
        .set(ip())
        .send({ ...body, password: 'another-password-4' })
        .expect(202);
      const email = to(fresh).at(-1);
      expect(email?.brand).toBeUndefined();
      const token = tokenIn(email, '/es/register/confirm');
      await request(server())
        .post('/v1/auth/register/confirm')
        .set(ip())
        .send({ token })
        .expect(200);
      expect(await prisma.user.count({ where: { email: fresh } })).toBe(2);
      // Each signs in with its own password.
      await login(fresh, 'another-password-4').expect(200);
      await login(fresh, 'brand-new-password-3', NEO).expect(200);
      await login(fresh, 'brand-new-password-3').expect(401);
    });
  });

  describe('password reset per realm', () => {
    it('emails the right account from the right brand, and the link only works there', async () => {
      await request(server())
        .post('/v1/auth/password-reset/request')
        .set(ip())
        .set(NEO)
        .send({ email: shared, locale: 'en' })
        .expect(202);
      const neoEmail = to(shared).at(-1);
      expect(neoEmail?.brand).toBe('neoqlick');
      expect(neoEmail?.text).toContain('/en/reset-password?token=');
      const neoToken = tokenIn(neoEmail, '/en/reset-password');

      await request(server())
        .post('/v1/auth/password-reset/request')
        .set(ip())
        .send({ email: shared, locale: 'en' })
        .expect(202);
      const codeqlickEmail = to(shared).at(-1);
      expect(codeqlickEmail?.brand).toBeUndefined();
      const codeqlickToken = tokenIn(codeqlickEmail, '/en/reset-password');
      expect(neoToken).not.toBe(codeqlickToken);

      // A Neoqlick link spent on Codeqlick's side does nothing, and the reverse.
      await request(server())
        .post('/v1/auth/password-reset/confirm')
        .set(ip())
        .send({ token: neoToken, newPassword: 'reset-password-neo-5' })
        .expect(400);
      await request(server())
        .post('/v1/auth/password-reset/confirm')
        .set(ip())
        .set(NEO)
        .send({ token: codeqlickToken, newPassword: 'reset-password-cq-6' })
        .expect(400);

      await request(server())
        .post('/v1/auth/password-reset/confirm')
        .set(ip())
        .set(NEO)
        .send({ token: neoToken, newPassword: 'reset-password-neo-5' })
        .expect(204);
      await login(shared, 'reset-password-neo-5', NEO).expect(200);
      // Codeqlick's password didn't change.
      await login(shared, codeqlickPassword).expect(200);
    });
  });

  describe('single sign-on per realm', () => {
    const newCode = (tokens: Tokens, client: string, challenge: string) =>
      request(server())
        .post('/v1/auth/sso/codes')
        .set(bearer(tokens))
        .send({ client, codeChallenge: challenge });
    const exchange = (
      client: string,
      code: string,
      codeVerifier: string,
      headers: Record<string, string> = {},
    ) =>
      request(server())
        .post('/v1/auth/sso/exchange')
        .set(ip())
        .set(headers)
        .send({ client, code, codeVerifier });

    it('gives a Neoqlick account codes for Neoqlick’s apps only, and Codeqlick’s for Codeqlick’s', async () => {
      // The reset above ended the Neoqlick account's sessions.
      neoqlick = (await login(shared, 'reset-password-neo-5', NEO).expect(200)).body as Tokens;
      const { challenge } = pkce();
      await newCode(neoqlick, 'site', challenge).expect(400);
      await newCode(neoqlick, 'cloud', challenge).expect(400);
      await newCode(codeqlick, 'cruising', challenge).expect(400);
      await newCode(codeqlick, 'swipe', challenge).expect(400);
      await newCode(neoqlick, 'cruising', challenge).expect(201);
      await newCode(codeqlick, 'site', challenge).expect(201);
      expect(
        await prisma.ssoCode.count({ where: { userId: neoqlickUserId, client: 'site' } }),
      ).toBe(0);
    });

    it('stores the realm of the code and exchanges it only on that realm’s side', async () => {
      const { verifier, challenge } = pkce();
      const { code } = (await newCode(neoqlick, 'cruising', challenge).expect(201)).body as {
        code: string;
      };
      const row = await prisma.ssoCode.findFirstOrThrow({
        where: { userId: neoqlickUserId, client: 'cruising' },
        orderBy: { createdAt: 'desc' },
      });
      expect(row.realm).toBe('NEOQLICK');

      // Without X-Realm the request is Codeqlick's: it can't even name a Neoqlick client.
      await exchange('cruising', code, verifier).expect(400);
      const tokens = (await exchange('cruising', code, verifier, NEO).expect(200)).body as Tokens;
      expect(tokens.user).toMatchObject({ id: neoqlickUserId, realm: 'NEOQLICK' });
      expect(jwt.decode<{ rlm: string }>(tokens.accessToken).rlm).toBe('NEOQLICK');
    });

    it('refuses a code whose realm is not the client’s, even by hand in the database', async () => {
      const { verifier, challenge } = pkce();
      const { code } = (await newCode(codeqlick, 'meetings', challenge).expect(201)).body as {
        code: string;
      };
      await prisma.ssoCode.updateMany({
        where: { userId: codeqlickUserId, client: 'meetings' },
        data: { realm: 'NEOQLICK' },
      });
      await exchange('meetings', code, verifier).expect(400);
      const row = await prisma.ssoCode.findFirstOrThrow({ where: { userId: codeqlickUserId } });
      // Refused before it is spent.
      expect(row.usedAt).toBeNull();
    });
  });

  describe('what the database refuses', () => {
    it('never has a NEOQLICK admin', async () => {
      await expect(
        prisma.user.create({
          data: {
            email: `e2e-realm-neoadmin-${tag}@codeqlick.test`,
            realm: 'NEOQLICK',
            role: Role.ADMIN,
            name: 'No',
            passwordHash: 'x',
          },
        }),
      ).rejects.toThrow(/users_realm_role_check/);
      await expect(
        prisma.user.update({ where: { id: neoqlickUserId }, data: { role: Role.ADMIN } }),
      ).rejects.toThrow(/users_realm_role_check/);
    });

    it('never changes an account’s realm', async () => {
      await expect(
        prisma.user.update({ where: { id: neoqlickUserId }, data: { realm: 'CODEQLICK' } }),
      ).rejects.toThrow(/immutable/);
      await expect(
        prisma.user.update({ where: { id: codeqlickUserId }, data: { realm: 'NEOQLICK' } }),
      ).rejects.toThrow(/immutable/);
      // Saving the same realm, as every other update does, is fine.
      await prisma.user.update({ where: { id: codeqlickUserId }, data: { name: 'Ada' } });
    });

    it('keeps an email and a username unique inside a realm', async () => {
      await expect(
        prisma.user.create({
          data: { email: shared, realm: 'NEOQLICK', name: 'Dup', passwordHash: 'x' },
        }),
      ).rejects.toThrow(/Unique constraint/);
    });
  });

  describe('moderation from Codeqlick’s admin panel', () => {
    it('finds only Codeqlick’s accounts in the users list, one account and the search', async () => {
      await request(server())
        .get(`/v1/admin/users/${neoqlickUserId}`)
        .set(bearer(admin))
        .expect(404);
      await request(server())
        .get(`/v1/admin/users/${codeqlickUserId}`)
        .set(bearer(admin))
        .expect(200);

      const list = await request(server())
        .get('/v1/admin/users')
        .query({ q: shared, pageSize: 50 })
        .set(bearer(admin))
        .expect(200);
      const ids = (list.body.items as { id: string }[]).map((user) => user.id);
      expect(ids).toContain(codeqlickUserId);
      expect(ids).not.toContain(neoqlickUserId);

      const search = await request(server())
        .get('/v1/admin/search')
        .query({ q: shared })
        .set(bearer(admin))
        .expect(200);
      expect(JSON.stringify(search.body)).toContain(codeqlickUserId);
      expect(JSON.stringify(search.body)).not.toContain(neoqlickUserId);

      // It can't be changed or deleted from there either.
      await request(server())
        .patch(`/v1/admin/users/${neoqlickUserId}`)
        .set(bearer(admin))
        .send({ name: 'Hacked' })
        .expect(404);
      await request(server())
        .delete(`/v1/admin/users/${neoqlickUserId}`)
        .set(bearer(admin))
        .expect(404);
    });

    it('works on Neoqlick’s people only from the 18+ routes, answering 404 for anyone else', async () => {
      const joined = {
        adultConfirmedAt: new Date(),
        termsVersion: 'v1',
        termsAcceptedAt: new Date(),
      };
      await prisma.videochatProfile.createMany({
        data: [
          { userId: codeqlickUserId, ...joined },
          { userId: neoqlickUserId, ...joined },
        ],
      });
      for (const app of ['videochat', 'cruising', 'swipe']) {
        await request(server())
          .post(`/v1/admin/${app}/users/${codeqlickUserId}/suspend`)
          .set(bearer(admin))
          .send({ reason: 'x', days: 1 })
          .expect(404);
      }
      await request(server())
        .get(`/v1/admin/videochat/users/${codeqlickUserId}`)
        .set(bearer(admin))
        .expect(404);
      await request(server())
        .get(`/v1/admin/adult/users/${codeqlickUserId}`)
        .set(bearer(admin))
        .expect(404);

      // The same person page of a Neoqlick account is found.
      const found = await request(server())
        .get(`/v1/admin/videochat/users/${neoqlickUserId}`)
        .set(bearer(admin));
      expect(found.status).toBe(200);
      expect(found.body.user.id).toBe(neoqlickUserId);

      // A malformed id is the route's own 400, not a database error.
      await request(server())
        .get('/v1/admin/videochat/users/not-a-uuid')
        .set(bearer(admin))
        .expect(400);
    });

    it('keeps a Neoqlick account out of Codeqlick’s clients and weekly digests', async () => {
      const recipients = await prisma.user.findMany({
        where: { realm: 'CODEQLICK', email: shared },
      });
      expect(recipients).toHaveLength(1);
      const overview = await request(server())
        .get('/v1/admin/overview')
        .set(bearer(admin))
        .expect(200);
      expect(overview.body.people.neoqlickAccounts).toBeGreaterThanOrEqual(1);
    });
  });
});
