import type { Lead } from './leads.service.js';

const COLUMNS: [header: string, value: (lead: Lead) => string | null][] = [
  ['created_at', (lead) => lead.createdAt],
  ['name', (lead) => lead.name],
  ['email', (lead) => lead.email],
  ['company', (lead) => lead.company],
  ['budget', (lead) => lead.budget],
  ['status', (lead) => lead.status],
  ['locale', (lead) => lead.locale],
  ['message', (lead) => lead.message],
  ['notes', (lead) => lead.notes],
  ['id', (lead) => lead.id],
];

/**
 * One CSV field. Text that a spreadsheet would read as a formula (=, +, -, @, tab, carriage return
 * at the start) gets a leading apostrophe: the contact form is public, so its content is untrusted.
 */
export function csvField(value: string | null): string {
  if (value === null || value === '') return '';
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** RFC 4180 CSV with a UTF-8 byte order mark, so Excel opens accents correctly. */
export function leadsToCsv(leads: Lead[]): string {
  const rows = [
    COLUMNS.map(([header]) => header).join(','),
    ...leads.map((lead) => COLUMNS.map(([, value]) => csvField(value(lead))).join(',')),
  ];
  return `\uFEFF${rows.join('\r\n')}\r\n`;
}
