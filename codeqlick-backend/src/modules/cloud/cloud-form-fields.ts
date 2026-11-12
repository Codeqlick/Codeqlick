/** What a page sent to a Cloud form, checked (architecture 4.13, Forms). Pure: tested alone. */

export const MAX_FIELDS = 30;
export const MAX_NAME = 60;
export const MAX_VALUE = 5000;
export const MAX_TOTAL = 20 * 1024;

export interface ParsedSubmission {
  /** The fields to keep, in the order they came (names to values). */
  fields: Record<string, string>;
  /** A valid `email` field: the email's reply-to. */
  email: string | null;
  /** `_redirect`: where to send the visitor (checked against the project's origins later). */
  redirect: string | null;
  /** `_subject`: the email's subject. */
  subject: string | null;
  /** `_gotcha` filled in: a bot. */
  spam: boolean;
}

export type ParseResult = { ok: true; value: ParsedSubmission } | { ok: false; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** A value as text: lists joined, objects as JSON, nothing for null. */
function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function parseSubmission(body: unknown): ParseResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Send the form fields' };
  }
  const fields: Record<string, string> = {};
  let redirect: string | null = null;
  let subject: string | null = null;
  let spam = false;
  let total = 0;
  for (const [rawName, raw] of Object.entries(body as Record<string, unknown>)) {
    const name = rawName.trim();
    const value = text(raw).replace(/\r\n/g, '\n').trim();
    if (name === '_gotcha') {
      spam = value.length > 0;
      continue;
    }
    if (name === '_redirect') {
      redirect = value.slice(0, 2000) || null;
      continue;
    }
    if (name === '_subject') {
      subject = value.replace(/\s+/g, ' ').slice(0, 150) || null;
      continue;
    }
    if (name.startsWith('_') || name === '') continue;
    if (name.length > MAX_NAME)
      return { ok: false, error: `Field names have at most ${MAX_NAME} characters` };
    if (value.length > MAX_VALUE)
      return { ok: false, error: `"${name}" is longer than ${MAX_VALUE} characters` };
    if (value === '') continue;
    fields[name] = value;
    total += name.length + value.length;
    if (Object.keys(fields).length > MAX_FIELDS)
      return { ok: false, error: `At most ${MAX_FIELDS} fields` };
    if (total > MAX_TOTAL) return { ok: false, error: 'The form is too large' };
  }
  if (!spam && Object.keys(fields).length === 0) return { ok: false, error: 'The form is empty' };
  const candidate = fields.email ?? fields.Email ?? fields.correo;
  const email = candidate && candidate.length <= 254 && EMAIL.test(candidate) ? candidate : null;
  return { ok: true, value: { fields, email, redirect, subject, spam } };
}

/** `https://example.com` of a URL, or null when it isn't http(s). */
export function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.origin : null;
  } catch {
    return null;
  }
}

/** Whether `origin` is one of a project's addresses: production, its deployments, its domains. */
export function isProjectOrigin(
  origin: string,
  project: { slug: string; hostingDomain: string; domains: string[] },
): boolean {
  let host: string;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.port) return false;
    host = url.hostname.toLowerCase();
  } catch {
    return false;
  }
  if (project.domains.includes(host)) return true;
  const suffix = `.${project.hostingDomain}`;
  if (!host.endsWith(suffix)) return false;
  const label = host.slice(0, -suffix.length);
  return label === project.slug || new RegExp(`^${project.slug}--[0-9a-f]{8}$`).test(label);
}

/** The page a post came from, without query or fragment (nothing kept about the visitor). */
export function pageOf(referer: string | undefined): string | null {
  if (!referer) return null;
  try {
    const url = new URL(referer);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return `${url.origin}${url.pathname}`.slice(0, 500);
  } catch {
    return null;
  }
}

/** The submissions as CSV (UTF-8 with BOM, a column per field seen, newest first). */
export function toCsv(
  rows: Array<{ createdAt: Date; data: Record<string, string>; page: string | null }>,
): string {
  const columns: string[] = [];
  for (const row of rows)
    for (const key of Object.keys(row.data)) if (!columns.includes(key)) columns.push(key);
  const cell = (value: string) => {
    // Formulas in a spreadsheet are a known trap: neutralise a leading = + - @.
    const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
    return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [['date', ...columns, 'page'].map(cell).join(',')];
  for (const row of rows) {
    lines.push(
      [row.createdAt.toISOString(), ...columns.map((c) => row.data[c] ?? ''), row.page ?? '']
        .map(cell)
        .join(','),
    );
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** The first moment of `now`'s calendar month in Madrid, and its `yyyy-mm`. */
export function madridMonth(now: Date): { start: Date; key: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  // Midnight of the 1st in Madrid: UTC midnight minus Madrid's offset that day.
  const utcMidnight = Date.UTC(year, month - 1, 1);
  const asMadrid = new Date(
    new Date(utcMidnight).toLocaleString('en-US', { timeZone: 'Europe/Madrid' }),
  ).getTime();
  const asUtc = new Date(
    new Date(utcMidnight).toLocaleString('en-US', { timeZone: 'UTC' }),
  ).getTime();
  return {
    start: new Date(utcMidnight - (asMadrid - asUtc)),
    key: `${year}-${String(month).padStart(2, '0')}`,
  };
}

/** Fields as stored: `[name, value]` pairs, so their order survives jsonb (which sorts keys). */
export function toStored(fields: Record<string, string>): Array<[string, string]> {
  return Object.entries(fields);
}

/** Stored fields back as an object in their order (older rows may be a plain object). */
export function fromStored(data: unknown): Record<string, string> {
  if (Array.isArray(data)) {
    return Object.fromEntries(
      data
        .filter((pair): pair is [string, string] => Array.isArray(pair) && pair.length === 2)
        .map(([k, v]) => [String(k), String(v)]),
    );
  }
  return data && typeof data === 'object' ? (data as Record<string, string>) : {};
}
