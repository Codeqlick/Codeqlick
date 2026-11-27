import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isLoopbackRedirect, type SsoClient } from '../../common/sso-clients.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { AuthRepository } from './auth.repository.js';
import { hashRefreshToken, type AuthService } from './auth.service.js';
import type { SsoRepository } from './sso.repository.js';
import { createSsoCodeSchema, exchangeSsoCodeSchema } from './sso.schemas.js';
import { pkceChallenge, pkceMatches, SSO_CODE_TTL_SECONDS, SsoService } from './sso.service.js';

// RFC 7636, appendix B.
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

const NOW = new Date('2026-11-17T10:00:00Z');
const caller: AuthUser = {
  id: 'user-1',
  email: 'ada@example.com',
  name: 'Ada',
  role: 'CLIENT',
  sessionId: 'family-account',
};
const activeUser = { id: 'user-1', isActive: true, registeredAt: new Date('2026-01-01') };
const liveFamily = { familyId: 'family-account', userId: 'user-1', parentFamilyId: null };
const LOOPBACK = 'http://127.0.0.1:49152/callback';

/** A web client's code request: no redirect address. */
const web = (client: SsoClient) => ({ client, codeChallenge: CHALLENGE, redirectUri: null });
/** A desktop program's exchange, with the address it says the code was sent to. */
const nativeExchange = (redirectUri: string | null) => ({
  client: 'ageofvelkara' as const,
  code: 'c'.repeat(43),
  codeVerifier: VERIFIER,
  redirectUri,
});
/** An exchange without a redirect address, as a web client's callback makes it. */
const swap = (client: SsoClient, code: string, codeVerifier: string) => ({
  client,
  code,
  codeVerifier,
  redirectUri: null,
});

describe('the loopback redirect of a desktop program', () => {
  it('is exactly http://127.0.0.1:<port>/callback with a port from 1024 to 65535', () => {
    const good = ['http://127.0.0.1:1024/callback', LOOPBACK, 'http://127.0.0.1:65535/callback'];
    expect(good.filter((value) => !isLoopbackRedirect(value))).toEqual([]);
    const bad = [
      'http://127.0.0.1:1023/callback',
      'http://127.0.0.1:65536/callback',
      'http://127.0.0.1:99999/callback',
      'http://127.0.0.1:0/callback',
      'http://127.0.0.1:08080/callback',
      'http://127.0.0.1/callback',
      'http://127.0.0.1:/callback',
      'http://localhost:49152/callback',
      'http://[::1]:49152/callback',
      'http://127.0.0.2:49152/callback',
      'http://127.0.0.1.evil.example:49152/callback',
      'https://127.0.0.1:49152/callback',
      'http://user@127.0.0.1:49152/callback',
      'http://127.0.0.1:49152/callback/',
      'http://127.0.0.1:49152/other',
      'http://127.0.0.1:49152/callback?x=1',
      'http://127.0.0.1:49152/callback#x',
      'HTTP://127.0.0.1:49152/callback',
      'http://127.0.0.1:49152/Callback',
      'http://127.0.0.1:49152/callback\n',
      ' http://127.0.0.1:49152/callback',
      '',
      null,
      undefined,
      49152,
    ];
    expect(bad.filter((value) => isLoopbackRedirect(value))).toEqual([]);
  });

  it('is required for a native client and refused for a web client when asking for a code', () => {
    const native = { client: 'ageofvelkara', codeChallenge: CHALLENGE };
    expect(createSsoCodeSchema.safeParse({ ...native, redirectUri: LOOPBACK }).success).toBe(true);
    for (const redirectUri of [undefined, 'http://localhost:49152/callback', 'x'.repeat(200)]) {
      const result = createSsoCodeSchema.safeParse({ ...native, redirectUri });
      expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain('redirectUri');
    }
    expect(
      createSsoCodeSchema.safeParse({ client: 'site', codeChallenge: CHALLENGE }).success,
    ).toBe(true);
    const refused = createSsoCodeSchema.safeParse({
      client: 'meetings',
      codeChallenge: CHALLENGE,
      redirectUri: LOOPBACK,
    });
    expect(refused.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['redirectUri']);
  });

  it('is read as any string at the exchange, so a wrong one fails like any bad code', () => {
    const exchange = { client: 'ageofvelkara', code: 'c'.repeat(43), codeVerifier: VERIFIER };
    for (const redirectUri of [undefined, LOOPBACK, 'http://localhost:1/x']) {
      expect(exchangeSsoCodeSchema.safeParse({ ...exchange, redirectUri }).success).toBe(true);
    }
  });
});

describe('PKCE (S256)', () => {
  it('matches the RFC 7636 example', () => {
    expect(pkceChallenge(VERIFIER)).toBe(CHALLENGE);
    expect(pkceMatches(VERIFIER, CHALLENGE)).toBe(true);
  });

  it('refuses another verifier or a challenge of another length', () => {
    expect(pkceMatches(`${VERIFIER}x`, CHALLENGE)).toBe(false);
    expect(pkceMatches(VERIFIER, CHALLENGE.slice(1))).toBe(false);
  });
});

describe('SsoService', () => {
  let codes: {
    create: ReturnType<typeof vi.fn>;
    spend: ReturnType<typeof vi.fn>;
    setFamily: ReturnType<typeof vi.fn>;
  };
  let sessions: {
    findLiveFamily: ReturnType<typeof vi.fn>;
    findUserById: ReturnType<typeof vi.fn>;
    revokeFamily: ReturnType<typeof vi.fn>;
  };
  let auth: { startSsoSession: ReturnType<typeof vi.fn> };
  let service: SsoService;

  beforeEach(() => {
    codes = {
      create: vi.fn().mockResolvedValue(undefined),
      spend: vi.fn(),
      setFamily: vi.fn().mockResolvedValue(undefined),
    };
    sessions = {
      findLiveFamily: vi.fn().mockResolvedValue(liveFamily),
      findUserById: vi.fn().mockResolvedValue(activeUser),
      revokeFamily: vi.fn().mockResolvedValue(undefined),
    };
    auth = {
      startSsoSession: vi.fn().mockResolvedValue({
        tokens: { accessToken: 'at', refreshToken: 'rt', expiresIn: 900, user: caller },
        familyId: 'family-app',
      }),
    };
    service = new SsoService(
      codes as unknown as SsoRepository,
      sessions as unknown as AuthRepository,
      auth as unknown as AuthService,
    );
  });

  describe('createCode', () => {
    it('stores only the hash of a fresh code, bound to client, challenge and session', async () => {
      const { code, expiresIn } = await service.createCode(caller, web('meetings'), NOW);

      expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(expiresIn).toBe(SSO_CODE_TTL_SECONDS);
      expect(codes.create).toHaveBeenCalledWith({
        codeHash: hashRefreshToken(code),
        userId: 'user-1',
        client: 'meetings',
        codeChallenge: CHALLENGE,
        redirectUri: null,
        parentFamilyId: 'family-account',
        expiresAt: new Date(NOW.getTime() + 60_000),
      });
      expect(JSON.stringify(codes.create.mock.calls)).not.toContain(code);
    });

    it('refuses an API token or an access token without a session', async () => {
      await expect(
        service.createCode({ ...caller, via: 'token' }, web('site'), NOW),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        service.createCode({ ...caller, sessionId: undefined }, web('site'), NOW),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(codes.create).not.toHaveBeenCalled();
    });

    it('refuses a session that has ended or belongs to someone else', async () => {
      sessions.findLiveFamily.mockResolvedValueOnce(null);
      await expect(service.createCode(caller, web('site'), NOW)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      sessions.findLiveFamily.mockResolvedValueOnce({ ...liveFamily, userId: 'user-2' });
      await expect(service.createCode(caller, web('site'), NOW)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(codes.create).not.toHaveBeenCalled();
    });

    it("refuses an app's own session: only the account host's issues codes", async () => {
      sessions.findLiveFamily.mockResolvedValueOnce({ ...liveFamily, parentFamilyId: 'other' });
      await expect(service.createCode(caller, web('citas'), NOW)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('refuses an inactive or unregistered account', async () => {
      sessions.findUserById.mockResolvedValueOnce({ ...activeUser, isActive: false });
      await expect(service.createCode(caller, web('site'), NOW)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      sessions.findUserById.mockResolvedValueOnce({ ...activeUser, registeredAt: null });
      await expect(service.createCode(caller, web('site'), NOW)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('exchange', () => {
    const spentCode = {
      id: 'code-1',
      client: 'meetings',
      codeChallenge: CHALLENGE,
      redirectUri: null,
      parentFamilyId: 'family-account',
      userId: 'user-1',
      familyId: null,
      user: activeUser,
    };

    it('gives a new session of the client, linked to the account session', async () => {
      codes.spend.mockResolvedValue({ status: 'spent', code: spentCode });

      const tokens = await service.exchange(swap('meetings', 'c'.repeat(43), VERIFIER), {}, NOW);

      expect(codes.spend).toHaveBeenCalledWith(hashRefreshToken('c'.repeat(43)), 'meetings', NOW);
      expect(auth.startSsoSession).toHaveBeenCalledWith(
        activeUser,
        { client: 'meetings', parentFamilyId: 'family-account' },
        {},
      );
      expect(codes.setFamily).toHaveBeenCalledWith('code-1', 'family-app');
      expect(tokens.accessToken).toBe('at');
    });

    it('refuses an unknown, expired or other client’s code', async () => {
      codes.spend.mockResolvedValue({ status: 'invalid' });
      await expect(
        service.exchange(swap('meetings', 'c'.repeat(43), VERIFIER), {}, NOW),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(auth.startSsoSession).not.toHaveBeenCalled();
    });

    it('refuses a reused code and revokes the session it gave', async () => {
      codes.spend.mockResolvedValue({
        status: 'reused',
        code: { ...spentCode, familyId: 'family-app' },
      });
      await expect(
        service.exchange(swap('meetings', 'c'.repeat(43), VERIFIER), {}, NOW),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(sessions.revokeFamily).toHaveBeenCalledWith('family-app');
    });

    it('refuses a wrong verifier (the code is spent anyway)', async () => {
      codes.spend.mockResolvedValue({ status: 'spent', code: spentCode });
      await expect(
        service.exchange(swap('meetings', 'c'.repeat(43), `${VERIFIER.slice(0, -1)}A`), {}, NOW),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(auth.startSsoSession).not.toHaveBeenCalled();
    });

    it('refuses when the account session ended or the account is inactive', async () => {
      codes.spend.mockResolvedValue({ status: 'spent', code: spentCode });
      sessions.findLiveFamily.mockResolvedValueOnce(null);
      await expect(
        service.exchange(swap('meetings', 'c'.repeat(43), VERIFIER), {}, NOW),
      ).rejects.toBeInstanceOf(BadRequestException);

      codes.spend.mockResolvedValue({
        status: 'spent',
        code: { ...spentCode, user: { ...activeUser, isActive: false } },
      });
      await expect(
        service.exchange(swap('meetings', 'c'.repeat(43), VERIFIER), {}, NOW),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(auth.startSsoSession).not.toHaveBeenCalled();
    });
  });

  describe('a desktop program (native client)', () => {
    const native = { client: 'ageofvelkara' as const, codeChallenge: CHALLENGE };
    const nativeCode = {
      id: 'code-2',
      client: 'ageofvelkara',
      codeChallenge: CHALLENGE,
      redirectUri: LOOPBACK,
      parentFamilyId: 'family-account',
      userId: 'user-1',
      familyId: null,
      user: activeUser,
    };
    it('stores the loopback address with the code', async () => {
      await service.createCode(caller, { ...native, redirectUri: LOOPBACK }, NOW);
      expect(codes.create).toHaveBeenCalledWith(
        expect.objectContaining({ client: 'ageofvelkara', redirectUri: LOOPBACK }),
      );
    });

    it('refuses a code without a valid address, or a web client’s with one', async () => {
      for (const redirectUri of [null, 'http://localhost:49152/callback']) {
        await expect(
          service.createCode(caller, { ...native, redirectUri }, NOW),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
      await expect(
        service.createCode(caller, { ...web('site'), redirectUri: LOOPBACK }, NOW),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(codes.create).not.toHaveBeenCalled();
    });

    it('exchanges the code with the same address for a session labelled with the program', async () => {
      codes.spend.mockResolvedValue({ status: 'spent', code: nativeCode });
      const info = {
        userAgent: 'AgeOfVelkara/1.0 (Windows NT 10.0; Win64; x64)',
        ip: '203.0.113.9',
      };

      const tokens = await service.exchange(nativeExchange(LOOPBACK), info, NOW);

      expect(codes.spend).toHaveBeenCalledWith(
        hashRefreshToken('c'.repeat(43)),
        'ageofvelkara',
        NOW,
      );
      expect(auth.startSsoSession).toHaveBeenCalledWith(
        activeUser,
        { client: 'ageofvelkara', parentFamilyId: 'family-account' },
        info,
      );
      expect(tokens.refreshToken).toBe('rt');
    });

    it('refuses a missing or different address, with the same answer', async () => {
      for (const redirectUri of [null, 'http://127.0.0.1:49153/callback', `${LOOPBACK}/`]) {
        codes.spend.mockResolvedValue({ status: 'spent', code: nativeCode });
        const failure = await service
          .exchange(nativeExchange(redirectUri), {}, NOW)
          .catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(BadRequestException);
        expect((failure as BadRequestException).message).toBe('Invalid or expired code');
      }
      expect(auth.startSsoSession).not.toHaveBeenCalled();
    });

    it('refuses an address sent with a web client’s code', async () => {
      codes.spend.mockResolvedValue({
        status: 'spent',
        code: { ...nativeCode, client: 'site', redirectUri: null },
      });
      await expect(
        service.exchange(
          { ...swap('site', 'c'.repeat(43), VERIFIER), redirectUri: LOOPBACK },
          {},
          NOW,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(auth.startSsoSession).not.toHaveBeenCalled();
    });
  });
});
