/** The TLDs offered for a new domain, in this order. */
export const OFFERED_TLDS = ['com', 'es', 'eu'] as const;

/** "Peluquería Ana" → "peluqueria-ana": what a domain label can hold. */
export function toLabel(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/, '');
}

/**
 * The domains to check for what a person typed: a label gets each offered TLD; a full domain is
 * checked first, then its label in the other offered TLDs. Null when nothing usable is left.
 */
export function candidatesOf(input: string): string[] | null {
  const text = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  const parts = text
    .replace(/^www\./, '')
    .split('.')
    .filter(Boolean);
  const tld = parts.length > 1 ? toLabel(parts.at(-1)!) : '';
  const label = toLabel(parts.length > 1 ? parts.slice(0, -1).join('-') : (parts[0] ?? ''));
  if (!label || (parts.length > 1 && !/^[a-z]{2,63}$/.test(tld))) return null;
  const tlds = tld ? [tld, ...OFFERED_TLDS.filter((item) => item !== tld)] : [...OFFERED_TLDS];
  return tlds.map((item) => `${label}.${item}`);
}

/** RDAP answer → availability: 404 is free, 200 taken, anything else unknown. */
export function availableFromRdap(status: number): boolean | null {
  if (status === 404) return true;
  if (status === 200) return false;
  return null;
}
