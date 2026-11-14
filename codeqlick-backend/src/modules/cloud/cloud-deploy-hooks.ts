import { randomBytes } from 'node:crypto';

/** Deploy hooks' pure helpers (architecture 4.13 "Deploy hooks", decision 51): tested alone. */

export const HOOK_TOKEN_PREFIX = 'cqd_';
/** `cqd_` + 32 random bytes in base64url (43 characters). */
const HOOK_TOKEN = /^cqd_[A-Za-z0-9_-]{43}$/;

/** A new secret token: `cqd_` + 32 random bytes (base64url). */
export function newHookToken(): string {
  return `${HOOK_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

/** Whether a string can be a hook's token (anything else is unknown without a lookup). */
export function isHookToken(value: string): boolean {
  return HOOK_TOKEN.test(value);
}

/** What the console shows to recognise a token: its first 12 characters. */
export function hookPrefix(token: string): string {
  return token.slice(0, 12);
}

/** The most calls a hook takes a minute, and an IP across hooks. */
export const HOOK_CALLS_PER_MINUTE = 10;
export const HOOK_IP_CALLS_PER_MINUTE = 60;

const PRUNE_EVERY_MS = 10_000;
const MAX_KEYS = 10_000;

/**
 * A sliding window counted in memory (like Cloud's other public endpoints): `take` answers whether
 * the key may go on now, and counts it when it may. Refused attempts are not counted.
 */
export class RateWindow {
  private readonly hits = new Map<string, number[]>();
  private prunedAt = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  take(key: string, now = Date.now()): boolean {
    const since = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((at) => at > since);
    const allowed = recent.length < this.limit;
    if (allowed) recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 2000 && now - this.prunedAt >= PRUNE_EVERY_MS) this.prune(now, since);
    return allowed;
  }

  /** Drops idle keys (at most every 10 s); past a hard cap, the oldest keys go too. */
  private prune(now: number, since: number): void {
    this.prunedAt = now;
    for (const [key, list] of this.hits) {
      if (list.every((at) => at <= since)) this.hits.delete(key);
    }
    for (const key of this.hits.keys()) {
      if (this.hits.size <= MAX_KEYS) break;
      this.hits.delete(key);
    }
  }
}
