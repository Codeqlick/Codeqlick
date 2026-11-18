import type { DnsInputs } from './security-check-inputs.js';
import type { CheckResult, CheckStatus, CheckValue, CheckId } from './security-check-types.js';

function result(
  id: CheckId,
  status: CheckStatus,
  values: Record<string, CheckValue> = {},
): CheckResult {
  return { id, status, values };
}

/** Selectors tried for DKIM: only the common ones, the real one can be anything. */
export const DKIM_SELECTORS = [
  'default',
  'google',
  'selector1',
  'selector2',
  'k1',
  's1',
  's2',
  'mail',
  'dkim',
] as const;

/** Most DNS lookups an SPF record may cause (RFC 7208). */
export const SPF_LOOKUP_LIMIT = 10;

const LOOKUP_TERMS = /^[+\-~?]?(include|a|mx|ptr|exists)([:/=]|$)/i;

/** The DNS-lookup terms of an SPF record, and the `redirect=` target if any. */
export function spfTerms(record: string): {
  lookups: string[];
  includes: string[];
  redirect: string | null;
} {
  const terms = record.trim().split(/\s+/).slice(1);
  const lookups: string[] = [];
  const includes: string[] = [];
  let redirect: string | null = null;
  for (const term of terms) {
    if (/^redirect=/i.test(term)) {
      redirect = term.slice('redirect='.length);
      lookups.push(term);
    } else if (LOOKUP_TERMS.test(term)) {
      lookups.push(term);
      if (/^[+\-~?]?include:/i.test(term)) includes.push(term.split(':')[1] ?? '');
    }
  }
  return { lookups, includes, redirect };
}

/** The `all` qualifier of an SPF record: `-`, `~`, `?`, `+`, or null when there is none. */
export function spfAll(record: string): '-' | '~' | '?' | '+' | null {
  const match = /(?:^|\s)([+\-~?]?)all(?:\s|$)/i.exec(record);
  if (!match) return null;
  return (match[1] || '+') as '-' | '~' | '?' | '+';
}

/** Whether the domain sends email at all: a MX or an SPF record. */
function sendsEmail(dns: DnsInputs): boolean {
  return (dns.mx?.length ?? 0) > 0 || dns.spf.records.length > 0;
}

export function dnsChecks(dns: DnsInputs): CheckResult[] {
  const checks: CheckResult[] = [];
  const mail = sendsEmail(dns);
  const skipped = (id: CheckId) => result(id, 'info', { reason: 'no-email' });

  // CAA
  if (dns.caa === null) checks.push(result('caa', 'info', { reason: 'unknown' }));
  else
    checks.push(result('caa', dns.caa.length > 0 ? 'pass' : 'info', { records: dns.caa.length }));

  // DNSSEC
  if (dns.dnssec.ad === null) checks.push(result('dnssec', 'info', { reason: 'unknown' }));
  else if (dns.dnssec.ad) checks.push(result('dnssec', 'pass'));
  else checks.push(result('dnssec', 'warn', { hasDs: dns.dnssec.hasDs }));

  // MX
  if (!mail) checks.push(skipped('mx'));
  else if (dns.mx === null) checks.push(result('mx', 'info', { reason: 'unknown' }));
  else if (dns.mx.length === 0) checks.push(result('mx', 'warn'));
  else {
    const nullMx = dns.mx.length === 1 && dns.mx[0]!.exchange.replace(/\.$/, '') === '';
    checks.push(result('mx', 'pass', { nullMx, count: dns.mx.length }));
  }

  // SPF
  if (!mail) checks.push(skipped('spf'));
  else if (dns.txt === null) checks.push(result('spf', 'info', { reason: 'unknown' }));
  else if (dns.spf.records.length === 0) checks.push(result('spf', 'fail', { reason: 'missing' }));
  else if (dns.spf.records.length > 1) {
    checks.push(result('spf', 'fail', { reason: 'multiple', count: dns.spf.records.length }));
  } else if (dns.spf.lookups > SPF_LOOKUP_LIMIT) {
    checks.push(result('spf', 'fail', { reason: 'lookups', lookups: dns.spf.lookups }));
  } else {
    const record = dns.spf.records[0]!;
    const qualifier =
      spfAll(record) ?? (dns.spf.redirectRecord ? spfAll(dns.spf.redirectRecord) : null);
    const status: CheckStatus = qualifier === '-' ? 'pass' : qualifier === '~' ? 'warn' : 'fail';
    checks.push(
      result('spf', status, {
        reason: qualifier === null ? 'no-all' : 'all',
        all: qualifier,
        lookups: dns.spf.lookups,
      }),
    );
  }

  // DMARC
  if (!mail) checks.push(skipped('dmarc'));
  else if (dns.dmarc === null) checks.push(result('dmarc', 'info', { reason: 'unknown' }));
  else {
    const record = dns.dmarc.find((text) => /^v=DMARC1/i.test(text.trim()));
    if (!record) checks.push(result('dmarc', 'fail'));
    else {
      const policy = /(?:^|;)\s*p\s*=\s*([a-z]+)/i.exec(record)?.[1]?.toLowerCase() ?? null;
      const rua = /(?:^|;)\s*rua\s*=/i.test(record);
      const status: CheckStatus = policy === 'reject' || policy === 'quarantine' ? 'pass' : 'warn';
      checks.push(result('dmarc', status, { policy, rua }));
    }
  }

  // DKIM
  if (!mail) checks.push(skipped('dkim'));
  else {
    checks.push(
      dns.dkim.length > 0
        ? result('dkim', 'pass', { selectors: dns.dkim })
        : result('dkim', 'info', { tried: [...DKIM_SELECTORS] }),
    );
  }

  // MTA-STS
  const stsTxt = dns.mtaSts.txt.find((text) => /^v=STSv1/i.test(text.trim()));
  if (!stsTxt) checks.push(result('mta-sts', 'info', { reason: 'none' }));
  else if (dns.mtaSts.policy === null)
    checks.push(result('mta-sts', 'warn', { reason: 'no-policy' }));
  else {
    const mode = /^mode:\s*([a-z]+)/im.exec(dns.mtaSts.policy)?.[1]?.toLowerCase() ?? null;
    if (mode === 'enforce') checks.push(result('mta-sts', 'pass', { mode }));
    else if (mode === 'testing') checks.push(result('mta-sts', 'warn', { mode }));
    else checks.push(result('mta-sts', 'info', { mode }));
  }

  // TLS-RPT
  const present = (dns.tlsRpt ?? []).some((text) => /^v=TLSRPTv1/i.test(text.trim()));
  checks.push(result('tls-rpt', 'info', { present }));
  return checks;
}
