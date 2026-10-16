import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityService } from '../activity/activity.service.js';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { Session, User } from '../../generated/prisma/client.js';
import type { AuthRepository, SessionWithUser } from './auth.repository.js';
import { AuthService, hashRefreshToken, toAuthUser, type AuthTokens } from './auth.service.js';
import { totpCode } from './totp.js';
import type { MailService } from '../mail/mail.service.js';
import type { PasswordService } from './password.service.js';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: '7d3c3c1e-3c9b-4a43-9a43-2f0f2f8f1a01',
    email: 'ada@codeqlick.com',
    passwordHash: '$argon2id$stub',
    name: 'Ada',
    role: 'ADMIN',
    isActive: true,
    totpSecret: null,
    totpEnabledAt: null,
    totpLastStep: null,
    totpRecoveryHashes: [],
    registeredAt: new Date('2026-01-01T00:00:00Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as User;
}

function makeSession(user: User, overrides: Partial<Session> = {}): SessionWithUser {
  return {
    id: 'a1a1a1a1-0000-4000-8000-000000000001',
    userId: user.id,
    tokenHash: hashRefreshToken('old-token'),
    familyId: 'f0f0f0f0-0000-4000-8000-000000000001',
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
    replacedById: null,
    userAgent: null,
    ip: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
    user,
  } as SessionWithUser;
}

describe('AuthService', () => {
  let repository: {
    findUserByEmail: ReturnType<typeof vi.fn>;
    findUserById: ReturnType<typeof vi.fn>;
    createSession: ReturnType<typeof vi.fn>;
    findSessionByTokenHash: ReturnType<typeof vi.fn>;
    rotateSession: ReturnType<typeof vi.fn>;
    revokeSession: ReturnType<typeof vi.fn>;
    revokeFamily: ReturnType<typeof vi.fn>;
    changePassword: ReturnType<typeof vi.fn>;
    replacePasswordResetToken: ReturnType<typeof vi.fn>;
    resetPassword: ReturnType<typeof vi.fn>;
    setPendingTotp: ReturnType<typeof vi.fn>;
    enableTotp: ReturnType<typeof vi.fn>;
    disableTotp: ReturnType<typeof vi.fn>;
    useTotpStep: ReturnType<typeof vi.fn>;
    useRecoveryCode: ReturnType<typeof vi.fn>;
    listActiveSessions: ReturnType<typeof vi.fn>;
    revokeUserFamily: ReturnType<typeof vi.fn>;
    revokeOtherFamilies: ReturnType<typeof vi.fn>;
  };
  let passwords: {
    hash: ReturnType<typeof vi.fn>;
    verify: ReturnType<typeof vi.fn>;
    verifyDummy: ReturnType<typeof vi.fn>;
  };
  let jwt: { signAsync: ReturnType<typeof vi.fn>; verifyAsync: ReturnType<typeof vi.fn> };
  let mail: { send: ReturnType<typeof vi.fn> };
  let service: AuthService;

  beforeEach(() => {
    repository = {
      findUserByEmail: vi.fn(),
      findUserById: vi.fn(),
      createSession: vi.fn().mockResolvedValue(undefined),
      findSessionByTokenHash: vi.fn(),
      rotateSession: vi.fn().mockResolvedValue(true),
      revokeSession: vi.fn().mockResolvedValue(undefined),
      revokeFamily: vi.fn().mockResolvedValue(undefined),
      changePassword: vi.fn().mockResolvedValue(undefined),
      replacePasswordResetToken: vi.fn().mockResolvedValue(undefined),
      resetPassword: vi.fn().mockResolvedValue(true),
      setPendingTotp: vi.fn().mockResolvedValue(undefined),
      enableTotp: vi.fn().mockResolvedValue(undefined),
      disableTotp: vi.fn().mockResolvedValue(undefined),
      useTotpStep: vi.fn().mockResolvedValue(true),
      useRecoveryCode: vi.fn().mockResolvedValue(true),
      listActiveSessions: vi.fn().mockResolvedValue([]),
      revokeUserFamily: vi.fn().mockResolvedValue(true),
      revokeOtherFamilies: vi.fn().mockResolvedValue(undefined),
    };
    passwords = {
      hash: vi.fn(),
      verify: vi.fn(),
      verifyDummy: vi.fn().mockResolvedValue(undefined),
    };
    jwt = {
      signAsync: vi.fn().mockResolvedValue('signed.jwt.token'),
      verifyAsync: vi.fn(),
    };
    mail = { send: vi.fn().mockResolvedValue(undefined) };
    const config = {
      jwtAccessTtl: 900,
      refreshTokenTtlDays: 30,
      siteUrl: 'https://codeqlick.com',
      jwtAccessSecret: 'unit-test-secret-unit-test-secret-1234',
    } as AppConfigService;

    service = new AuthService(
      repository as unknown as AuthRepository,
      passwords as unknown as PasswordService,
      jwt as unknown as JwtService,
      config,
      mail as unknown as MailService,
      { record: vi.fn().mockResolvedValue(undefined) } as unknown as ActivityService,
    );
  });

  describe('login', () => {
    it('returns tokens and creates a session for valid credentials', async () => {
      const user = makeUser();
      repository.findUserByEmail.mockResolvedValue(user);
      passwords.verify.mockResolvedValue(true);

      const result = (await service.login('  ADA@codeqlick.com ', 'correct horse')) as AuthTokens;

      expect(repository.findUserByEmail).toHaveBeenCalledWith('ada@codeqlick.com');
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.expiresIn).toBe(900);
      expect(result.refreshToken).toMatch(/^[\w-]{64}$/);
      expect(result.user).toEqual({ id: user.id, email: user.email, name: 'Ada', role: 'ADMIN' });
      expect(repository.createSession).toHaveBeenCalledTimes(1);
      const session = repository.createSession.mock.calls[0]?.[0] as {
        tokenHash: string;
        familyId: string;
      };
      expect(jwt.signAsync).toHaveBeenCalledWith({
        sub: user.id,
        email: user.email,
        name: 'Ada',
        role: 'ADMIN',
        sid: session.familyId,
      });
      expect(session.tokenHash).toBe(hashRefreshToken(result.refreshToken));
      expect(session.tokenHash).not.toBe(result.refreshToken);
    });

    it('rejects a wrong password', async () => {
      repository.findUserByEmail.mockResolvedValue(makeUser());
      passwords.verify.mockResolvedValue(false);

      await expect(service.login('ada@codeqlick.com', 'nope')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(repository.createSession).not.toHaveBeenCalled();
    });

    it('still runs a dummy verify when the email does not exist', async () => {
      repository.findUserByEmail.mockResolvedValue(null);

      await expect(service.login('ghost@codeqlick.com', 'whatever')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(passwords.verifyDummy).toHaveBeenCalledWith('whatever');
    });

    it('rejects an inactive user even with the right password', async () => {
      repository.findUserByEmail.mockResolvedValue(makeUser({ isActive: false }));
      passwords.verify.mockResolvedValue(true);

      await expect(service.login('ada@codeqlick.com', 'correct horse')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(repository.createSession).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token within the same family', async () => {
      const user = makeUser();
      const session = makeSession(user);
      repository.findSessionByTokenHash.mockResolvedValue(session);

      const result = await service.refresh('old-token');

      expect(repository.findSessionByTokenHash).toHaveBeenCalledWith(hashRefreshToken('old-token'));
      expect(result.refreshToken).not.toBe('old-token');
      expect(repository.rotateSession).toHaveBeenCalledTimes(1);
      const [oldId, next] = repository.rotateSession.mock.calls[0] as [
        string,
        { familyId: string; tokenHash: string; userId: string },
      ];
      expect(oldId).toBe(session.id);
      expect(next.familyId).toBe(session.familyId);
      expect(next.userId).toBe(user.id);
      expect(next.tokenHash).toBe(hashRefreshToken(result.refreshToken));
      expect(repository.revokeFamily).not.toHaveBeenCalled();
    });

    it('revokes the whole family when a rotated token is reused', async () => {
      const session = makeSession(makeUser(), {
        revokedAt: new Date(),
        replacedById: 'a1a1a1a1-0000-4000-8000-000000000002',
      });
      repository.findSessionByTokenHash.mockResolvedValue(session);

      await expect(service.refresh('old-token')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(repository.revokeFamily).toHaveBeenCalledWith(session.familyId);
      expect(repository.rotateSession).not.toHaveBeenCalled();
    });

    it('rejects a signed-out session without treating it as theft', async () => {
      const session = makeSession(makeUser(), { revokedAt: new Date(), replacedById: null });
      repository.findSessionByTokenHash.mockResolvedValue(session);

      await expect(service.refresh('old-token')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(repository.revokeFamily).not.toHaveBeenCalled();
    });

    it('keeps the family id in the new access token', async () => {
      const session = makeSession(makeUser());
      repository.findSessionByTokenHash.mockResolvedValue(session);

      await service.refresh('old-token');
      expect(jwt.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ sid: session.familyId }),
      );
    });

    it('rejects an unknown refresh token', async () => {
      repository.findSessionByTokenHash.mockResolvedValue(null);
      await expect(service.refresh('unknown')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an expired refresh token', async () => {
      const session = makeSession(makeUser(), { expiresAt: new Date(Date.now() - 1000) });
      repository.findSessionByTokenHash.mockResolvedValue(session);
      await expect(service.refresh('old-token')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(repository.rotateSession).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    it('stores the new hash and keeps only the calling session', async () => {
      const user = makeUser();
      repository.findUserById.mockResolvedValue(user);
      passwords.verify.mockResolvedValue(true);
      passwords.hash.mockResolvedValue('$argon2id$new');

      await service.changePassword(user.id, 'old password 123', 'new password 456', 'my-token');

      expect(passwords.verify).toHaveBeenCalledWith(user.passwordHash, 'old password 123');
      expect(repository.changePassword).toHaveBeenCalledWith(
        user.id,
        '$argon2id$new',
        hashRefreshToken('my-token'),
      );
    });

    it('rejects a wrong current password without changing anything', async () => {
      repository.findUserById.mockResolvedValue(makeUser());
      passwords.verify.mockResolvedValue(false);

      await expect(
        service.changePassword('id', 'wrong', 'new password 456', 'my-token'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.changePassword).not.toHaveBeenCalled();
    });

    it('rejects reusing the current password', async () => {
      repository.findUserById.mockResolvedValue(makeUser());
      passwords.verify.mockResolvedValue(true);

      await expect(
        service.changePassword('id', 'same password 123', 'same password 123', 'my-token'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.changePassword).not.toHaveBeenCalled();
    });

    it('rejects a disabled account', async () => {
      repository.findUserById.mockResolvedValue(makeUser({ isActive: false }));

      await expect(
        service.changePassword('id', 'old password 123', 'new password 456', 'my-token'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('requestPasswordReset', () => {
    it('stores only the hash of the token and emails the link in the requested language', async () => {
      const user = makeUser();
      repository.findUserByEmail.mockResolvedValue(user);

      await service.requestPasswordReset(' ADA@codeqlick.com ', 'es');

      expect(repository.findUserByEmail).toHaveBeenCalledWith('ada@codeqlick.com');
      const [userId, tokenHash, expiresAt] = repository.replacePasswordResetToken.mock.calls[0] as [
        string,
        string,
        Date,
      ];
      expect(userId).toBe(user.id);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 59 * 60_000);

      const message = mail.send.mock.calls[0]?.[0] as { to: string; subject: string; text: string };
      expect(message.to).toBe(user.email);
      expect(message.subject).toContain('Restablece');
      const token = /https:\/\/codeqlick\.com\/es\/reset-password\?token=([\w-]+)/.exec(
        message.text,
      )?.[1];
      expect(token).toBeDefined();
      expect(hashRefreshToken(token as string)).toBe(tokenHash);
      expect(message.text).not.toContain(tokenHash);
    });

    it('does nothing, silently, for an unknown or disabled account', async () => {
      repository.findUserByEmail.mockResolvedValue(null);
      await expect(service.requestPasswordReset('nobody@x.com', 'en')).resolves.toBeUndefined();

      repository.findUserByEmail.mockResolvedValue(makeUser({ isActive: false }));
      await expect(
        service.requestPasswordReset('ada@codeqlick.com', 'en'),
      ).resolves.toBeUndefined();

      expect(repository.replacePasswordResetToken).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('still succeeds when the email cannot be sent', async () => {
      repository.findUserByEmail.mockResolvedValue(makeUser());
      mail.send.mockRejectedValue(new Error('smtp down'));

      await expect(
        service.requestPasswordReset('ada@codeqlick.com', 'en'),
      ).resolves.toBeUndefined();
    });
  });

  describe('sendInvitation', () => {
    it('emails a week-long set-your-password link to the reset page', async () => {
      const user = makeUser();

      await service.sendInvitation(user, 'en');

      const [userId, tokenHash, expiresAt] = repository.replacePasswordResetToken.mock.calls[0] as [
        string,
        string,
        Date,
      ];
      expect(userId).toBe(user.id);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 6.9 * 24 * 60 * 60_000);

      const message = mail.send.mock.calls[0]?.[0] as { to: string; subject: string; text: string };
      expect(message.to).toBe(user.email);
      expect(message.subject).toContain('Welcome');
      const token = /https:\/\/codeqlick\.com\/en\/reset-password\?token=([\w-]+)&welcome=1/.exec(
        message.text,
      )?.[1];
      expect(token).toBeDefined();
      expect(hashRefreshToken(token as string)).toBe(tokenHash);
    });

    it('reports a failed send', async () => {
      mail.send.mockRejectedValue(new Error('smtp down'));
      await expect(service.sendInvitation(makeUser(), 'es')).rejects.toThrow('smtp down');
    });
  });

  describe('confirmPasswordReset', () => {
    it('spends the token by its hash', async () => {
      passwords.hash.mockResolvedValue('$argon2id$new');

      await service.confirmPasswordReset('emailed-token', 'new password 456');

      const [tokenHash, hashPassword] = repository.resetPassword.mock.calls[0] as [
        string,
        () => Promise<string>,
      ];
      expect(tokenHash).toBe(hashRefreshToken('emailed-token'));
      await expect(hashPassword()).resolves.toBe('$argon2id$new');
      expect(passwords.hash).toHaveBeenCalledWith('new password 456');
    });

    it('rejects a token that is unknown, used or expired', async () => {
      repository.resetPassword.mockResolvedValue(false);

      await expect(
        service.confirmPasswordReset('bad-token', 'new password 456'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('two-step verification', () => {
    /** Runs the setup through the service and returns the user as stored afterwards. */
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- uses the mocks of the enclosing beforeEach
    async function enrolledUser(): Promise<{
      user: User;
      secret: string;
      recoveryCodes: string[];
    }> {
      const pending = makeUser();
      repository.findUserById.mockResolvedValue(pending);
      const { secret, otpauthUrl } = await service.startTwoFactorSetup(pending.id);
      expect(otpauthUrl).toContain(`secret=${secret}`);
      const sealed = repository.setPendingTotp.mock.calls[0]?.[1] as string;
      expect(sealed).not.toContain(secret);

      repository.findUserById.mockResolvedValue({ ...pending, totpSecret: sealed });
      const step = Math.floor(Date.now() / 30_000);
      const { recoveryCodes } = await service.enableTwoFactor(pending.id, totpCode(secret, step));
      const hashes = repository.enableTotp.mock.calls[0]?.[2] as string[];
      return {
        user: {
          ...pending,
          totpSecret: sealed,
          totpEnabledAt: new Date(),
          totpLastStep: step - 5,
          totpRecoveryHashes: hashes,
        },
        secret,
        recoveryCodes,
      };
    }

    it('enables with a valid code and hands out ten recovery codes once', async () => {
      const { recoveryCodes } = await enrolledUser();
      expect(recoveryCodes).toHaveLength(10);
      expect(new Set(recoveryCodes).size).toBe(10);
      for (const code of recoveryCodes) expect(code).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
      const hashes = repository.enableTotp.mock.calls[0]?.[2] as string[];
      expect(hashes).not.toContain(recoveryCodes[0]);
    });

    it('rejects a wrong first code', async () => {
      const pending = makeUser();
      repository.findUserById.mockResolvedValue(pending);
      await service.startTwoFactorSetup(pending.id);
      const sealed = repository.setPendingTotp.mock.calls[0]?.[1] as string;
      repository.findUserById.mockResolvedValue({ ...pending, totpSecret: sealed });

      await expect(service.enableTwoFactor(pending.id, '000000')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repository.enableTotp).not.toHaveBeenCalled();
    });

    it('answers a correct password with a challenge instead of tokens', async () => {
      const { user } = await enrolledUser();
      repository.findUserByEmail.mockResolvedValue(user);
      passwords.verify.mockResolvedValue(true);
      jwt.signAsync.mockResolvedValue('challenge.jwt');

      const result = await service.login(user.email, 'correct horse');

      expect(result).toEqual({ twoFactorRequired: true, challengeToken: 'challenge.jwt' });
      expect(repository.createSession).not.toHaveBeenCalled();
      const options = jwt.signAsync.mock.calls.at(-1)?.[1] as { secret: string; expiresIn: number };
      expect(options.expiresIn).toBe(300);
      expect(options.secret).not.toBe('unit-test-secret-unit-test-secret-1234');
    });

    it('finishes the sign-in with an authenticator code', async () => {
      const { user, secret } = await enrolledUser();
      repository.findUserById.mockResolvedValue(user);
      jwt.verifyAsync.mockResolvedValue({ sub: user.id, purpose: '2fa' });
      jwt.signAsync.mockResolvedValue('signed.jwt.token');

      const step = Math.floor(Date.now() / 30_000);
      const tokens = await service.verifyTwoFactor('challenge.jwt', totpCode(secret, step));

      expect(tokens.accessToken).toBe('signed.jwt.token');
      expect(repository.useTotpStep).toHaveBeenCalledWith(user.id, step);
      expect(repository.createSession).toHaveBeenCalledTimes(1);
    });

    it('refuses a replayed code, a wrong code and a token for another purpose', async () => {
      const { user, secret } = await enrolledUser();
      repository.findUserById.mockResolvedValue(user);
      jwt.verifyAsync.mockResolvedValue({ sub: user.id, purpose: '2fa' });
      const code = totpCode(secret, Math.floor(Date.now() / 30_000));

      repository.useTotpStep.mockResolvedValue(false);
      await expect(service.verifyTwoFactor('c', code)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(service.verifyTwoFactor('c', '123456')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      jwt.verifyAsync.mockResolvedValue({ sub: user.id, role: 'ADMIN' });
      await expect(service.verifyTwoFactor('c', code)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(repository.createSession).not.toHaveBeenCalled();
    });

    it('accepts each recovery code once', async () => {
      const { user, recoveryCodes } = await enrolledUser();
      repository.findUserById.mockResolvedValue(user);
      jwt.verifyAsync.mockResolvedValue({ sub: user.id, purpose: '2fa' });

      await service.verifyTwoFactor('c', recoveryCodes[0]!.toUpperCase());

      const [, hash, remaining] = repository.useRecoveryCode.mock.calls[0] as [
        string,
        string,
        string[],
      ];
      expect(remaining).toHaveLength(9);
      expect(remaining).not.toContain(hash);
    });

    it('turns it off only with the password and a valid code', async () => {
      const { user, secret } = await enrolledUser();
      repository.findUserById.mockResolvedValue(user);
      const code = totpCode(secret, Math.floor(Date.now() / 30_000));

      passwords.verify.mockResolvedValue(false);
      await expect(service.disableTwoFactor(user.id, 'wrong', code)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      passwords.verify.mockResolvedValue(true);
      await expect(service.disableTwoFactor(user.id, 'right', '000000')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repository.disableTotp).not.toHaveBeenCalled();

      await service.disableTwoFactor(user.id, 'right', code);
      expect(repository.disableTotp).toHaveBeenCalledWith(user.id);
    });
  });

  describe('sessions', () => {
    it('lists live sessions by family and marks the current one', async () => {
      const user = makeUser();
      repository.listActiveSessions.mockResolvedValue([
        makeSession(user, { familyId: 'f1', userAgent: 'Firefox', ip: '1.2.3.4' }),
        makeSession(user, { familyId: 'f2' }),
      ]);

      const sessions = await service.listSessions(user.id, 'f2');

      expect(sessions.map((s) => [s.id, s.current])).toEqual([
        ['f1', false],
        ['f2', true],
      ]);
      expect(sessions[0]).toMatchObject({ userAgent: 'Firefox', ip: '1.2.3.4' });
    });

    it('answers 404 for a session that is not the caller', async () => {
      repository.revokeUserFamily.mockResolvedValue(false);
      await expect(
        service.revokeSession(toAuthUser(makeUser({ id: 'u' })), 'f'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('signs out the other sessions, keeping the one of the refresh token', async () => {
      const user = makeUser();
      const session = makeSession(user);
      repository.findSessionByTokenHash.mockResolvedValue(session);

      await service.revokeOtherSessions(toAuthUser(user), 'old-token');
      expect(repository.revokeOtherFamilies).toHaveBeenCalledWith(user.id, session.familyId);
    });

    it("refuses to keep a session that isn't the caller's", async () => {
      repository.findSessionByTokenHash.mockResolvedValue(makeSession(makeUser({ id: 'other' })));
      await expect(
        service.revokeOtherSessions(toAuthUser(makeUser({ id: 'me' })), 'old-token'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(repository.revokeOtherFamilies).not.toHaveBeenCalled();
    });
  });
});
