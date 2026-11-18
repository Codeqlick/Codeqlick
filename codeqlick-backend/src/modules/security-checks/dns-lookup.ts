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

export function encodeQuery(id: number, name: string, type: number): Buffer {
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

export interface RawAnswer {
  rcode: number;
  ad: boolean;
  /** The record types of the answer section, in order. */
  answerTypes: number[];
}

/** The offset after a (possibly compressed) name starting at `offset`, or -1 when malformed. */
function skipName(message: Buffer, offset: number): number {
  let cursor = offset;
  for (let hops = 0; hops < 128 && cursor < message.length; hops += 1) {
    const length = message[cursor]!;
    if (length === 0) return cursor + 1;
    if ((length & 0xc0) === 0xc0) return cursor + 2 <= message.length ? cursor + 2 : -1;
    cursor += 1 + length;
  }
  return -1;
}

/**
 * Reads a reply to `query`: the id must match, it must be a response (QR bit) that repeats the
 * question we sent; null for anything else (short, malformed, another id or question).
 */
export function parseResponse(message: Buffer, query: Buffer): RawAnswer | null {
  if (message.length < 12 || message.readUInt16BE(0) !== query.readUInt16BE(0)) return null;
  const flags = message.readUInt16BE(2);
  if ((flags & 0x8000) === 0) return null;
  if (message.readUInt16BE(4) !== 1) return null;
  // The question section is identical to the one sent (name, type and class).
  const questionEnd = skipName(query, 12) + 4;
  if (questionEnd < 16 || message.length < questionEnd) return null;
  if (!message.subarray(12, questionEnd).equals(query.subarray(12, questionEnd))) return null;
  const count = Math.min(message.readUInt16BE(6), 64);
  const answerTypes: number[] = [];
  let offset = questionEnd;
  for (let index = 0; index < count; index += 1) {
    offset = skipName(message, offset);
    if (offset < 0 || offset + 10 > message.length) return null;
    answerTypes.push(message.readUInt16BE(offset));
    offset += 10 + message.readUInt16BE(offset + 8);
  }
  return { rcode: flags & 0xf, ad: (flags & 0x0020) !== 0, answerTypes };
}

/**
 * One UDP query. Replies from another address or port, and replies that are not for this query,
 * are ignored (the query times out instead of trusting them).
 */
export function rawQuery(
  server: string,
  name: string,
  type: number,
  options: { timeoutMs?: number; port?: number; signal?: AbortSignal } = {},
): Promise<RawAnswer> {
  const { timeoutMs = 4_000, port = 53, signal } = options;
  return new Promise((resolve, reject) => {
    const socket = createSocket('udp4');
    const query = encodeQuery(randomInt(0, 0x10000), name, type);
    const done = (error: Error | null, answer?: RawAnswer) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      socket.close();
      if (error) reject(error);
      else resolve(answer!);
    };
    const onAbort = () => done(new Error('Aborted'));
    const timer = setTimeout(() => done(new Error('DNS timeout')), timeoutMs);
    socket.on('message', (message, rinfo) => {
      if (rinfo.address !== server || rinfo.port !== port) return;
      const answer = parseResponse(message, query);
      if (answer) done(null, answer);
    });
    socket.once('error', (error) => done(error));
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    socket.send(query, port, server, (error) => {
      if (error) done(error);
    });
  });
}

const flat = (records: string[][]) => records.map((chunks) => chunks.join(''));

export function createDnsClient(signal?: AbortSignal): DnsClient {
  const resolver = new Resolver({ timeout: 4_000, tries: 2 });
  signal?.addEventListener('abort', () => resolver.cancel(), { once: true });
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
        const a = await rawQuery(VALIDATING_RESOLVER, name, TYPES.A, { signal });
        // SERVFAIL on a validating resolver can mean a broken signature: not a clean "no".
        if (a.rcode !== 0) return { ad: null, hasDs: null };
        const ds = await rawQuery(VALIDATING_RESOLVER, name, TYPES.DS, { signal }).catch(
          () => null,
        );
        return { ad: a.ad, hasDs: ds ? ds.answerTypes.includes(TYPES.DS) : null };
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
