/**
 * Pure rules of Cruising's safety and health features (architecture 4.15, phase 5): the "Check on
 * me" timer and its trusted contacts (decision 95), and sexual health (decision 94).
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

// ---- "Check on me" timer (decision 95) ------------------------------------------------------------

/** Trusted contacts a member can name. */
export const MAX_TRUSTED_CONTACTS = 2;
/** A timer lasts from 30 minutes… */
export const TIMER_MIN_MINUTES = 30;
/** …to 6 hours, and extending it never takes it further than 6 hours from now. */
export const TIMER_MAX_MINUTES = 6 * 60;
/** The shortest extension. */
export const TIMER_EXTEND_MIN_MINUTES = 15;
/** The member is reminded this long before the end. */
export const TIMER_WARN_MS = 10 * MINUTE_MS;
/** Timers are deleted this long after they end. */
export const TIMER_KEEP_MS = 7 * DAY_MS;

/** When a timer of `minutes` started at `now` runs out. */
export function timerEnd(minutes: number, now: Date): Date {
  return new Date(now.getTime() + minutes * MINUTE_MS);
}

/**
 * The end of a timer extended by `minutes` (from its current end, or from now when that has passed),
 * or null when it would end more than 6 hours from now.
 */
export function extendedEnd(endsAt: Date, minutes: number, now: Date): Date | null {
  const from = Math.max(endsAt.getTime(), now.getTime());
  const end = new Date(from + minutes * MINUTE_MS);
  return end.getTime() - now.getTime() > TIMER_MAX_MINUTES * MINUTE_MS ? null : end;
}

/** What the background check knows of a timer. */
export interface TimerState {
  endsAt: Date;
  warnedAt: Date | null;
  firedAt: Date | null;
  endedAt: Date | null;
}

/**
 * What the background check does with a timer now: `fire` once it ran out unended (once: never
 * again after `firedAt`), `warn` in its last 10 minutes (once: `warnedAt`), or nothing.
 */
export function timerAction(timer: TimerState, now: Date): 'warn' | 'fire' | null {
  if (timer.endedAt || timer.firedAt) return null;
  if (timer.endsAt.getTime() <= now.getTime()) return 'fire';
  if (!timer.warnedAt && timer.endsAt.getTime() - now.getTime() <= TIMER_WARN_MS) return 'warn';
  return null;
}

/** When a timer is over: ended by the member, or its end passed. */
export function timerFinishedAt(timer: { endsAt: Date; endedAt: Date | null }): Date {
  return timer.endedAt && timer.endedAt < timer.endsAt ? timer.endedAt : timer.endsAt;
}

/** OpenStreetMap at a point (the same link as the admin's). */
export function osmLink(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
}

/** A new random token for an invitation link (base64url, 256 bits). */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** How an invitation token is stored: SHA-256, hex. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const STOP_LABEL = 'cruising-contact-stop';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

function stopSignature(contactId: string, secret: string): Buffer {
  const key = createHmac('sha256', secret).update(STOP_LABEL).digest();
  return createHmac('sha256', key).update(contactId).digest();
}

/**
 * The token of a contact's stop link: `stop.<contactId>.<HMAC>`, stateless, so every email can
 * carry it and it works at any time (rotating JWT_ACCESS_SECRET is the only thing that breaks it).
 */
export function makeStopToken(contactId: string, secret: string): string {
  return `stop.${contactId}.${stopSignature(contactId, secret).toString('base64url')}`;
}

/** The contact of a genuine stop token; null for anything else. */
export function verifyStopToken(token: string, secret: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'stop') return null;
  const [, contactId, signature] = parts as [string, string, string];
  if (!UUID.test(contactId) || !BASE64URL.test(signature)) return null;
  const expected = stopSignature(contactId, secret);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return contactId;
}

/** The time of an alert as the email prints it: day and time in UTC, in the contact's language. */
export function formatAlertTime(date: Date, locale: 'en' | 'es'): string {
  const text = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
  return `${text} UTC`;
}

// ---- Sexual health (decision 94) ------------------------------------------------------------------

export const PREP_STATUSES = ['ON_PREP', 'NOT_ON_PREP'] as const;
export const REMINDER_MONTHS = [3, 6] as const;

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** A `YYYY-MM` from 2000 to the current month (UTC): a test can't be in the future. */
export function isValidTestMonth(value: string, now: Date = new Date()): boolean {
  const match = MONTH.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 2000) return false;
  const current = now.getUTCFullYear() * 12 + now.getUTCMonth();
  return year * 12 + (month - 1) <= current;
}

/** When the check-up is due: the first day (UTC) of the month `months` after `lastTestedMonth`. */
export function healthReminderDue(lastTestedMonth: string, months: number): Date | null {
  const match = MONTH.exec(lastTestedMonth);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + months, 1));
}

/** What another member sees of someone's sexual health: only when it's on and they show it. */
export function visibleHealth(profile: {
  healthConsentAt: Date | null;
  healthVisible: boolean;
  prepStatus: 'ON_PREP' | 'NOT_ON_PREP' | null;
  lastTestedMonth: string | null;
}): { prepStatus: 'ON_PREP' | 'NOT_ON_PREP' | null; lastTestedMonth: string | null } | null {
  if (!profile.healthConsentAt || !profile.healthVisible) return null;
  if (!profile.prepStatus && !profile.lastTestedMonth) return null;
  return { prepStatus: profile.prepStatus, lastTestedMonth: profile.lastTestedMonth };
}

/** Whether a member is reminded now: on, due, and not reminded since it became due. */
export function healthReminderNeeded(
  profile: {
    healthConsentAt: Date | null;
    lastTestedMonth: string | null;
    reminderMonths: number | null;
    healthRemindedAt: Date | null;
  },
  now: Date,
): boolean {
  if (!profile.healthConsentAt || !profile.lastTestedMonth || !profile.reminderMonths) return false;
  const due = healthReminderDue(profile.lastTestedMonth, profile.reminderMonths);
  if (!due || due > now) return false;
  return !profile.healthRemindedAt || profile.healthRemindedAt < due;
}
