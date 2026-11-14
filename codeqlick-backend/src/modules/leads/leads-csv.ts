import { CSV_BOM, csvField } from '../../common/csv.js';
import type { Lead } from './leads.service.js';

const COLUMNS: [header: string, value: (lead: Lead) => string | null][] = [
  ['created_at', (lead) => lead.createdAt],
  ['name', (lead) => lead.name],
  ['email', (lead) => lead.email ?? ''],
  ['company', (lead) => lead.company],
  ['project_type', (lead) => lead.projectType],
  ['budget', (lead) => lead.budget],
  ['status', (lead) => lead.status],
  ['lost_reason', (lead) => lead.lostReason],
  ['follow_up_on', (lead) => lead.followUpOn],
  ['locale', (lead) => lead.locale],
  ['message', (lead) => lead.message],
  ['notes', (lead) => lead.notes],
  ['id', (lead) => lead.id],
];

/**
 * RFC 4180 CSV with a UTF-8 byte order mark, so Excel opens accents correctly. The contact form
 * is public, so its content is untrusted: `csvField` defuses formulas.
 */
export function leadsToCsv(leads: Lead[]): string {
  const rows = [
    COLUMNS.map(([header]) => header).join(','),
    ...leads.map((lead) => COLUMNS.map(([, value]) => csvField(value(lead))).join(',')),
  ];
  return `${CSV_BOM}${rows.join('\r\n')}\r\n`;
}
