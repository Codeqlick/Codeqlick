/** Formatting for Codeqlick Cloud's console (architecture 4.13). Pure: server and client. */

import type { ProblemFieldError } from '@/lib/api/types';
import type { FormState } from '@/lib/forms';

const UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/** 1536 → "1.5 KB" ("1,5 KB" in Spanish). */
export function formatBytes(bytes: number, locale: string): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  const number = new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    maximumFractionDigits: digits,
  }).format(value);
  return `${number} ${UNITS[unit]}`;
}

/** A date and time in Madrid, short: "12 nov 2026, 18:05". */
export function formatWhen(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    timeZone: 'Europe/Madrid',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

/**
 * The teams a project can move to: the caller's other teams where they are an owner or an admin
 * (architecture 4.13, moving a project to another team), in the order given.
 */
export function transferTargets<T extends { slug: string; role: string }>(
  teams: readonly T[],
  current: string,
): T[] {
  return teams.filter(
    (team) => team.slug !== current && (team.role === 'OWNER' || team.role === 'ADMIN'),
  );
}

/** A project's or team's address part: lowercase letters, digits and single dashes. */
export function cloudSlug(text: string, max: number): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
}

// ── Password protection (architecture 4.13) ──────────────────────────────────────────────────

export const PROTECTION_MODES = ['OFF', 'PREVIEWS', 'ALL'] as const;
export type ProtectionMode = (typeof PROTECTION_MODES)[number];
export const PROTECTION_DAYS = [1, 7, 30] as const;
export type ProtectionDays = (typeof PROTECTION_DAYS)[number];

/** Which kind of address: a deployment's (`previews`), or production and custom domains. */
export type AddressKind = 'previews' | 'production';

/** Whether the project's protection asks for the password on that kind of address. */
export function isProtected(mode: ProtectionMode, kind: AddressKind): boolean {
  return mode === 'ALL' || (mode === 'PREVIEWS' && kind === 'previews');
}

/** "https://site.codeqlick.app/" → "site.codeqlick.app" (the host the ticket names). */
export function addressHost(url: string): string {
  return url
    .replace(/^https?:\/\//i, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase();
}

/** A hostname as the console's open route accepts it: lowercase labels, at most 253 characters. */
export function isAddressHost(host: string): boolean {
  return (
    host.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)
  );
}

/**
 * Where the console links an address: the address itself when it's open, otherwise the console's
 * open route (`openPath`), which gets a ticket so team members skip the password.
 */
export function addressHref(
  mode: ProtectionMode,
  kind: AddressKind,
  url: string,
  openPath: string,
): string {
  if (!isProtected(mode, kind)) return url;
  return `${openPath}?host=${encodeURIComponent(addressHost(url))}`;
}

export type ProtectionInput = { mode: ProtectionMode; password?: string; days: ProtectionDays };

/**
 * The settings form as the API's PUT body. The password is write-only: empty keeps the current
 * one, but turning protection on without one already set needs it. It is ignored when turning off.
 */
export function protectionInput(
  form: { mode: string; password: string; days: string },
  hasPassword: boolean,
):
  | { ok: true; input: ProtectionInput }
  | { ok: false; field: 'mode' | 'password' | 'days'; reason: 'invalid' | 'required' } {
  const mode = PROTECTION_MODES.find((item) => item === form.mode);
  if (!mode) return { ok: false, field: 'mode', reason: 'invalid' };
  const days = PROTECTION_DAYS.find((item) => String(item) === form.days);
  if (!days) return { ok: false, field: 'days', reason: 'invalid' };
  if (mode === 'OFF') return { ok: true, input: { mode, days } };
  if (form.password === '') {
    return hasPassword
      ? { ok: true, input: { mode, days } }
      : { ok: false, field: 'password', reason: 'required' };
  }
  if (form.password.length < 8 || form.password.length > 128) {
    return { ok: false, field: 'password', reason: 'invalid' };
  }
  return { ok: true, input: { mode, password: form.password, days } };
}

/** A deploy hook's name is 1 to 60 characters once trimmed; returns the trimmed name or null. */
export function hookName(text: string): string | null {
  const name = text.trim();
  return name.length >= 1 && name.length <= 60 ? name : null;
}

/** A deploy hook's branch as the API accepts it: up to 200 of letters, digits, `_ . / -`. */
export function hookBranchValid(branch: string): boolean {
  return branch.length <= 200 && /^[\w./-]+$/.test(branch);
}

/** The non-default settings of a deployment's rules, to show next to the counts. */
export function ruleSettings(rules: {
  cleanUrls: boolean;
  trailingSlash: boolean | null;
}): Array<{ key: 'cleanUrls' | 'trailingSlash'; value: boolean }> {
  const out: Array<{ key: 'cleanUrls' | 'trailingSlash'; value: boolean }> = [];
  if (!rules.cleanUrls) out.push({ key: 'cleanUrls', value: false });
  if (rules.trailingSlash !== null) out.push({ key: 'trailingSlash', value: rules.trailingSlash });
  return out;
}

/** The parsed `codeqlick.json` as shown read-only in the console. */
export function configJson(config: unknown): string {
  return JSON.stringify(config, null, 2);
}

/** At this percent of a limit the console warns (the API's `CLOUD_USAGE_ALERT_PERCENT`). */
export const USAGE_WARNING_PERCENT = 80;

type UsageMeter = { key: string; used: number; limit: number; percent: number };

/** The limits a team is close to or has reached, or null when none is. */
export function usageWarnings<T extends UsageMeter>(
  meters: readonly T[],
): { level: 'warning' | 'error'; meters: T[] } | null {
  const hit = meters.filter((meter) => meter.percent >= USAGE_WARNING_PERCENT);
  if (hit.length === 0) return null;
  return { level: hit.some((meter) => meter.percent >= 100) ? 'error' : 'warning', meters: hit };
}

/** The Events page's filters (architecture 4.13, Exporting events); the API validates them. */
export type CloudEventFilters = { from?: string; to?: string; action?: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reads the filters from a page's or route's query: dates as `YYYY-MM-DD` (what a date input
 * sends; anything else is dropped), the action trimmed and lowercased. Empty values are left out.
 */
export function cloudEventFilters(
  query: Record<string, string | string[] | undefined>,
): CloudEventFilters {
  const first = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
  const filters: CloudEventFilters = {};
  const from = first(query.from);
  const to = first(query.to);
  const action = first(query.action).toLowerCase().slice(0, 60);
  if (DAY.test(from)) filters.from = from;
  if (DAY.test(to)) filters.to = to;
  if (action) filters.action = action;
  return filters;
}

/** The filters as a query string ("?from=…&action=…"), or "" without any. */
export function cloudEventFiltersQuery(filters: CloudEventFilters): string {
  const params = new URLSearchParams();
  for (const key of ['from', 'to', 'action'] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** The most a `.env` import may send (`POST /cloud/projects/:id/env/import`, architecture 4.13). */
export const ENV_IMPORT_MAX_BYTES = 256 * 1024;

/** A line the API refused in a `.env` import. `line` is null when the API named none. */
export type EnvImportError = { line: number | null; key?: string; message: string };

/** The result of the console's "Import .env" form: the keys, or the lines refused. */
export type EnvImportState = FormState & {
  created?: string[];
  updated?: string[];
  skipped?: string[];
  lineErrors?: EnvImportError[];
};

/**
 * The line errors of a refused `.env` import, from the problem's `errors`
 * (`{ path: 'content', line, key?, message }`), in line order. Never holds a value.
 */
export function envImportErrors(errors: readonly ProblemFieldError[]): EnvImportError[] {
  const result: EnvImportError[] = [];
  for (const item of errors) {
    const line = typeof item.line === 'number' ? item.line : null;
    const error: EnvImportError = { line, message: item.message };
    if (item.key) error.key = item.key;
    result.push(error);
  }
  return result.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
}

/** The "New token" form's choices, as `POST /cloud/tokens` takes them (architecture 4.13). */
export function cloudTokenOptions(form: { team: string; expiry: string; access: string }): {
  teamSlug: string | undefined;
  expiresInDays: 30 | 90 | 365 | null;
  readOnly: boolean;
} {
  const { expiry } = form;
  return {
    teamSlug: form.team || undefined,
    expiresInDays: expiry === '30' ? 30 : expiry === '365' ? 365 : expiry === 'never' ? null : 90,
    // Full unless read only was chosen: anything unexpected keeps the default.
    readOnly: form.access === 'readOnly',
  };
}

/** A deployment's id as the API gives it (a UUID); anything else in the address is a 404. */
export function isDeploymentId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Rows the Files tab shows at first, and how many more each "Show more" adds. */
export const FILE_ROWS_STEP = 500;

/**
 * The files whose path contains every word of `query` (split on spaces), ignoring case. An empty
 * query returns the same array, so a memoised list doesn't change.
 */
export function filterFiles<T extends { path: string }>(
  items: readonly T[],
  query: string,
): readonly T[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return items;
  return items.filter((item) => {
    const path = item.path.toLowerCase();
    return words.every((word) => path.includes(word));
  });
}

/** How a changed file's size moved: "+1.5 KB", "−512 B" (a true minus sign) or "±0 B". */
export function formatSizeChange(size: number, previousSize: number, locale: string): string {
  const delta = size - previousSize;
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
  return `${sign}${formatBytes(Math.abs(delta), locale)}`;
}

/** A project's production lock after a rollback, as the API gives it (`CloudProject`). */
export type ProductionLockInfo = { at: string; by: { id: string; name: string } | null };

/**
 * The values of the "Production is locked" banner: the production deployment's short id (null
 * when there's none), since when, and who locked it (`who` is `former` when they left the team).
 */
export function productionLockValues(
  lock: ProductionLockInfo,
  productionShortId: string | null,
  locale: string,
): { id: string | null; since: string; who: 'person' | 'former'; name: string } {
  return {
    id: productionShortId,
    since: formatWhen(lock.at, locale),
    who: lock.by ? 'person' : 'former',
    name: lock.by?.name ?? '',
  };
}

export type MonitorKeywordMode = 'CONTAINS' | 'NOT_CONTAINS';

/**
 * An HTTP monitor's "text on the page" from its form (architecture 4.13): `null` when left empty
 * (no text check), the trimmed text when it has 1–100 characters on one line, else `undefined`.
 */
export function monitorKeyword(raw: string): string | null | undefined {
  const text = raw.trim();
  if (text === '') return null;
  return text.length <= 100 && !/[\r\n]/.test(text) ? text : undefined;
}

/** The form's "must contain" / "must not contain" choice; anything else is `CONTAINS`. */
export function monitorKeywordMode(raw: string): MonitorKeywordMode {
  return raw === 'NOT_CONTAINS' ? 'NOT_CONTAINS' : 'CONTAINS';
}

/**
 * The forms whose submissions a notification channel gets (decision 63), by name in the
 * channel's order, or null when it gets all of them (no form listed). A form that isn't in
 * `forms` (they couldn't be loaded) shows as "—".
 */
export function notifiedFormNames(
  formIds: string[],
  forms: { id: string; name: string }[],
): string[] | null {
  if (formIds.length === 0) return null;
  const names = new Map(forms.map((form) => [form.id, form.name]));
  return formIds.map((id) => names.get(id) ?? '—');
}
