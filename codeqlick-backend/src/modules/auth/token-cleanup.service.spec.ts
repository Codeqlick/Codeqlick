import { describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { AuthRepository } from './auth.repository.js';
import type { PasskeyRepository } from './passkeys.repository.js';
import { EXPIRED_RETENTION_DAYS, TokenCleanupService } from './token-cleanup.service.js';

function setup(
  deleteExpired: ReturnType<typeof vi.fn>,
  deleteExpiredChallenges: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(0),
) {
  const repository = { deleteExpired } as unknown as AuthRepository;
  const passkeys = { deleteExpiredChallenges } as unknown as PasskeyRepository;
  const config = { nodeEnv: 'test' } as AppConfigService;
  return new TokenCleanupService(repository, config, passkeys);
}

describe('TokenCleanupService', () => {
  it('deletes rows that expired more than the retention period ago', async () => {
    const deleteExpired = vi.fn().mockResolvedValue({ sessions: 3, resetTokens: 1 });
    const now = new Date('2026-10-14T12:00:00Z');

    await setup(deleteExpired).run(now);

    const before = deleteExpired.mock.calls[0]?.[0] as Date;
    expect(now.getTime() - before.getTime()).toBe(EXPIRED_RETENTION_DAYS * 86_400_000);
  });

  it('deletes passkey challenges as soon as they expire', async () => {
    const deleteExpired = vi.fn().mockResolvedValue({ sessions: 0, resetTokens: 0 });
    const deleteExpiredChallenges = vi.fn().mockResolvedValue(2);
    const now = new Date('2026-11-17T08:00:00Z');

    await setup(deleteExpired, deleteExpiredChallenges).run(now);

    expect(deleteExpiredChallenges).toHaveBeenCalledWith(now);
  });

  it('logs a failed run instead of throwing', async () => {
    const deleteExpired = vi.fn().mockRejectedValue(new Error('database down'));

    await expect(setup(deleteExpired).run()).resolves.toBeUndefined();
  });

  it('schedules nothing in tests', () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    setup(vi.fn()).onApplicationBootstrap();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
