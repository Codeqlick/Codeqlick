import { describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { AuthRepository } from './auth.repository.js';
import { EXPIRED_RETENTION_DAYS, TokenCleanupService } from './token-cleanup.service.js';

function setup(deleteExpired: ReturnType<typeof vi.fn>) {
  const repository = { deleteExpired } as unknown as AuthRepository;
  const config = { nodeEnv: 'test' } as AppConfigService;
  return new TokenCleanupService(repository, config);
}

describe('TokenCleanupService', () => {
  it('deletes rows that expired more than the retention period ago', async () => {
    const deleteExpired = vi.fn().mockResolvedValue({ sessions: 3, resetTokens: 1 });
    const now = new Date('2026-10-14T12:00:00Z');

    await setup(deleteExpired).run(now);

    const before = deleteExpired.mock.calls[0]?.[0] as Date;
    expect(now.getTime() - before.getTime()).toBe(EXPIRED_RETENTION_DAYS * 86_400_000);
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
