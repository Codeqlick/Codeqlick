import { createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIPv4, isIPv6 } from 'node:net';

/**
 * The pure parts of password-protected addresses (architecture 4.13 "Password protection",
 * decision 50): the access cookie, the members' tickets, `next` and the visitor's language.
 */

export const ACCESS_COOKIE = '__Host-cq_access';
export const TICKET_TTL_SECONDS = 60;
export const PROTECTION_DAYS = [1, 7, 30] as const;
export type ProtectionDays = (typeof PROTECTION_DAYS)[number];
export type ProtectionMode = 'OFF' | 'PREVIEWS' | 'ALL';
export type ProtectionKind = 'previews' | 'production';

/** A key derived from the master secret with HKDF-SHA256, as `SecretBox` derives its own. */
export function protectionKey(
  masterSecret: string,
  purpose: 'cloud-protection-v1' | 'cloud-protection-ticket-v1',
): Buffer {
  return Buffer.from(hkdfSync('sha256', masterSecret, 'codeqlick', purpose, 32));
}

/** Whether a mode protects that kind of address. */
export function protects(mode: ProtectionMode, kind: ProtectionKind): boolean {
  return kind === 'previews' ? mode !== 'OFF' : mode === 'ALL';
}

function sign(key: Buffer, payload: string, host: string): string {
  return createHmac('sha256', key).update(`${payload}\n${host.toLowerCase()}`).digest('base64url');
}

function sameSignature(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const INTEGER = /^(?:0|[1-9]\d{0,14})$/;

// ── The cookie ────────────────────────────────────────────────────────────────────────────────

export interface AccessGrant {
  projectId: string;
  version: number;
  /** Unix seconds. */
  expiresAt: number;
}

/** `v1.<projectId>.<protectionVersion>.<expiry>.<signature>`, signed with the address. */
export function signAccess(key: Buffer, grant: AccessGrant, host: string): string {
  const payload = `v1.${grant.projectId}.${grant.version}.${grant.expiresAt}`;
  return `${payload}.${sign(key, payload, host)}`;
}

/** The cookie's grant when it was signed for this address and hasn't expired; else null. */
export function verifyAccess(
  key: Buffer,
  value: string | undefined,
  host: string,
  now: number = Date.now(),
): AccessGrant | null {
  if (!value || value.length > 300) return null;
  const parts = value.split('.');
  if (parts.length !== 5) return null;
  const [version, projectId, protectionVersion, expiry, signature] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];
  if (version !== 'v1' || !UUID.test(projectId)) return null;
  if (!INTEGER.test(protectionVersion) || !INTEGER.test(expiry)) return null;
  const payload = parts.slice(0, 4).join('.');
  if (!sameSignature(signature, sign(key, payload, host))) return null;
  const expiresAt = Number(expiry);
  if (expiresAt * 1000 <= now) return null;
  return { projectId, version: Number(protectionVersion), expiresAt };
}

/** The `Set-Cookie` options of the access cookie (host-only: never for the parent domain). */
export function accessCookieOptions(days: number) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: days * 86_400_000,
  };
}

// ── Members' tickets ──────────────────────────────────────────────────────────────────────────

export interface TicketClaim {
  projectId: string;
  id: string;
  /** Unix seconds. */
  expiresAt: number;
}

/** `v1.<projectId>.<id>.<expiry>.<signature>`, signed with the address it is for. */
export function signTicket(key: Buffer, claim: TicketClaim, host: string): string {
  const payload = `v1.${claim.projectId}.${claim.id}.${claim.expiresAt}`;
  return `${payload}.${sign(key, payload, host)}`;
}

/** The ticket's claim when it was signed for this address and hasn't expired; else null. */
export function verifyTicket(
  key: Buffer,
  value: string | undefined,
  host: string,
  now: number = Date.now(),
): TicketClaim | null {
  if (!value || value.length > 300) return null;
  const parts = value.split('.');
  if (parts.length !== 5) return null;
  const [version, projectId, id, expiry, signature] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];
  if (version !== 'v1' || !UUID.test(projectId)) return null;
  if (!/^[\w-]{16,64}$/.test(id) || !INTEGER.test(expiry)) return null;
  const payload = parts.slice(0, 4).join('.');
  if (!sameSignature(signature, sign(key, payload, host))) return null;
  const expiresAt = Number(expiry);
  if (expiresAt * 1000 <= now) return null;
  return { projectId, id, expiresAt };
}

const hashId = (id: string) => createHash('sha256').update(id).digest('hex');

/**
 * The tickets given out and not used yet, their ids kept hashed until they expire (like the
 * meetings' tickets): each works once.
 */
export class TicketBook {
  private readonly open = new Map<string, number>();

  /** A new random id, remembered until `expiresAt` (Unix seconds). */
  issue(expiresAt: number, now: number = Date.now()): string {
    this.prune(now);
    const id = randomBytes(18).toString('base64url');
    this.open.set(hashId(id), expiresAt);
    return id;
  }

  /** True once for an id given out and not expired; false afterwards or for any other. */
  redeem(id: string, now: number = Date.now()): boolean {
    const key = hashId(id);
    const expiresAt = this.open.get(key);
    if (expiresAt === undefined) return false;
    this.open.delete(key);
    return expiresAt * 1000 > now;
  }

  get size(): number {
    return this.open.size;
  }

  private prune(now: number): void {
    for (const [key, expiresAt] of this.open) {
      if (expiresAt * 1000 <= now) this.open.delete(key);
    }
  }
}

// ── Tries ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Who a try counts against: an IPv4 address as is (also when mapped into IPv6), an IPv6 address
 * by its /64 (one connection usually holds a whole /64).
 */
export function ipBucket(ip: string | null | undefined): string {
  if (!ip) return 'unknown';
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1]!;
  if (isIPv4(ip)) return ip;
  if (!isIPv6(ip)) return 'unknown';
  const [head = '', tail = ''] = ip.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = ip.includes('::') && tail ? tail.split(':') : [];
  const groups = ip.includes('::')
    ? [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
    : left;
  return `${groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

/** Fixed one-minute windows per key, at most `maxKeys` remembered (the oldest go first). */
class WindowCounter {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly windowMs: number,
    private readonly maxKeys: number,
  ) {}

  /** The key's count in its window, without counting. */
  count(key: string, now: number): number {
    const entry = this.entries.get(key);
    return entry && entry.resetAt > now ? entry.count : 0;
  }

  add(key: string, now: number): void {
    const entry = this.entries.get(key);
    if (entry && entry.resetAt > now) {
      entry.count += 1;
      return;
    }
    this.entries.delete(key);
    if (this.entries.size >= this.maxKeys) {
      for (const [k, e] of this.entries) if (e.resetAt <= now) this.entries.delete(k);
      for (const k of this.entries.keys()) {
        if (this.entries.size < this.maxKeys) break;
        this.entries.delete(k);
      }
    }
    this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
  }

  get size(): number {
    return this.entries.size;
  }
}

/**
 * Password tries, in memory: at most `perIp` a minute per IP (IPv6 by /64) and project, and
 * `perProject` a minute per project from everyone, so many addresses can't guess together.
 */
export class TryLimiter {
  private readonly byIp: WindowCounter;
  private readonly byProject: WindowCounter;

  constructor(
    private readonly perIp = 5,
    private readonly perProject = 60,
    windowMs = 60_000,
    maxKeys = 10_000,
  ) {
    this.byIp = new WindowCounter(windowMs, maxKeys);
    this.byProject = new WindowCounter(windowMs, maxKeys);
  }

  /** Counts a try; false when the IP or the project is over its limit for this minute. */
  take(ip: string | null | undefined, projectId: string, now: number = Date.now()): boolean {
    const key = `${ipBucket(ip)}|${projectId}`;
    if (this.byIp.count(key, now) >= this.perIp) return false;
    if (this.byProject.count(projectId, now) >= this.perProject) return false;
    this.byIp.add(key, now);
    this.byProject.add(projectId, now);
    return true;
  }

  /** How many IP and project keys are remembered (bounded by `maxKeys`). */
  get size(): number {
    return this.byIp.size;
  }
}

// ── `next` and the language ───────────────────────────────────────────────────────────────────

/**
 * A path on the same address, or `/`: it must start with `/` (not `//` or `/\`) and hold no
 * control characters or spaces (browsers drop tabs and line breaks, which could make `//`).
 */
export function safeNext(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return '/';
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  if ([...raw].some((char) => char.charCodeAt(0) <= 0x20 || char.charCodeAt(0) === 0x7f)) {
    return '/';
  }
  return raw;
}

/**
 * `next` from a request's URL as Nginx sends it (`?next=$request_uri`, not encoded): everything
 * after the first `next=` of the query.
 */
export function nextFromUrl(url: string): string {
  const query = url.indexOf('?');
  if (query === -1) return '/';
  const rest = url.slice(query + 1);
  const at = rest.startsWith('next=') ? 0 : rest.indexOf('&next=');
  if (at === -1) return '/';
  return safeNext(rest.slice(at === 0 ? 5 : at + 6));
}

export type PageLocale = 'en' | 'es';

/** Spanish when `Accept-Language` prefers it over English; English otherwise. */
export function pageLocale(acceptLanguage: string | undefined): PageLocale {
  if (!acceptLanguage) return 'en';
  const ranked = acceptLanguage
    .split(',')
    .slice(0, 20)
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().toLowerCase().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const weight = q ? Number(q.slice(2)) : 1;
      return { lang: tag.split('-')[0] ?? '', weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((entry) => entry.weight > 0 && (entry.lang === 'en' || entry.lang === 'es'))
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  return ranked[0]?.lang === 'es' ? 'es' : 'en';
}
