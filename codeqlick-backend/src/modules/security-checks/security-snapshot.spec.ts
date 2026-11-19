import { describe, expect, it } from 'vitest';
import type { SecurityInputs } from './security-check-inputs.js';
import { buildSnapshot, normaliseRecord, normaliseSet } from './security-snapshot.js';

const NOW = new Date('2026-11-19T10:00:00Z');

function inputs(
  dns: Partial<SecurityInputs['dns']> = {},
  tls: Partial<NonNullable<SecurityInputs['web']['tls']>> | null = {},
): SecurityInputs {
  return {
    domain: 'a.com',
    now: NOW,
    retire: null,
    web: {
      page: null,
      certificateFailed: false,
      http: null,
      securityTxt: null,
      tls:
        tls === null
          ? null
          : {
              version: 'TLSv1.3',
              cipher: 'X',
              authorized: true,
              authError: null,
              validTo: new Date('2026-12-19T10:00:00Z'),
              issuer: "Let's Encrypt",
              tls10: false,
              tls11: false,
              ...tls,
            },
    },
    dns: {
      mx: [{ exchange: 'MX.A.com.', priority: 10 }],
      txt: ['v=spf1 -all'],
      spf: { records: ['v=spf1  -ALL.'], lookups: 0, redirectRecord: null },
      dmarc: ['v=DMARC1; p=reject'],
      dkim: [],
      caa: ['0 letsencrypt.org'],
      ns: ['NS2.a.com.', 'ns1.a.com'],
      mtaSts: { txt: ['v=STSv1; id=1'], policy: null },
      tlsRpt: [],
      dnssec: { ad: true, hasDs: true },
      ...dns,
    },
  };
}

describe('normaliseRecord / normaliseSet', () => {
  it('trims, lower-cases, collapses whitespace and drops a trailing dot', () => {
    expect(normaliseRecord('  V=SPF1   Include:X.Com. ')).toBe('v=spf1 include:x.com');
  });

  it('sorts, drops repeats and empties, and keeps null', () => {
    expect(normaliseSet(['b.', 'A', 'a', ' '])).toEqual(['a', 'b']);
    expect(normaliseSet([])).toEqual([]);
    expect(normaliseSet(null)).toBeNull();
  });
});

describe('buildSnapshot', () => {
  it('normalises every record set and reads the certificate', () => {
    expect(buildSnapshot(inputs())).toEqual({
      dns: {
        mx: ['10 mx.a.com'],
        spf: ['v=spf1 -all'],
        dmarc: ['v=dmarc1; p=reject'],
        caa: ['0 letsencrypt.org'],
        mtaSts: ['v=stsv1; id=1'],
        ns: ['ns1.a.com', 'ns2.a.com'],
        dnssec: 'signed',
      },
      cert: { issuer: "Let's Encrypt", expires: '2026-12-19T10:00:00.000Z', days: 30 },
    });
  });

  it('sorts MX records by their normalised text', () => {
    const snapshot = buildSnapshot(
      inputs({
        mx: [
          { exchange: 'b.a.com', priority: 20 },
          { exchange: 'a.a.com', priority: 10 },
        ],
      }),
    );
    expect(snapshot.dns.mx).toEqual(['10 a.a.com', '20 b.a.com']);
  });

  it('keeps null for a lookup that failed and [] for no records', () => {
    const snapshot = buildSnapshot(
      inputs({
        mx: null,
        txt: null,
        dmarc: null,
        caa: [],
        ns: null,
        mtaSts: { txt: [], policy: null, failed: true },
      }),
    );
    expect(snapshot.dns).toMatchObject({
      mx: null,
      spf: null,
      dmarc: null,
      caa: [],
      ns: null,
      mtaSts: null,
    });
    expect(buildSnapshot(inputs({ mtaSts: { txt: [], policy: null } })).dns.mtaSts).toEqual([]);
  });

  it('has no SPF record (not null) when the TXT lookup worked and found none', () => {
    const snapshot = buildSnapshot(
      inputs({ txt: [], spf: { records: [], lookups: 0, redirectRecord: null } }),
    );
    expect(snapshot.dns.spf).toEqual([]);
  });

  it('maps the validating resolver answer to the DNSSEC state', () => {
    expect(buildSnapshot(inputs({ dnssec: { ad: true, hasDs: true } })).dns.dnssec).toBe('signed');
    expect(buildSnapshot(inputs({ dnssec: { ad: false, hasDs: false } })).dns.dnssec).toBe(
      'unsigned',
    );
    expect(buildSnapshot(inputs({ dnssec: { ad: null, hasDs: null } })).dns.dnssec).toBeNull();
  });

  it('leaves the certificate unknown without a handshake or without its details', () => {
    expect(buildSnapshot(inputs({}, null)).cert).toEqual({
      issuer: null,
      expires: null,
      days: null,
    });
    expect(buildSnapshot(inputs({}, { issuer: null, validTo: null })).cert).toEqual({
      issuer: null,
      expires: null,
      days: null,
    });
  });

  it('counts whole days left, negative once expired', () => {
    expect(buildSnapshot(inputs({}, { validTo: new Date('2026-11-19T09:00:00Z') })).cert.days).toBe(
      -1,
    );
    expect(buildSnapshot(inputs({}, { validTo: new Date('2026-11-26T09:59:00Z') })).cert.days).toBe(
      6,
    );
  });
});
