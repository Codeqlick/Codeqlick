/** Formatting for Codeqlick Cloud's console (architecture 4.13). Pure: server and client. */

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
 * The line errors of a refused `.env` import, from the problem's `errors`: `{ line, key?, message }`,
 * or `{ path, message }` with the line number in the path (`3`, `lines.3`). Never holds a value.
 */
export function envImportErrors(errors: readonly unknown[]): EnvImportError[] {
  const result: EnvImportError[] = [];
  for (const item of errors) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (typeof record.message !== 'string') continue;
    let line: number | null = null;
    if (typeof record.line === 'number' && Number.isInteger(record.line)) line = record.line;
    else if (typeof record.path === 'string') {
      const match = /\d+/.exec(record.path);
      if (match) line = Number(match[0]);
    }
    const error: EnvImportError = { line, message: record.message };
    if (typeof record.key === 'string' && record.key) error.key = record.key;
    result.push(error);
  }
  return result.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
}
