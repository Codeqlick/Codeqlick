import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  TicketBook,
  TryLimiter,
  ipBucket,
  accessCookieOptions,
  nextFromUrl,
  pageLocale,
  protectionKey,
  protects,
  safeNext,
  signAccess,
  signTicket,
  verifyAccess,
  verifyTicket,
} from './cloud-protection.js';

const SECRET = 'a-test-secret-a-test-secret-a-test-secret';
const key = protectionKey(SECRET, 'cloud-protection-v1');
const ticketKey = protectionKey(SECRET, 'cloud-protection-ticket-v1');
const projectId = '2b0f0f3e-6a43-4f53-9a3c-6a0e3d2b1c11';
const host = 'docs--a1b2c3d4.codeqlick.app';
const now = Date.UTC(2026, 10, 13, 12, 0, 0);
const inAWeek = Math.floor(now / 1000) + 7 * 86_400;

describe('protection keys', () => {
  it('derives a separate key for each purpose and secret', () => {
    expect(key).toHaveLength(32);
    expect(key.equals(ticketKey)).toBe(false);
    expect(
      key.equals(protectionKey('another-secret-another-secret-another', 'cloud-protection-v1')),
    ).toBe(false);
    expect(protectionKey(SECRET, 'cloud-protection-v1').equals(key)).toBe(true);
  });
});

describe('access cookie', () => {
  const grant = { projectId, version: 3, expiresAt: inAWeek };

  it('signs v1.<project>.<version>.<expiry>.<signature> and verifies it on its address', () => {
    const value = signAccess(key, grant, host);
    expect(value).toMatch(/^v1\.[0-9a-f-]{36}\.3\.\d+\.[\w-]{43}$/);
    expect(verifyAccess(key, value, host, now)).toEqual(grant);
    // The address is compared case-insensitively (Nginx sends it lowercased anyway).
    expect(verifyAccess(key, value, host.toUpperCase(), now)).toEqual(grant);
  });

  it('refuses it on another address', () => {
    const value = signAccess(key, grant, host);
    expect(verifyAccess(key, value, 'docs.codeqlick.app', now)).toBeNull();
    expect(verifyAccess(key, value, 'other--a1b2c3d4.codeqlick.app', now)).toBeNull();
  });

  it('refuses a tampered value', () => {
    const value = signAccess(key, grant, host);
    const parts = value.split('.');
    const bumped = [parts[0], parts[1], '4', parts[3], parts[4]].join('.');
    expect(verifyAccess(key, bumped, host, now)).toBeNull();
    const later = [parts[0], parts[1], parts[2], String(inAWeek + 86_400), parts[4]].join('.');
    expect(verifyAccess(key, later, host, now)).toBeNull();
    const otherProject = value.replace(projectId, '3c1f0f3e-6a43-4f53-9a3c-6a0e3d2b1c11');
    expect(verifyAccess(key, otherProject, host, now)).toBeNull();
    const flipped = `${value.slice(0, -1)}${value.endsWith('A') ? 'B' : 'A'}`;
    expect(verifyAccess(key, flipped, host, now)).toBeNull();
    expect(verifyAccess(key, `${value}.x`, host, now)).toBeNull();
  });

  it('refuses one signed with another key (a new CREDENTIALS_SECRET or the ticket key)', () => {
    expect(verifyAccess(key, signAccess(ticketKey, grant, host), host, now)).toBeNull();
  });

  it('refuses an expired value', () => {
    const value = signAccess(key, { ...grant, expiresAt: Math.floor(now / 1000) - 1 }, host);
    expect(verifyAccess(key, value, host, now)).toBeNull();
    expect(verifyAccess(key, signAccess(key, grant, host), host, inAWeek * 1000)).toBeNull();
  });

  it('refuses another format version, even correctly signed', () => {
    const payload = `v0.${projectId}.3.${inAWeek}`;
    const signature = createHmac('sha256', key).update(`${payload}\n${host}`).digest('base64url');
    expect(verifyAccess(key, `${payload}.${signature}`, host, now)).toBeNull();
  });

  it('refuses garbage', () => {
    for (const value of [undefined, '', 'v1', 'v1....', 'x'.repeat(400), `v1.nope.1.2.sig`]) {
      expect(verifyAccess(key, value, host, now)).toBeNull();
    }
  });

  it('sets a host-only, secure cookie for the access days', () => {
    expect(accessCookieOptions(7)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 86_400_000,
    });
    expect(accessCookieOptions(1)).not.toHaveProperty('domain');
  });
});

describe('tickets', () => {
  const claim = {
    projectId,
    id: 'abcdefghijklmnopqrstuvwx',
    expiresAt: Math.floor(now / 1000) + 60,
  };

  it('verifies a ticket on its address only, while it lasts', () => {
    const ticket = signTicket(ticketKey, claim, host);
    expect(verifyTicket(ticketKey, ticket, host, now)).toEqual(claim);
    expect(verifyTicket(ticketKey, ticket, 'docs.codeqlick.app', now)).toBeNull();
    expect(verifyTicket(ticketKey, ticket, host, now + 61_000)).toBeNull();
    // Signed with the cookie's key, it isn't a ticket (and a ticket isn't a cookie).
    expect(verifyTicket(ticketKey, signTicket(key, claim, host), host, now)).toBeNull();
    expect(verifyAccess(key, ticket, host, now)).toBeNull();
  });

  it('lets each ticket in once', () => {
    const book = new TicketBook();
    const expiresAt = Math.floor(now / 1000) + 60;
    const id = book.issue(expiresAt, now);
    expect(id).toMatch(/^[\w-]{24}$/);
    expect(book.redeem('not-issued-not-issued-xx', now)).toBe(false);
    expect(book.redeem(id, now)).toBe(true);
    expect(book.redeem(id, now)).toBe(false);
  });

  it('refuses an expired ticket and forgets expired ones', () => {
    const book = new TicketBook();
    const expiresAt = Math.floor(now / 1000) + 60;
    const late = book.issue(expiresAt, now);
    expect(book.redeem(late, now + 60_000)).toBe(false);
    book.issue(expiresAt, now);
    expect(book.size).toBe(1);
    book.issue(expiresAt + 120, now + 61_000);
    expect(book.size).toBe(1);
  });
});

describe('tries', () => {
  it('allows 5 tries a minute per IP and project', () => {
    const limiter = new TryLimiter(5, 60, 60_000);
    for (let i = 0; i < 5; i += 1) expect(limiter.take('1.2.3.4', 'p', now)).toBe(true);
    expect(limiter.take('1.2.3.4', 'p', now)).toBe(false);
    expect(limiter.take('::ffff:1.2.3.4', 'p', now)).toBe(false);
    expect(limiter.take('1.2.3.4', 'q', now)).toBe(true);
    expect(limiter.take('5.6.7.8', 'p', now)).toBe(true);
    expect(limiter.take('1.2.3.4', 'p', now + 60_000)).toBe(true);
  });

  it('counts an IPv6 address by its /64', () => {
    const limiter = new TryLimiter(5, 60, 60_000);
    for (let i = 0; i < 5; i += 1) {
      expect(limiter.take(`2001:db8:1:2::${i + 1}`, 'p', now)).toBe(true);
    }
    expect(limiter.take('2001:db8:1:2:ffff:ffff:ffff:ffff', 'p', now)).toBe(false);
    expect(limiter.take('2001:db8:1:3::1', 'p', now)).toBe(true);
  });

  it('allows 60 tries a minute per project from everyone', () => {
    const limiter = new TryLimiter(5, 60, 60_000);
    for (let i = 0; i < 60; i += 1) expect(limiter.take(`198.51.100.${i}`, 'p', now)).toBe(true);
    expect(limiter.take('203.0.113.1', 'p', now)).toBe(false);
    expect(limiter.take('203.0.113.1', 'q', now)).toBe(true);
    expect(limiter.take('203.0.113.1', 'p', now + 60_000)).toBe(true);
  });

  it('remembers a bounded number of keys, forgetting the oldest', () => {
    const limiter = new TryLimiter(1, 1_000_000, 60_000, 100);
    expect(limiter.take('10.0.0.1', 'p', now)).toBe(true);
    for (let i = 0; i < 500; i += 1)
      limiter.take(`10.1.${Math.floor(i / 250)}.${i % 250}`, 'p', now);
    expect(limiter.size).toBeLessThanOrEqual(100);
    // The oldest key was forgotten, so it may try again.
    expect(limiter.take('10.0.0.1', 'p', now)).toBe(true);
  });
});

describe('ip buckets', () => {
  it('keeps IPv4, unmaps IPv4 in IPv6 and cuts IPv6 to its /64', () => {
    expect(ipBucket('203.0.113.7')).toBe('203.0.113.7');
    expect(ipBucket('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(ipBucket('2001:0db8:0001:0002:0003:0004:0005:0006')).toBe('2001:db8:1:2::/64');
    expect(ipBucket('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(ipBucket('2001:DB8:1:2::abcd')).toBe('2001:db8:1:2::/64');
    expect(ipBucket('::1')).toBe('0:0:0:0::/64');
    expect(ipBucket(null)).toBe('unknown');
    expect(ipBucket('not-an-ip')).toBe('unknown');
  });
});

describe('next', () => {
  it('keeps a path on the same address', () => {
    expect(safeNext('/')).toBe('/');
    expect(safeNext('/docs/intro?tab=2#top')).toBe('/docs/intro?tab=2#top');
    expect(safeNext('/a%20b')).toBe('/a%20b');
  });

  it('sends anything else to /', () => {
    for (const raw of [
      undefined,
      null,
      42,
      '',
      'docs',
      'https://evil.test/',
      '//evil.test/',
      '/\\evil.test/',
      '/\t/evil.test',
      '/a\r\nSet-Cookie: x=1',
      '/a b',
      `/${'a'.repeat(3000)}`,
    ]) {
      expect(safeNext(raw)).toBe('/');
    }
  });

  it('takes everything after the first next= of the query, as Nginx sends it', () => {
    const base = '/v1/cloud/protection/password';
    expect(nextFromUrl(`${base}?next=/docs/intro?tab=2&x=1`)).toBe('/docs/intro?tab=2&x=1');
    expect(nextFromUrl(`${base}?next=/a?next=/b`)).toBe('/a?next=/b');
    expect(nextFromUrl(`${base}?x=1&next=/pricing`)).toBe('/pricing');
    expect(nextFromUrl(`${base}?xnext=/pricing`)).toBe('/');
    expect(nextFromUrl(`${base}?next=//evil.test/`)).toBe('/');
    expect(nextFromUrl(`${base}?next=https://evil.test/`)).toBe('/');
    expect(nextFromUrl(base)).toBe('/');
    expect(nextFromUrl(`${base}?next=`)).toBe('/');
  });
});

describe('modes and addresses', () => {
  it('protects previews for PREVIEWS and ALL, production for ALL only', () => {
    expect(protects('OFF', 'previews')).toBe(false);
    expect(protects('OFF', 'production')).toBe(false);
    expect(protects('PREVIEWS', 'previews')).toBe(true);
    expect(protects('PREVIEWS', 'production')).toBe(false);
    expect(protects('ALL', 'previews')).toBe(true);
    expect(protects('ALL', 'production')).toBe(true);
  });
});

describe('page language', () => {
  it('answers in Spanish only when it is preferred over English', () => {
    expect(pageLocale(undefined)).toBe('en');
    expect(pageLocale('')).toBe('en');
    expect(pageLocale('es-ES,es;q=0.9,en;q=0.8')).toBe('es');
    expect(pageLocale('en-US,en;q=0.9,es;q=0.8')).toBe('en');
    expect(pageLocale('fr-FR,fr;q=0.9,es;q=0.8,en;q=0.5')).toBe('es');
    expect(pageLocale('en;q=0.4,es;q=0.6')).toBe('es');
    expect(pageLocale('de-DE,fr;q=0.8')).toBe('en');
    expect(pageLocale('es;q=0')).toBe('en');
  });
});
