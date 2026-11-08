import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { SuspicionRow, VideochatStatsRepository } from './videochat-stats.repository.js';
import { suspicionScore, VideochatSuspiciousService } from './videochat-suspicious.service.js';

const NOW = new Date('2026-11-08T12:00:00Z');

function row(overrides: Partial<SuspicionRow> = {}): SuspicionRow {
  return {
    userId: 'u1',
    nickname: 'nick',
    email: 'someone@gmail.com',
    joinedAt: new Date('2026-09-01T00:00:00Z'),
    calls: 10,
    shortCalls: 2,
    skippedFast: 1,
    maxCallsInDay: 5,
    reporters: 0,
    ...overrides,
  };
}

describe('suspicionScore', () => {
  it('scores an ordinary account 0', () => {
    expect(suspicionScore(row(), NOW)).toEqual({ score: 0, reasons: [] });
  });

  it('adds 3 per reporter, up to 9', () => {
    expect(suspicionScore(row({ reporters: 1 }), NOW).score).toBe(3);
    expect(suspicionScore(row({ reporters: 5 }), NOW)).toEqual({ score: 9, reasons: ['reported'] });
  });

  it('weighs being skipped at once only with enough calls', () => {
    expect(suspicionScore(row({ calls: 20, skippedFast: 17 }), NOW).score).toBe(3);
    expect(suspicionScore(row({ calls: 20, skippedFast: 13 }), NOW).score).toBe(1);
    expect(suspicionScore(row({ calls: 10, skippedFast: 10 }), NOW).score).toBe(0);
  });

  it('adds volume, disposable email and busy new accounts', () => {
    const result = suspicionScore(
      row({
        email: 'bot@mailinator.com',
        joinedAt: new Date('2026-11-07T00:00:00Z'),
        calls: 200,
        skippedFast: 0,
        maxCallsInDay: 180,
      }),
      NOW,
    );
    expect(result).toEqual({ score: 5, reasons: ['volume', 'disposable', 'new'] });
  });
});

describe('VideochatSuspiciousService', () => {
  it('lists accounts from score 3, highest first', async () => {
    const repository = {
      suspicionCandidates: vi
        .fn()
        .mockResolvedValue([
          row({ userId: 'fine' }),
          row({ userId: 'one-report', reporters: 1 }),
          row({ userId: 'bot', reporters: 2, calls: 40, skippedFast: 38 }),
        ]),
    } as unknown as VideochatStatsRepository;
    const list = await new VideochatSuspiciousService(repository).list(NOW);
    expect(list.map((item) => [item.userId, item.score])).toEqual([
      ['bot', 9],
      ['one-report', 3],
    ]);
    expect(repository.suspicionCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ callsFrom: '2026-11-02' }),
    );
  });

  it('clears an account, 404 before it joined', async () => {
    const clearSuspicion = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const service = new VideochatSuspiciousService({
      clearSuspicion,
    } as unknown as VideochatStatsRepository);
    await service.clear('u1', NOW);
    expect(clearSuspicion).toHaveBeenCalledWith('u1', NOW);
    await expect(service.clear('u2', NOW)).rejects.toBeInstanceOf(NotFoundException);
  });
});
