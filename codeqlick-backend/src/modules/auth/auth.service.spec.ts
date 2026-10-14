import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { Session, User } from '../../generated/prisma/client.js';
import type { AuthRepository, SessionWithUser } from './auth.repository.js';
import { AuthService, hashRefreshToken } from './auth.service.js';
import type { PasswordService } from './password.service.js';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: '7d3c3c1e-3c9b-4a43-9a43-2f0f2f8f1a01',
    email: 'ada@codeqlick.com',
    passwordHash: '$argon2id$stub',
    name: 'Ada',
    role: 'ADMIN',
    isActive: true,
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
  };
  let passwords: {
    hash: ReturnType<typeof vi.fn>;
    verify: ReturnType<typeof vi.fn>;
    verifyDummy: ReturnType<typeof vi.fn>;
  };
  let jwt: { signAsync: ReturnType<typeof vi.fn> };
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
    };
    passwords = {
      hash: vi.fn(),
      verify: vi.fn(),
      verifyDummy: vi.fn().mockResolvedValue(undefined),
    };
    jwt = { signAsync: vi.fn().mockResolvedValue('signed.jwt.token') };
    const config = { jwtAccessTtl: 900, refreshTokenTtlDays: 30 } as AppConfigService;

    service = new AuthService(
      repository as unknown as AuthRepository,
      passwords as unknown as PasswordService,
      jwt as unknown as JwtService,
      config,
    );
  });

  describe('login', () => {
    it('returns tokens and creates a session for valid credentials', async () => {
      const user = makeUser();
      repository.findUserByEmail.mockResolvedValue(user);
      passwords.verify.mockResolvedValue(true);

      const result = await service.login('  ADA@codeqlick.com ', 'correct horse');

      expect(repository.findUserByEmail).toHaveBeenCalledWith('ada@codeqlick.com');
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.expiresIn).toBe(900);
      expect(result.refreshToken).toMatch(/^[\w-]{64}$/);
      expect(result.user).toEqual({ id: user.id, email: user.email, name: 'Ada', role: 'ADMIN' });
      expect(jwt.signAsync).toHaveBeenCalledWith({
        sub: user.id,
        email: user.email,
        name: 'Ada',
        role: 'ADMIN',
      });

      expect(repository.createSession).toHaveBeenCalledTimes(1);
      const session = repository.createSession.mock.calls[0]?.[0] as { tokenHash: string };
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
      const session = makeSession(makeUser(), { revokedAt: new Date() });
      repository.findSessionByTokenHash.mockResolvedValue(session);

      await expect(service.refresh('old-token')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(repository.revokeFamily).toHaveBeenCalledWith(session.familyId);
      expect(repository.rotateSession).not.toHaveBeenCalled();
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
});
