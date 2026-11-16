import { createHash, randomBytes } from 'node:crypto';

/**
 * Email subscriptions to a status page (architecture 4.13, decision 105): the pure rules. The
 * service and the repository use them; the tests read them directly.
 */

export type DispatchKind = 'NOTICE' | 'UPDATE' | 'RESOLVED' | 'MAINTENANCE_STARTED';

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** How long a confirmation link works. */
export const CONFIRM_TTL_MS = 48 * HOUR_MS;
/** At most one confirmation email per address and team in this time. */
export const CONFIRM_RESEND_MS = 10 * MINUTE_MS;
/** At most this many confirmation emails per address a day, over all teams. */
export const CONFIRMS_PER_ADDRESS_DAY = 5;
/** Sign-ups per team an hour, from everyone (the per-IP limit is the route's). */
export const SIGNUPS_PER_TEAM_HOUR = 60;
/** `PENDING` rows are deleted this long after their confirmation expired. */
export const PENDING_RETENTION_MS = 7 * DAY_MS;
/** `UNSUBSCRIBED` rows (kept to respect the opt-out) are deleted after this long. */
export const UNSUBSCRIBED_RETENTION_MS = 365 * DAY_MS;
/** A dispatch not finished after this long is dropped: stale news is worse than none. */
export const DISPATCH_MAX_AGE_MS = DAY_MS;
/** Completed dispatches are deleted after this long. */
export const DISPATCH_RETENTION_MS = 30 * DAY_MS;
/** Per run of the job: dispatches looked at, subscribers per batch and emails in all. */
export const DISPATCHES_PER_RUN = 3;
export const BATCH_SIZE = 200;
export const EMAILS_PER_RUN = 400;
/** The hourly window of a team's subscriber emails. */
export const EMAIL_WINDOW_MS = HOUR_MS;

/** A confirmation token (sent) and its SHA-256 hex (stored). */
export function newConfirmToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** The unsubscribe token: 32 random bytes, kept in clear like the newsletter's. */
export function newUnsubscribeToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * An address as the console shows it: the first character of the local part and of the domain's
 * first label, and the domain's last label. `john.doe@example.co.uk` → `j***@e***.uk`.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return '***';
  const local = email.slice(0, at);
  const labels = email.slice(at + 1).split('.');
  const first = labels[0] ?? '';
  const tld = labels.length > 1 ? `.${labels.at(-1)}` : '';
  return `${local[0]}***@${first[0] ?? ''}***${tld}`;
}

/**
 * What a new update of a notice sends: `RESOLVED` when it resolves an incident or completes a
 * maintenance, otherwise `UPDATE` (a note, a new state, or reopening an incident).
 */
export function updateDispatchKind(state: string | null): DispatchKind {
  return state === 'RESOLVED' || state === 'COMPLETED' ? 'RESOLVED' : 'UPDATE';
}

/** Why a sign-up gets no confirmation email (`null`: send one). */
export type ConfirmSkip = 'active' | 'recent' | 'address-day';

/**
 * Whether to email a confirmation: never to an `ACTIVE` address, at most one per address and team
 * every 10 minutes, at most 5 a day per address over all teams (`sentToday` counts the rows of
 * that address whose confirmation went in the last 24 hours, this team's included).
 */
export function confirmSkip(
  existing: { status: string; confirmSentAt: Date | null } | null,
  sentToday: number,
  now: Date,
): ConfirmSkip | null {
  if (existing?.status === 'ACTIVE') return 'active';
  if (
    existing?.confirmSentAt &&
    now.getTime() - existing.confirmSentAt.getTime() < CONFIRM_RESEND_MS
  ) {
    return 'recent';
  }
  if (sentToday >= CONFIRMS_PER_ADDRESS_DAY) return 'address-day';
  return null;
}

/**
 * Room left in a team's hour of subscriber emails, and the window it is counted in: a window
 * starts at the first send and lasts an hour; a passed or missing one starts again now.
 */
export function emailRoom(
  page: { emailWindowStart: Date | null; emailsInWindow: number },
  perHour: number,
  now: Date,
): { windowStart: Date; used: number; room: number } {
  const current =
    page.emailWindowStart && now.getTime() - page.emailWindowStart.getTime() < EMAIL_WINDOW_MS;
  const windowStart = current ? page.emailWindowStart! : now;
  const used = current ? page.emailsInWindow : 0;
  return { windowStart, used, room: Math.max(0, perHour - used) };
}

/** Whether the public page offers the form: subscriptions on and room under the plan's cap. */
export function canSubscribe(subscriptions: boolean, count: number, cap: number): boolean {
  return subscriptions && count < cap;
}

/**
 * Fixed one-hour windows per team, in memory: at most `limit` sign-ups each. At most `maxKeys`
 * teams are remembered (expired ones go first, then the oldest).
 */
export class TeamSignupLimiter {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit = SIGNUPS_PER_TEAM_HOUR,
    private readonly windowMs = HOUR_MS,
    private readonly maxKeys = 10_000,
  ) {}

  /** Counts a sign-up; false when the team is already at its limit for this hour. */
  take(teamId: string, now: number = Date.now()): boolean {
    const entry = this.entries.get(teamId);
    if (entry && entry.resetAt > now) {
      if (entry.count >= this.limit) return false;
      entry.count += 1;
      return true;
    }
    this.entries.delete(teamId);
    if (this.entries.size >= this.maxKeys) {
      for (const [key, value] of this.entries) if (value.resetAt <= now) this.entries.delete(key);
      for (const key of this.entries.keys()) {
        if (this.entries.size < this.maxKeys) break;
        this.entries.delete(key);
      }
    }
    this.entries.set(teamId, { count: 1, resetAt: now + this.windowMs });
    return true;
  }

  /** Forgets every count (tests). */
  reset(): void {
    this.entries.clear();
  }
}
