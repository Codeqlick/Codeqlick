import { Injectable, NotFoundException } from '@nestjs/common';
import { isDisposableEmail } from '../../common/disposable-email.js';
import { madridDay } from './videochat-stats.service.js';
import { VideochatStatsRepository, type SuspicionRow } from './videochat-stats.repository.js';

const DAY_MS = 86_400_000;
/** Calls are looked at over this many days, reports over REPORT_DAYS. */
const CALL_DAYS = 7;
const REPORT_DAYS = 30;
/** "Not suspicious" hides an account this long (unless someone reports it afterwards). */
const CLEARED_DAYS = 30;
/** Listed from this score on, at most LIST_LIMIT, the highest first. */
export const MIN_SCORE = 3;
const LIST_LIMIT = 50;
const CANDIDATES = 2_000;

export type SuspicionReason = 'reported' | 'skipped' | 'volume' | 'disposable' | 'new';

export interface SuspiciousAccount {
  userId: string;
  nickname: string | null;
  email: string;
  joinedAt: string;
  score: number;
  reasons: SuspicionReason[];
  reporters: number;
  calls: number;
  shortCalls: number;
  skippedFast: number;
  maxCallsInDay: number;
}

/** The score of one account and why (architecture 4.7, "Suspicious accounts"). */
export function suspicionScore(
  row: SuspicionRow,
  now: Date,
): { score: number; reasons: SuspicionReason[] } {
  let score = 0;
  const reasons: SuspicionReason[] = [];
  if (row.reporters > 0) {
    score += Math.min(9, row.reporters * 3);
    reasons.push('reported');
  }
  if (row.calls >= 15) {
    const share = row.skippedFast / row.calls;
    if (share >= 0.8) score += 3;
    else if (share >= 0.6) score += 1;
    if (share >= 0.6) reasons.push('skipped');
  }
  if (row.maxCallsInDay >= 150) {
    score += 2;
    reasons.push('volume');
  }
  if (isDisposableEmail(row.email)) {
    score += 2;
    reasons.push('disposable');
  }
  if (now.getTime() - row.joinedAt.getTime() < 3 * DAY_MS && row.calls >= 30) {
    score += 1;
    reasons.push('new');
  }
  return { score, reasons };
}

/** Accounts that look like bots or fake profiles, for the team to review. */
@Injectable()
export class VideochatSuspiciousService {
  constructor(private readonly repository: VideochatStatsRepository) {}

  async list(now: Date = new Date()): Promise<SuspiciousAccount[]> {
    const rows = await this.repository.suspicionCandidates({
      callsFrom: madridDay(new Date(now.getTime() - (CALL_DAYS - 1) * DAY_MS)),
      reportsFrom: new Date(now.getTime() - REPORT_DAYS * DAY_MS),
      clearedAfter: new Date(now.getTime() - CLEARED_DAYS * DAY_MS),
      now,
      limit: CANDIDATES,
    });
    return rows
      .map((row) => ({ row, ...suspicionScore(row, now) }))
      .filter((item) => item.score >= MIN_SCORE)
      .toSorted((a, b) => b.score - a.score || b.row.reporters - a.row.reporters)
      .slice(0, LIST_LIMIT)
      .map(({ row, score, reasons }) => ({
        ...row,
        joinedAt: row.joinedAt.toISOString(),
        score,
        reasons,
      }));
  }

  /** The team looked and it is fine: hidden from the list for 30 days. */
  async clear(userId: string, now: Date = new Date()): Promise<void> {
    if (!(await this.repository.clearSuspicion(userId, now))) {
      throw new NotFoundException('This person has not joined the video chat');
    }
  }
}
