import { createSocket } from 'node:dgram';
import { randomInt } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { spfTerms, DKIM_SELECTORS } from './checks-dns.js';
import type { DnsInputs } from './security-check-inputs.js';

/** The validating resolver the DNSSEC check asks (architecture 4.19). */
export const VALIDATING_RESOLVER = '1.1.1.1';

/** The DNS lookups a check needs; replaced in tests (no network). */
export interface DnsClient {
  /** null: the lookup failed; []: the name has no such records. */
  txt(name: string): Promise<string[] | null>;
  mx(name: string): Promise<Array<{ exchange: string; priority: number }> | null>;
  caa(name: string): Promise<string[] | null>;
  /** Whether the name has any address, MX, NS, TXT or CNAME at all; null: couldn't tell. */
  exists(name: string): Promise<boolean | null>;
  /** The AD flag of the validating resolver's answer for the `A` record, and a DS record. */
  dnssec(name: string): Promise<{ ad: boolean | null; hasDs: boolean | null }>;
}

const EMPTY_CODES = new Set(['ENODATA', 'ENOTFOUND', 'NODATA', 'NOTFOUND']);

async function attempt<T>(lookup: () => Promise<T>): Promise<T | 'empty' | null> {
  try {
    return await lookup();
  } catch (error) {
    const code = (error as { code?: string } | null)?.code ?? '';
    return EMPTY_CODES.has(code) ? 'empty' : null;
  }
}

// ── A small raw DNS query, only to read the AD flag (node's resolver doesn't expose it) ─────────

const TYPES = { A: 1, DS: 43 } as const;

function encodeQuery(id: number, name: string, type: number): Buffer {
  const labels = name.split('.').filter(Boolean);
  const question = Buffer.concat([
    ...labels.map((label) =>
      Buffer.concat([Buffer.from([label.length]), Buffer.from(label, 'ascii')]),
    ),
    Buffer.from([0]),
    Buffer.from([type >> 8, type & 0xff, 0, 1]),
  ]);
  const header = Buffer.alloc(12);
  header.writeUInt16BE(id, 0);
  header.writeUInt16BE(0x0120, 2); // RD and AD
  header.writeUInt16BE(1, 4); // one question
  header.writeUInt16BE(1, 10); // one additional record: EDNS0
  // OPT: root name, type 41, UDP size 1232, DO bit set.
  const opt = Buffer.from([0, 0, 41, 0x04, 0xd0, 0, 0, 0x80, 0, 0, 0]);
  return Buffer.concat([header, question, opt]);
}

interface RawAnswer {
  rcode: number;
  ad: boolean;
  answers: number;
}

function rawQuery(
  server: string,
  name: string,
  type: number,
  timeoutMs = 4_000,
): Promise<RawAnswer> {
  return new Promise((resolve, reject) => {
    const socket = createSocket('udp4');
    const id = randomInt(0, 0x10000);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('DNS timeout'));
    }, timeoutMs);
    socket.once('message', (message) => {
      clearTimeout(timer);
      socket.close();
      if (message.length < 12 || message.readUInt16BE(0) !== id) {
        reject(new Error('Bad DNS answer'));
        return;
      }
      const flags = message.readUInt16BE(2);
      resolve({ rcode: flags & 0xf, ad: (flags & 0x0020) !== 0, answers: message.readUInt16BE(6) });
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      socket.close();
      reject(error);
    });
    socket.send(encodeQuery(id, name, type), 53, server, (error) => {
      if (error) {
        clearTimeout(timer);
        socket.close();
        reject(error);
      }
    });
  });
}

const flat = (records: string[][]) => records.map((chunks) => chunks.join(''));

export function createDnsClient(): DnsClient {
  const resolver = new Resolver({ timeout: 4_000, tries: 2 });
  return {
    async txt(name) {
      const found = await attempt(() => resolver.resolveTxt(name));
      return found === 'empty' ? [] : found === null ? null : flat(found);
    },
    async mx(name) {
      const found = await attempt(() => resolver.resolveMx(name));
      return found === 'empty' ? [] : found;
    },
    async caa(name) {
      const found = await attempt(() => resolver.resolveCaa(name));
      if (found === 'empty') return [];
      return (
        found?.map(
          (record) =>
            `${record.critical} ${record.issue ?? record.issuewild ?? record.iodef ?? ''}`,
        ) ?? null
      );
    },
    async exists(name) {
      const lookups = await Promise.all([
        attempt(() => resolver.resolve4(name)),
        attempt(() => resolver.resolve6(name)),
        attempt(() => resolver.resolveMx(name)),
        attempt(() => resolver.resolveNs(name)),
        attempt(() => resolver.resolveTxt(name)),
        attempt(() => resolver.resolveCname(name)),
      ]);
      if (lookups.some((found) => found !== null && found !== 'empty')) return true;
      return lookups.every((found) => found === 'empty') ? false : null;
    },
    async dnssec(name) {
      try {
        const a = await rawQuery(VALIDATING_RESOLVER, name, TYPES.A);
        // SERVFAIL on a validating resolver can mean a broken signature: not a clean "no".
        if (a.rcode !== 0) return { ad: null, hasDs: null };
        const ds = await rawQuery(VALIDATING_RESOLVER, name, TYPES.DS).catch(() => null);
        return { ad: a.ad, hasDs: ds ? ds.answers > 0 : null };
      } catch {
        return { ad: null, hasDs: null };
      }
    },
  };
}

// ── Everything the DNS checks need ──────────────────────────────────────────────────────────────

/** Most TXT lookups spent following an SPF record. */
const SPF_FETCH_LIMIT = 12;

const spfOf = (records: string[] | null) =>
  (records ?? []).filter((text) => /^v=spf1(\s|$)/i.test(text.trim()));

/** Counts an SPF record's DNS lookups, following `include` and `redirect` (depth and size capped). */
async function followSpf(
  dns: DnsClient,
  record: string,
): Promise<{ lookups: number; redirectRecord: string | null }> {
  let lookups = 0;
  let fetched = 0;
  let redirectRecord: string | null = null;
  const seen = new Set<string>();
  const walk = async (text: string, depth: number, top: boolean): Promise<void> => {
    const terms = spfTerms(text);
    lookups += terms.lookups.length;
    if (depth >= 6) return;
    const targets = [...terms.includes, ...(terms.redirect ? [terms.redirect] : [])];
    for (const target of targets) {
      if (lookups > 10 || fetched >= SPF_FETCH_LIMIT || seen.has(target.toLowerCase())) continue;
      seen.add(target.toLowerCase());
      fetched += 1;
      const found = spfOf(await dns.txt(target))[0];
      if (!found) continue;
      if (top && terms.redirect === target) redirectRecord = found;
      await walk(found, depth + 1, false);
    }
  };
  await walk(record, 0, true);
  return { lookups, redirectRecord };
}

/** What the DNS and email checks read of `domain`. */
export async function readDns(
  domain: string,
  dns: DnsClient,
  fetchPolicy: (domain: string) => Promise<string | null>,
): Promise<DnsInputs> {
  const [txt, mx, caa, dmarc, mtaStsTxt, tlsRpt, dnssec, ...dkimTxt] = await Promise.all([
    dns.txt(domain),
    dns.mx(domain),
    dns.caa(domain),
    dns.txt(`_dmarc.${domain}`),
    dns.txt(`_mta-sts.${domain}`),
    dns.txt(`_smtp._tls.${domain}`),
    dns.dnssec(domain),
    ...DKIM_SELECTORS.map((selector) => dns.txt(`${selector}._domainkey.${domain}`)),
  ]);
  const records = spfOf(txt);
  const spf =
    records.length === 1
      ? { records, ...(await followSpf(dns, records[0]!)) }
      : { records, lookups: 0, redirectRecord: null };
  const stsTxt = (mtaStsTxt ?? []).filter((text) => /^v=STSv1/i.test(text.trim()));
  return {
    mx,
    txt,
    spf,
    dmarc,
    dkim: DKIM_SELECTORS.filter((_, index) =>
      (dkimTxt[index] ?? []).some((text) => /v=DKIM1|p=/i.test(text)),
    ),
    caa,
    mtaSts: { txt: stsTxt, policy: stsTxt.length > 0 ? await fetchPolicy(domain) : null },
    tlsRpt,
    dnssec,
  };
}
