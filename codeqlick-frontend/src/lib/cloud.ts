/** Formatting for Codeqlick Cloud's console (architecture 4.13). Pure: server and client. */

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
