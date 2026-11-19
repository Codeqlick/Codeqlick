import { createHash } from 'node:crypto';
import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import type { SurfaceSnapshot } from '../security-checks/security-snapshot.js';
import {
  checkText,
  failureText,
  FAILURE_NOT_FOUND,
  FAILURE_TIMEOUT,
} from '../security-checks/security-check-texts.js';
import type {
  CheckId,
  CheckResult,
  CheckStatus,
  CheckValue,
} from '../security-checks/security-check-types.js';
import { DomainNotFoundError, ScanTimeoutError } from '../security-checks/gather.js';
import { nextRebuild } from './cloud-rebuild-schedule.js';

/** The Surface monitor (architecture 4.13 "Surface monitor", decision 144): pure parts. */

/** Domains scanned per tick. */
export const SURFACE_SCANS_PER_RUN = 5;
/** Scans are kept this long. */
export const SURFACE_KEEP_DAYS = 90;
/** Scans the history lists. */
export const SURFACE_HISTORY = 30;
/** A scan gives up after this long. */
export const SURFACE_TIMEOUT_MS = 60_000;
/** Certificate expiry thresholds, in days, highest first. */
export const EXPIRY_THRESHOLDS = [30, 14, 7] as const;

/** Why a scan failed. */
export type SurfaceError = 'not_found' | 'timeout' | 'error';

export type SurfaceChange =
  | { kind: 'check'; id: string; from: 'pass' | 'warn'; to: 'warn' | 'fail' }
  | { kind: 'cert_expiry'; threshold: 30 | 14 | 7; days: number }
  | { kind: 'cert_issuer'; from: string; to: string }
  | {
      kind: 'records';
      record: 'mx' | 'spf' | 'dmarc' | 'caa' | 'mta-sts' | 'ns' | 'dnssec';
      added: string[];
      removed: string[];
      /** Values left out of `added` and `removed` by the bounds (alerts only). */
      more?: number;
    }
  | { kind: 'libs'; added: string[]; more?: number };

/** A check as stored in a scan's `result`: no titles or explanations. */
export interface StoredCheck {
  id: string;
  status: CheckStatus;
  values: Record<string, CheckValue>;
}

/** What the comparison needs of a stored scan. */
export interface ComparableScan {
  result: unknown;
  snapshot: unknown;
}

// ── Slot ────────────────────────────────────────────────────────────────────────────────────────

export interface SurfaceSlot {
  /** 1–5, Madrid time. */
  hour: number;
  /** 0–59. */
  minute: number;
}

/**
 * A domain's fixed daily slot, from SHA-256 of its id: the second byte picks the hour (01:00–05:59
 * Madrid time) and the third the minute (the helper of the production checks without the weekday).
 * Never stored.
 */
export function surfaceSlot(domainId: string): SurfaceSlot {
  const bytes = createHash('sha256').update(domainId).digest();
  return { hour: (bytes[1]! % 5) + 1, minute: bytes[2]! % 60 };
}

/** The first run of a domain's slot strictly after `after` (Madrid wall-clock time). */
export function nextSurfaceScan(domainId: string, after: Date): Date {
  const slot = surfaceSlot(domainId);
  // A daily schedule always has a next run.
  return nextRebuild({ frequency: 'DAILY', weekday: null, ...slot }, after)!;
}

/** Why a due domain is not scanned this time, or null when it is. */
export function surfaceSkipReason(domain: {
  surfaceMonitor: boolean;
  state: 'PENDING' | 'VERIFIED' | 'LIVE' | 'ERROR';
  project: { deletedAt: Date | null; suspendedAt: Date | null };
}): string | null {
  if (!domain.surfaceMonitor) return 'the monitor was switched off';
  if (domain.state === 'PENDING') return 'the domain is not verified';
  if (domain.project.deletedAt) return 'the project is deleted';
  if (domain.project.suspendedAt) return 'the project is suspended';
  return null;
}

/** The code a failed scan is stored with. */
export function surfaceErrorCode(error: unknown): SurfaceError {
  if (error instanceof DomainNotFoundError) return 'not_found';
  if (error instanceof ScanTimeoutError) return 'timeout';
  return 'error';
}

/** Why a scan failed, in `locale`. */
export function surfaceFailureText(error: string | null, locale: ApiLocale): string {
  const key =
    error === 'not_found' ? FAILURE_NOT_FOUND : error === 'timeout' ? FAILURE_TIMEOUT : '';
  return failureText(key, locale);
}

// ── Reading what is stored ──────────────────────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The stored checks of a scan's `result` (anything that isn't a well-formed entry is dropped). */
export function storedChecks(result: unknown): StoredCheck[] {
  if (!Array.isArray(result)) return [];
  return result.flatMap((entry: unknown) => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.status !== 'string') {
      return [];
    }
    const values = isRecord(entry.values) ? (entry.values as Record<string, CheckValue>) : {};
    return [{ id: entry.id, status: entry.status as CheckStatus, values }];
  });
}

const stringSet = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? (value as string[])
    : null;

/** A stored snapshot, with `null` for anything that is missing or malformed. */
export function readSnapshot(snapshot: unknown): SurfaceSnapshot | null {
  if (!isRecord(snapshot) || !isRecord(snapshot.dns) || !isRecord(snapshot.cert)) return null;
  const { dns, cert } = snapshot;
  const dnssec = dns.dnssec === 'signed' || dns.dnssec === 'unsigned' ? dns.dnssec : null;
  return {
    dns: {
      mx: stringSet(dns.mx),
      spf: stringSet(dns.spf),
      dmarc: stringSet(dns.dmarc),
      caa: stringSet(dns.caa),
      mtaSts: stringSet(dns.mtaSts),
      ns: stringSet(dns.ns),
      dnssec,
    },
    cert: {
      issuer: typeof cert.issuer === 'string' ? cert.issuer : null,
      expires: typeof cert.expires === 'string' ? cert.expires : null,
      days: typeof cert.days === 'number' ? cert.days : null,
    },
  };
}

// ── Changes ─────────────────────────────────────────────────────────────────────────────────────

const RANK: Record<CheckStatus, number> = { pass: 0, warn: 1, fail: 2, info: -1 };

const RECORDS = [
  ['mx', 'mx'],
  ['spf', 'spf'],
  ['dmarc', 'dmarc'],
  ['caa', 'caa'],
  ['mta-sts', 'mtaSts'],
  ['ns', 'ns'],
] as const;

const daysOf = (checks: StoredCheck[]): number | null => {
  const days = checks.find((check) => check.id === 'cert-expiry')?.values.days;
  return typeof days === 'number' ? days : null;
};

const libsOf = (checks: StoredCheck[]): string[] => {
  const libs = checks.find((check) => check.id === 'vulnerable-libs')?.values.libs;
  return stringSet(libs) ?? [];
};

/**
 * What changed from `previous` to `next` (decision 144; pure). `null` on either side of a value is
 * "not known" and never a change. Recovery is not reported.
 */
export function computeChanges(previous: ComparableScan, next: ComparableScan): SurfaceChange[] {
  const before = storedChecks(previous.result);
  const after = storedChecks(next.result);
  const changes: SurfaceChange[] = [];

  // A check got worse (`info` is "couldn't tell": ignored; `cert-expiry` has its own rule).
  const earlier = new Map(before.map((check) => [check.id, check] as const));
  for (const check of after) {
    const old = earlier.get(check.id);
    if (!old || check.id === 'cert-expiry') continue;
    if (old.status === 'info' || check.status === 'info') continue;
    if (RANK[check.status] > RANK[old.status]) {
      changes.push({
        kind: 'check',
        id: check.id,
        from: old.status as 'pass' | 'warn',
        to: check.status as 'warn' | 'fail',
      });
    }
  }

  // The certificate crossed 30, 14 or 7 days: the lowest threshold crossed, once.
  const daysBefore = daysOf(before);
  const daysAfter = daysOf(after);
  if (daysBefore !== null && daysAfter !== null) {
    const crossed = EXPIRY_THRESHOLDS.filter((t) => daysBefore > t && daysAfter <= t);
    const lowest = crossed.at(-1);
    if (lowest !== undefined)
      changes.push({ kind: 'cert_expiry', threshold: lowest, days: daysAfter });
  }

  const old = readSnapshot(previous.snapshot);
  const now = readSnapshot(next.snapshot);

  // The certificate's issuer (its organisation).
  if (
    old?.cert.issuer &&
    now?.cert.issuer &&
    old.cert.issuer.toLowerCase() !== now.cert.issuer.toLowerCase()
  ) {
    changes.push({ kind: 'cert_issuer', from: old.cert.issuer, to: now.cert.issuer });
  }

  // DNS and email records.
  if (old && now) {
    for (const [record, key] of RECORDS) {
      const was = old.dns[key];
      const is = now.dns[key];
      if (was === null || is === null) continue;
      const added = is.filter((value) => !was.includes(value));
      const removed = was.filter((value) => !is.includes(value));
      if (added.length > 0 || removed.length > 0) {
        changes.push({ kind: 'records', record, added, removed });
      }
    }
    if (old.dns.dnssec && now.dns.dnssec && old.dns.dnssec !== now.dns.dnssec) {
      changes.push({
        kind: 'records',
        record: 'dnssec',
        added: [now.dns.dnssec],
        removed: [old.dns.dnssec],
      });
    }
  }

  // New vulnerable libraries or advisories (not when the baseline couldn't tell).
  const libsBefore = earlier.get('vulnerable-libs');
  if (libsBefore && libsBefore.status !== 'info') {
    const known = new Set(libsOf(before));
    const added = libsOf(after).filter((lib) => !known.has(lib));
    if (added.length > 0) changes.push({ kind: 'libs', added });
  }
  return changes;
}

// ── Texts ───────────────────────────────────────────────────────────────────────────────────────

const RECORD_NAMES: Record<string, { en: string; es: string }> = {
  mx: { en: 'MX records', es: 'Registros MX' },
  spf: { en: 'SPF record', es: 'Registro SPF' },
  dmarc: { en: 'DMARC record', es: 'Registro DMARC' },
  caa: { en: 'CAA records', es: 'Registros CAA' },
  'mta-sts': { en: 'MTA-STS record', es: 'Registro MTA-STS' },
  ns: { en: 'Name servers', es: 'Servidores de nombres' },
  dnssec: { en: 'DNSSEC', es: 'DNSSEC' },
};

const STATUS_WORDS: Record<'pass' | 'warn' | 'fail', { en: string; es: string }> = {
  pass: { en: 'pass', es: 'bien' },
  warn: { en: 'warn', es: 'mejorable' },
  fail: { en: 'fail', es: 'fallo' },
};

/** Longest value (DNS record, issuer, library) shown in an alert. */
export const SURFACE_VALUE_MAX = 200;
/** Most values listed per change in an alert. */
export const SURFACE_VALUES_MAX = 10;

/** A value from the scanned domain, cut to 200 characters (code points, so no pair is split). */
export function boundValue(value: string): string {
  const chars = Array.from(value);
  return chars.length > SURFACE_VALUE_MAX
    ? `${chars.slice(0, SURFACE_VALUE_MAX).join('')}…`
    : value;
}

/** Breaks a URL's scheme with a zero-width space so the email layout doesn't link it. */
const defang = (text: string): string => text.replace(/(https?):\/\//gi, '$1:​//');

/** At most 10 bounded values; the rest is counted in `more`. */
export function boundValues(values: string[]): { values: string[]; more: number } {
  return {
    values: values.slice(0, SURFACE_VALUES_MAX).map(boundValue),
    more: Math.max(0, values.length - SURFACE_VALUES_MAX),
  };
}

/** A change with the values from the scanned domain bounded (the webhook payload and the texts). */
export function boundChange(change: SurfaceChange): SurfaceChange {
  switch (change.kind) {
    case 'cert_issuer':
      return { ...change, from: boundValue(change.from), to: boundValue(change.to) };
    case 'records': {
      const added = boundValues(change.added);
      const removed = boundValues(change.removed);
      const more = added.more + removed.more;
      return {
        ...change,
        added: added.values,
        removed: removed.values,
        ...(more > 0 ? { more } : {}),
      };
    }
    case 'libs': {
      const added = boundValues(change.added);
      return { ...change, added: added.values, ...(added.more > 0 ? { more: added.more } : {}) };
    }
    default:
      return change;
  }
}

const moreText = (more: number | undefined, es: boolean) =>
  more ? (es ? ` +${more} más` : ` +${more} more`) : '';

const quoted = (values: string[]) => values.map((value) => `"${value}"`).join(', ');

/** One change as a plain line in `locale` (emails, Slack, Discord). */
export function changeText(raw: SurfaceChange, locale: ApiLocale): string {
  return defang(changeTextOf(raw, locale));
}

function changeTextOf(raw: SurfaceChange, locale: ApiLocale): string {
  const es = locale === 'es';
  const change = boundChange(raw);
  switch (change.kind) {
    case 'check': {
      const title = checkText(change.id as CheckId, change.to, locale, {}).title;
      return `${title}: ${STATUS_WORDS[change.from][locale]} → ${STATUS_WORDS[change.to][locale]}`;
    }
    case 'cert_expiry':
      return es
        ? `El certificado caduca en ${change.days} ${change.days === 1 ? 'día' : 'días'}`
        : `The certificate expires in ${change.days} ${change.days === 1 ? 'day' : 'days'}`;
    case 'cert_issuer':
      return es
        ? `El emisor del certificado ha cambiado: de "${change.from}" a "${change.to}"`
        : `The certificate issuer changed: from "${change.from}" to "${change.to}"`;
    case 'records': {
      const name = RECORD_NAMES[change.record]![locale];
      if (change.record === 'dnssec') {
        return `${name}: ${change.removed[0] ?? '?'} → ${change.added[0] ?? '?'}`;
      }
      const parts = [
        ...(change.removed.length > 0
          ? [`${es ? 'quitado' : 'removed'} ${quoted(change.removed)}`]
          : []),
        ...(change.added.length > 0 ? [`${es ? 'añadido' : 'added'} ${quoted(change.added)}`] : []),
      ];
      return `${name} ${es ? 'cambiado' : 'changed'}: ${parts.join(es ? '; ' : ', ')}${moreText(change.more, es)}`;
    }
    case 'libs': {
      const total = change.added.length + (change.more ?? 0);
      const list = `${change.added.join(', ')}${moreText(change.more, es)}`;
      return es
        ? `${total === 1 ? 'Nueva librería vulnerable' : 'Nuevas librerías vulnerables'}: ${list}`
        : `New vulnerable ${total === 1 ? 'library' : 'libraries'}: ${list}`;
    }
  }
}

/** The short form of a change (no values), for a Slack or Discord line. */
export function changeShortText(change: SurfaceChange, locale: ApiLocale): string {
  const es = locale === 'es';
  switch (change.kind) {
    case 'records': {
      if (change.record === 'dnssec') return changeText(change, locale);
      const name = RECORD_NAMES[change.record]![locale];
      return `${name} ${es ? 'cambiado' : 'changed'}`;
    }
    case 'cert_issuer':
      return es ? 'emisor del certificado cambiado' : 'certificate issuer changed';
    case 'libs':
      return es ? 'nuevas librerías vulnerables' : 'new vulnerable libraries';
    case 'cert_expiry':
      return es
        ? `el certificado caduca en ${change.days} ${change.days === 1 ? 'día' : 'días'}`
        : `certificate expires in ${change.days} ${change.days === 1 ? 'day' : 'days'}`;
    default:
      return changeText(change, locale);
  }
}

/** A checks list as stored: ids, statuses and values only. */
export function toStoredChecks(checks: CheckResult[]): StoredCheck[] {
  return checks.map(({ id, status, values }) => ({ id, status, values }));
}
