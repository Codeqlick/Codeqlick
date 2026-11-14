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
