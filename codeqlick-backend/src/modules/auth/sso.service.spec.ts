import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { AuthRepository } from './auth.repository.js';
import { hashRefreshToken, type AuthService } from './auth.service.js';
import type { SsoRepository } from './sso.repository.js';
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
      const { code, expiresIn } = await service.createCode(caller, 'meetings', CHALLENGE, NOW);

      expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(expiresIn).toBe(SSO_CODE_TTL_SECONDS);
      expect(codes.create).toHaveBeenCalledWith({
        codeHash: hashRefreshToken(code),
        userId: 'user-1',
        client: 'meetings',
        codeChallenge: CHALLENGE,
        parentFamilyId: 'family-account',
        expiresAt: new Date(NOW.getTime() + 60_000),
      });
      expect(JSON.stringify(codes.create.mock.calls)).not.toContain(code);
    });

    it('refuses an API token or an access token without a session', async () => {
      await expect(
        service.createCode({ ...caller, via: 'token' }, 'site', CHALLENGE, NOW),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        service.createCode({ ...caller, sessionId: undefined }, 'site', CHALLENGE, NOW),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(codes.create).not.toHaveBeenCalled();
    });

    it('refuses a session that has ended or belongs to someone else', async () => {
      sessions.findLiveFamily.mockResolvedValueOnce(null);
      await expect(service.createCode(caller, 'site', CHALLENGE, NOW)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      sessions.findLiveFamily.mockResolvedValueOnce({ ...liveFamily, userId: 'user-2' });
      await expect(service.createCode(caller, 'site', CHALLENGE, NOW)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(codes.create).not.toHaveBeenCalled();
    });

    it("refuses an app's own session: only the account host's issues codes", async () => {
      sessions.findLiveFamily.mockResolvedValueOnce({ ...liveFamily, parentFamilyId: 'other' });
      await expect(service.createCode(caller, 'citas', CHALLENGE, NOW)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('refuses an inactive or unregistered account', async () => {
      sessions.findUserById.mockResolvedValueOnce({ ...activeUser, isActive: false });
      await expect(service.createCode(caller, 'site', CHALLENGE, NOW)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      sessions.findUserById.mockResolvedValueOnce({ ...activeUser, registeredAt: null });
      await expect(service.createCode(caller, 'site', CHALLENGE, NOW)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('exchange', () => {
    const spentCode = {
      id: 'code-1',
      client: 'meetings',
      codeChallenge: CHALLENGE,
      parentFamilyId: 'family-account',
      userId: 'user-1',
      familyId: null,
      user: activeUser,
    };

    it('gives a new session of the client, linked to the account session', async () => {
      codes.spend.mockResolvedValue({ status: 'spent', code: spentCode });

      const tokens = await service.exchange('meetings', 'c'.repeat(43), VERIFIER, {}, NOW);

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
        service.exchange('meetings', 'c'.repeat(43), VERIFIER, {}, NOW),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(auth.startSsoSession).not.toHaveBeenCalled();
    });

    it('refuses a reused code and revokes the session it gave', async () => {
      codes.spend.mockResolvedValue({
        status: 'reused',
        code: { ...spentCode, familyId: 'family-app' },
      });
      await expect(
        service.exchange('meetings', 'c'.repeat(43), VERIFIER, {}, NOW),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(sessions.revokeFamily).toHaveBeenCalledWith('family-app');
    });

    it('refuses a wrong verifier (the code is spent anyway)', async () => {
      codes.spend.mockResolvedValue({ status: 'spent', code: spentCode });
      await expect(
        service.exchange('meetings', 'c'.repeat(43), `${VERIFIER.slice(0, -1)}A`, {}, NOW),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(auth.startSsoSession).not.toHaveBeenCalled();
    });

    it('refuses when the account session ended or the account is inactive', async () => {
      codes.spend.mockResolvedValue({ status: 'spent', code: spentCode });
      sessions.findLiveFamily.mockResolvedValueOnce(null);
      await expect(
        service.exchange('meetings', 'c'.repeat(43), VERIFIER, {}, NOW),
      ).rejects.toBeInstanceOf(BadRequestException);

      codes.spend.mockResolvedValue({
        status: 'spent',
        code: { ...spentCode, user: { ...activeUser, isActive: false } },
      });
      await expect(
        service.exchange('meetings', 'c'.repeat(43), VERIFIER, {}, NOW),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(auth.startSsoSession).not.toHaveBeenCalled();
    });
  });
});
