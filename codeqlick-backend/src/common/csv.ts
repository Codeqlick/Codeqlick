/** UTF-8 byte order mark: Excel opens accents correctly when a CSV starts with it. */
export const CSV_BOM = '\uFEFF';

/**
 * One RFC 4180 CSV field. Text that a spreadsheet would read as a formula (=, +, -, @, tab,
 * carriage return at the start) gets a leading apostrophe: exported content may be untrusted.
 */
export function csvField(value: string | null): string {
  if (value === null || value === '') return '';
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** One CSV line (fields joined by commas, CRLF ending). */
export function csvLine(values: Array<string | null>): string {
  return `${values.map(csvField).join(',')}\r\n`;
}
