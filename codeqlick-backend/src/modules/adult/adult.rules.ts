import { createHash, createHmac } from 'node:crypto';
import type { AdultApp, AdultSuspensionCategory } from '../../generated/prisma/client.js';

/** The three 18+ apps (`ADULT_WEBAPPS`, architecture 4.16). */
export const ADULT_APPS = ['CRUISING', 'SWIPE', 'VIDEOCHAT'] as const satisfies readonly AdultApp[];

/** What a moderator says a suspension is for: the report reasons of the three apps. */
export const SUSPENSION_CATEGORIES = [
  'MINOR',
  'NON_CONSENSUAL',
  'ILLEGAL',
  'HARASSMENT',
  'HATE',
  'SPAM',
  'STOLEN',
  'DANGER',
  'WRONG_INFO',
  'OTHER',
] as const;
export type SuspensionCategory = (typeof SUSPENSION_CATEGORIES)[number];

/** The categories whose suspensions apply in the three apps (decision 114). */
export const SERIOUS_CATEGORIES = [
  'MINOR',
  'NON_CONSENSUAL',
  'ILLEGAL',
] as const satisfies readonly AdultSuspensionCategory[];

/** Whether a suspension of this category (or report reason) is shared in the three apps. */
export function isSeriousCategory(
  category: string | null | undefined,
): category is AdultSuspensionCategory {
  return (SERIOUS_CATEGORIES as readonly string[]).includes(category ?? '');
}

/** The most serious of several report reasons (MINOR first), or null when none is serious. */
export function mostSerious(reasons: readonly string[]): AdultSuspensionCategory | null {
  return SERIOUS_CATEGORIES.find((category) => reasons.includes(category)) ?? null;
}

/** Verification photos a member may send in a day. */
export const VERIFICATIONS_PER_DAY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

/** How long a deleted account's email hash stays after a permanent suspension (decision 120). */
export const PERMANENT_BAN_MS = 2 * 365 * DAY_MS;

/**
 * The email as decision 120 compares it: trimmed and lower-cased; for Gmail (and its old
 * googlemail.com name) without dots and without a `+tag` in the local part.
 */
export function normalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0) return trimmed;
  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    domain = 'gmail.com';
    local = local.split('+')[0]!.replaceAll('.', '');
  }
  return `${local}@${domain}`;
}

/** HMAC-SHA256 (hex) of the normalised email: all that is kept of a banned account (120). */
export function emailHash(key: string, email: string): string {
  return createHmac('sha256', key).update(normalizeEmail(email)).digest('hex');
}

/** When a banned email's hash goes: the suspension's end, or 2 years for a permanent one. */
export function banExpiry(until: Date | null, now: Date): Date {
  return until ?? new Date(now.getTime() + PERMANENT_BAN_MS);
}

/** A suspension in force at `now`: not lifted, and permanent or not over yet. */
export function isActiveSuspension(
  suspension: { liftedAt: Date | null; until: Date | null } | null | undefined,
  now: Date,
): boolean {
  return !!suspension && !suspension.liftedAt && (!suspension.until || suspension.until > now);
}

/**
 * Whether a suspension ending at `next` (null: permanent) replaces one ending at `current` in a
 * profile: the later end wins, so a shared suspension never shortens a longer per-app one.
 */
export function endsLater(next: Date | null, current: Date | null): boolean {
  if (next === null) return true;
  if (current === null) return false;
  return next.getTime() >= current.getTime();
}

/**
 * The opaque reference of one of my blocks in `/adult/blocks` (never the other account's id): a
 * hash of the pair, stable while the block exists.
 */
export function blockRef(blockerId: string, blockedId: string): string {
  return createHash('sha256')
    .update(`adult-block:${blockerId}:${blockedId}`)
    .digest('hex')
    .slice(0, 24);
}

/** The daily allowance of verification photos: the new count and window, or null when used up. */
export function useVerificationTry(
  tries: number,
  since: Date | null,
  now: Date,
): { tries: number; since: Date } | null {
  if (!since || now.getTime() - since.getTime() >= DAY_MS) return { tries: 1, since: now };
  if (tries >= VERIFICATIONS_PER_DAY) return null;
  return { tries: tries + 1, since };
}

/** The account's adult names: the name on an approved paper must still be one of them (113). */
export function nameStillHeld(
  verifiedName: string | null,
  names: { username: string | null; cruising: string | null },
): boolean {
  if (!verifiedName) return true;
  const name = verifiedName.toLowerCase();
  return name === names.username?.toLowerCase() || name === names.cruising?.toLowerCase();
}
