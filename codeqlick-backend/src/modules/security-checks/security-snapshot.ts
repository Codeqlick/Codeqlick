import type { SecurityInputs } from './security-check-inputs.js';

/**
 * What the Surface monitor compares between two scans (architecture 4.13, decision 144). A record
 * set is `null` when its lookup failed (not "no records", which is `[]`).
 */
export interface SurfaceSnapshot {
  dns: {
    mx: string[] | null;
    spf: string[] | null;
    dmarc: string[] | null;
    caa: string[] | null;
    mtaSts: string[] | null;
    ns: string[] | null;
    dnssec: 'signed' | 'unsigned' | null;
  };
  cert: { issuer: string | null; expires: string | null; days: number | null };
}

const DAY_MS = 86_400_000;

/** Trimmed, lower-cased, whitespace collapsed, a trailing dot dropped. */
export function normaliseRecord(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase().replace(/\.$/, '');
}

/** A record set normalised, without repeats and sorted; null stays null. */
export function normaliseSet(values: string[] | null): string[] | null {
  if (values === null) return null;
  return [...new Set(values.map(normaliseRecord).filter((value) => value !== ''))].toSorted();
}

/** The snapshot of what was gathered (pure). */
export function buildSnapshot(inputs: SecurityInputs): SurfaceSnapshot {
  const { dns, web, now } = inputs;
  const tls = web.tls;
  const validTo = tls?.validTo ?? null;
  return {
    dns: {
      mx: normaliseSet(dns.mx === null ? null : dns.mx.map((m) => `${m.priority} ${m.exchange}`)),
      // The SPF records come out of the TXT lookup: it failing means they are not known.
      spf: dns.txt === null ? null : normaliseSet(dns.spf.records),
      dmarc: normaliseSet(dns.dmarc),
      caa: normaliseSet(dns.caa),
      mtaSts: dns.mtaSts.failed ? null : normaliseSet(dns.mtaSts.txt),
      ns: normaliseSet(dns.ns),
      dnssec: dns.dnssec.ad === null ? null : dns.dnssec.ad ? 'signed' : 'unsigned',
    },
    cert: {
      issuer: tls?.issuer ? normaliseIssuer(tls.issuer) : null,
      expires: validTo ? validTo.toISOString() : null,
      days: validTo ? Math.floor((validTo.getTime() - now.getTime()) / DAY_MS) : null,
    },
  };
}

/** The issuer's organisation as written, trimmed and with whitespace collapsed. */
function normaliseIssuer(issuer: string): string {
  return issuer.trim().replace(/\s+/g, ' ');
}
