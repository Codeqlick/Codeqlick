import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { User } from '../../generated/prisma/client.js';
import type { AuthRepository } from './auth.repository.js';
import { EmailPreferencesService } from './email-preferences.service.js';
import { makeUnsubscribeToken } from './unsubscribe-token.js';

const secret = 'test-secret-test-secret-test-secret-test-secret';
const config = { jwtAccessSecret: secret } as AppConfigService;
const userId = '7d3c3c1e-3c9b-4a43-9a43-2f0f2f8f1a01';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: userId,
    email: 'lin@example.com',
    isActive: true,
    weeklyDigest: true,
    monthlyReport: true,
    ...overrides,
  } as User;
}

describe('EmailPreferencesService', () => {
  let repository: {
    findUserById: ReturnType<typeof vi.fn>;
    setPreferences: ReturnType<typeof vi.fn>;
  };
  let service: EmailPreferencesService;
  const digest = makeUnsubscribeToken({ userId, kind: 'digest' }, secret);
  const report = makeUnsubscribeToken({ userId, kind: 'report' }, secret);

  beforeEach(() => {
    repository = {
      findUserById: vi.fn(async () => makeUser()),
      setPreferences: vi.fn(async () => ({ weeklyDigest: true, monthlyReport: true })),
    };
    service = new EmailPreferencesService(repository as unknown as AuthRepository, config);
  });

  it('tells what a token is about, masked, without changing anything', async () => {
    await expect(service.get(report)).resolves.toEqual({
      kind: 'report',
      subscribed: true,
      email: 'l***@example.com',
    });
    expect(repository.findUserById).toHaveBeenCalledWith(userId);
    expect(repository.setPreferences).not.toHaveBeenCalled();
  });

  it("turns off only the token's email", async () => {
    await service.unsubscribe(digest);
    expect(repository.setPreferences).toHaveBeenCalledWith(userId, { weeklyDigest: false });
    repository.setPreferences.mockClear();
    await service.unsubscribe(report);
    expect(repository.setPreferences).toHaveBeenCalledWith(userId, { monthlyReport: false });
  });

  it('answers the same, without writing, when it already was', async () => {
    repository.findUserById.mockResolvedValue(makeUser({ weeklyDigest: false }));
    await expect(service.set(digest, false)).resolves.toEqual({
      kind: 'digest',
      subscribed: false,
      email: 'l***@example.com',
    });
    expect(repository.setPreferences).not.toHaveBeenCalled();
  });

  it('subscribes again (undo), also for a deactivated account', async () => {
    repository.findUserById.mockResolvedValue(makeUser({ isActive: false, monthlyReport: false }));
    await expect(service.set(report, true)).resolves.toMatchObject({
      kind: 'report',
      subscribed: true,
    });
    expect(repository.setPreferences).toHaveBeenCalledWith(userId, { monthlyReport: true });
  });

  it('answers the same 404 for a forged token and a deleted account', async () => {
    const forged = makeUnsubscribeToken({ userId, kind: 'digest' }, 'another-secret');
    const errors: unknown[] = [];
    for (const attempt of [() => service.get(forged), () => service.get('')]) {
      errors.push(await attempt().catch((error: unknown) => error));
    }
    expect(repository.findUserById).not.toHaveBeenCalled();
    repository.findUserById.mockResolvedValue(null);
    errors.push(await service.unsubscribe(digest).catch((error: unknown) => error));
    expect(repository.setPreferences).not.toHaveBeenCalled();
    for (const error of errors) {
      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).message).toBe('Unsubscribe link not found');
    }
  });
});
