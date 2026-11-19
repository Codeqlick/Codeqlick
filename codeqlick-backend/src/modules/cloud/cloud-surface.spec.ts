import { describe, expect, it } from 'vitest';
import { DomainNotFoundError, ScanTimeoutError } from '../security-checks/gather.js';
import type { SurfaceSnapshot } from '../security-checks/security-snapshot.js';
import {
  changeShortText,
  changeText,
  computeChanges,
  nextSurfaceScan,
  readSnapshot,
  surfaceErrorCode,
  surfaceFailureText,
  surfaceSkipReason,
  surfaceSlot,
  type StoredCheck,
  type SurfaceChange,
} from './cloud-surface.js';

const snapshot = (
  over: Partial<SurfaceSnapshot['dns']> = {},
  cert: Partial<SurfaceSnapshot['cert']> = {},
) =>
  ({
    dns: {
      mx: ['10 mx.a.com'],
      spf: ['v=spf1 include:_spf.a.com -all'],
      dmarc: ['v=dmarc1; p=reject'],
      caa: ['0 letsencrypt.org'],
      mtaSts: ['v=stsv1; id=1'],
      ns: ['ns1.a.com', 'ns2.a.com'],
      dnssec: 'signed',
      ...over,
    },
    cert: { issuer: "Let's Encrypt", expires: '2027-02-01T00:00:00.000Z', days: 60, ...cert },
  }) satisfies SurfaceSnapshot;

const check = (
  id: string,
  status: StoredCheck['status'],
  values: StoredCheck['values'] = {},
): StoredCheck => ({ id, status, values });

const BASE_CHECKS = [
  check('hsts', 'pass'),
  check('csp-present', 'warn'),
  check('cert-expiry', 'pass', { days: 60, expires: '2027-02-01T00:00:00.000Z' }),
  check('vulnerable-libs', 'pass'),
];

const scan = (checks: StoredCheck[] = BASE_CHECKS, snap: unknown = snapshot()) => ({
  result: checks,
  snapshot: snap,
});

const replace = (checks: StoredCheck[], ...next: StoredCheck[]) => [
  ...checks.filter((c) => !next.some((n) => n.id === c.id)),
  ...next,
];

describe('surfaceSlot', () => {
  it('is fixed for a domain and falls between 01:00 and 05:59', () => {
    const slot = surfaceSlot('b3c5f0aa-1111-4222-8333-444455556666');
    expect(surfaceSlot('b3c5f0aa-1111-4222-8333-444455556666')).toEqual(slot);
    expect(slot.hour).toBeGreaterThanOrEqual(1);
    expect(slot.hour).toBeLessThanOrEqual(5);
    expect(slot.minute).toBeGreaterThanOrEqual(0);
    expect(slot.minute).toBeLessThanOrEqual(59);
  });

  it('spreads domains over many slots', () => {
    const slots = new Set(
      Array.from({ length: 200 }, (_, index) => {
        const { hour, minute } = surfaceSlot(`domain-${index}`);
        return `${hour}:${minute}`;
      }),
    );
    expect(slots.size).toBeGreaterThan(100);
  });
});

describe('nextSurfaceScan', () => {
  const id = 'b3c5f0aa-1111-4222-8333-444455556666';

  it('is the domain slot, in Madrid time, strictly after the given instant', () => {
    const after = new Date('2026-11-19T12:00:00Z');
    const next = nextSurfaceScan(id, after);
    const { hour, minute } = surfaceSlot(id);
    expect(next.getTime()).toBeGreaterThan(after.getTime());
    // November: Madrid is UTC+1.
    expect(next.getUTCHours()).toBe(hour - 1);
    expect(next.getUTCMinutes()).toBe(minute);
    expect(next.toISOString().slice(0, 10)).toBe('2026-11-20');
  });

  it('is the same day when the slot has not come yet, and a day later once it passed', () => {
    const { hour, minute } = surfaceSlot(id);
    const slotToday = new Date(Date.UTC(2026, 10, 19, hour - 1, minute));
    expect(nextSurfaceScan(id, new Date(slotToday.getTime() - 60_000)).getTime()).toBe(
      slotToday.getTime(),
    );
    expect(nextSurfaceScan(id, slotToday).getTime()).toBe(slotToday.getTime() + 86_400_000);
  });
});

describe('surfaceSkipReason', () => {
  const live = {
    surfaceMonitor: true,
    state: 'LIVE' as const,
    project: { deletedAt: null, suspendedAt: null },
  };

  it('scans a live domain of a live project, also in ERROR or VERIFIED', () => {
    expect(surfaceSkipReason(live)).toBeNull();
    expect(surfaceSkipReason({ ...live, state: 'ERROR' })).toBeNull();
    expect(surfaceSkipReason({ ...live, state: 'VERIFIED' })).toBeNull();
  });

  it.each([
    ['switched off', { surfaceMonitor: false }],
    ['pending', { state: 'PENDING' as const }],
    ['deleted', { project: { deletedAt: new Date(), suspendedAt: null } }],
    ['suspended', { project: { deletedAt: null, suspendedAt: new Date() } }],
  ])('skips a domain that is %s', (_label, patch) => {
    expect(surfaceSkipReason({ ...live, ...patch })).toEqual(expect.any(String));
  });
});

describe('surfaceErrorCode / surfaceFailureText', () => {
  it('maps the errors of a scan', () => {
    expect(surfaceErrorCode(new DomainNotFoundError('x'))).toBe('not_found');
    expect(surfaceErrorCode(new ScanTimeoutError('x'))).toBe('timeout');
    expect(surfaceErrorCode(new Error('boom'))).toBe('error');
    expect(surfaceErrorCode('boom')).toBe('error');
  });

  it('writes the reason in the reader language', () => {
    expect(surfaceFailureText('not_found', 'en')).toMatch(/exist|found/i);
    expect(surfaceFailureText('timeout', 'es')).toEqual(expect.any(String));
    expect(surfaceFailureText('error', 'en')).toBe(surfaceFailureText(null, 'en'));
  });
});

describe('readSnapshot', () => {
  it('reads a stored snapshot and turns anything malformed into null', () => {
    expect(readSnapshot(snapshot())).toEqual(snapshot());
    expect(readSnapshot({})).toBeNull();
    expect(readSnapshot(null)).toBeNull();
    const odd = readSnapshot({
      dns: { mx: 'x', dnssec: 'weird', ns: [1] },
      cert: { issuer: 5, days: 'a' },
    });
    expect(odd?.dns).toMatchObject({ mx: null, dnssec: null, ns: null });
    expect(odd?.cert).toEqual({ issuer: null, expires: null, days: null });
  });
});

describe('computeChanges: checks', () => {
  it('reports no change for identical scans', () => {
    expect(computeChanges(scan(), scan())).toEqual([]);
  });

  it.each([
    ['pass', 'warn'],
    ['pass', 'fail'],
    ['warn', 'fail'],
  ] as const)('reports a check going from %s to %s', (from, to) => {
    const changes = computeChanges(scan([check('hsts', from)]), scan([check('hsts', to)]));
    expect(changes).toEqual([{ kind: 'check', id: 'hsts', from, to }]);
  });

  it('ignores recovery, no change and any move from or to info', () => {
    expect(computeChanges(scan([check('hsts', 'fail')]), scan([check('hsts', 'pass')]))).toEqual(
      [],
    );
    expect(computeChanges(scan([check('hsts', 'warn')]), scan([check('hsts', 'warn')]))).toEqual(
      [],
    );
    expect(computeChanges(scan([check('hsts', 'info')]), scan([check('hsts', 'fail')]))).toEqual(
      [],
    );
    expect(computeChanges(scan([check('hsts', 'pass')]), scan([check('hsts', 'info')]))).toEqual(
      [],
    );
  });

  it('ignores a check that exists in only one of the scans', () => {
    expect(computeChanges(scan([]), scan([check('hsts', 'fail')]))).toEqual([]);
    expect(computeChanges(scan([check('hsts', 'pass')]), scan([]))).toEqual([]);
  });

  it('never reports cert-expiry as a worse check', () => {
    const changes = computeChanges(
      scan([check('cert-expiry', 'pass', { days: 35 })]),
      scan([check('cert-expiry', 'fail', { days: 3 })]),
    );
    expect(changes.some((c) => c.kind === 'check')).toBe(false);
  });
});

describe('computeChanges: certificate expiry', () => {
  const expiry = (before: number | null, after: number | null) =>
    computeChanges(
      scan([
        check('cert-expiry', 'pass', before === null ? { reason: 'unknown' } : { days: before }),
      ]),
      scan([
        check('cert-expiry', 'pass', after === null ? { reason: 'unknown' } : { days: after }),
      ]),
    );

  it.each([
    [31, 30, 30],
    [20, 14, 14],
    [9, 7, 7],
    [8, 0, 7],
  ])('crossing from %s to %s days names threshold %s', (before, after, threshold) => {
    expect(expiry(before, after)).toEqual([{ kind: 'cert_expiry', threshold, days: after }]);
  });

  it('names only the lowest threshold crossed in one jump', () => {
    expect(expiry(35, 5)).toEqual([{ kind: 'cert_expiry', threshold: 7, days: 5 }]);
    expect(expiry(35, 12)).toEqual([{ kind: 'cert_expiry', threshold: 14, days: 12 }]);
  });

  it('does not repeat while the certificate stays under a threshold', () => {
    expect(expiry(12, 11)).toEqual([]);
    expect(expiry(30, 29)).toEqual([]);
    expect(expiry(14, 13)).toEqual([]);
  });

  it('does not announce a renewal, and does not guess without days', () => {
    expect(expiry(5, 89)).toEqual([]);
    expect(expiry(null, 5)).toEqual([]);
    expect(expiry(40, null)).toEqual([]);
  });
});

describe('computeChanges: DNS and email records', () => {
  const dns = (before: Partial<SurfaceSnapshot['dns']>, after: Partial<SurfaceSnapshot['dns']>) =>
    computeChanges(scan(BASE_CHECKS, snapshot(before)), scan(BASE_CHECKS, snapshot(after)));

  it('reports what was added and removed, even when no check moved', () => {
    expect(dns({ spf: ['v=spf1 -all'] }, { spf: ['v=spf1 include:evil.test -all'] })).toEqual([
      {
        kind: 'records',
        record: 'spf',
        added: ['v=spf1 include:evil.test -all'],
        removed: ['v=spf1 -all'],
      },
    ]);
  });

  it.each([
    ['mx', 'mx', ['10 mx.a.com'], ['10 mx.a.com', '20 mx2.a.com']],
    ['dmarc', 'dmarc', ['v=dmarc1; p=reject'], ['v=dmarc1; p=none']],
    ['caa', 'caa', ['0 letsencrypt.org'], []],
    ['mta-sts', 'mtaSts', ['v=stsv1; id=1'], ['v=stsv1; id=2']],
    ['ns', 'ns', ['ns1.a.com'], ['ns1.evil.test']],
  ] as const)('reports a changed %s set', (record, key, before, after) => {
    const [change] = dns({ [key]: before }, { [key]: after });
    expect(change).toMatchObject({ kind: 'records', record });
  });

  it('is not fooled by order: the sets are compared as sets', () => {
    expect(dns({ ns: ['ns1.a.com', 'ns2.a.com'] }, { ns: ['ns2.a.com', 'ns1.a.com'] })).toEqual([]);
  });

  it('never compares a set that is null on either side', () => {
    expect(dns({ ns: null }, { ns: ['ns1.a.com'] })).toEqual([]);
    expect(dns({ spf: ['v=spf1 -all'] }, { spf: null })).toEqual([]);
    expect(dns({ mx: null }, { mx: null })).toEqual([]);
  });

  it('reports the DNSSEC state and ignores an unknown one', () => {
    expect(dns({ dnssec: 'signed' }, { dnssec: 'unsigned' })).toEqual([
      { kind: 'records', record: 'dnssec', added: ['unsigned'], removed: ['signed'] },
    ]);
    expect(dns({ dnssec: 'signed' }, { dnssec: null })).toEqual([]);
    expect(dns({ dnssec: null }, { dnssec: 'unsigned' })).toEqual([]);
  });

  it('does nothing when either snapshot is missing', () => {
    expect(computeChanges(scan(BASE_CHECKS, {}), scan())).toEqual([]);
    expect(computeChanges(scan(), scan(BASE_CHECKS, null))).toEqual([]);
  });
});

describe('computeChanges: certificate issuer', () => {
  const issuer = (before: string | null, after: string | null) =>
    computeChanges(
      scan(BASE_CHECKS, snapshot({}, { issuer: before })),
      scan(BASE_CHECKS, snapshot({}, { issuer: after })),
    );

  it('reports another organisation', () => {
    expect(issuer("Let's Encrypt", 'DigiCert Inc')).toEqual([
      { kind: 'cert_issuer', from: "Let's Encrypt", to: 'DigiCert Inc' },
    ]);
  });

  it('ignores the same organisation, case aside, and an unknown issuer on either side', () => {
    expect(issuer("Let's Encrypt", "let's encrypt")).toEqual([]);
    expect(issuer(null, 'DigiCert Inc')).toEqual([]);
    expect(issuer('DigiCert Inc', null)).toEqual([]);
  });
});

describe('computeChanges: vulnerable libraries', () => {
  const libs = (before: StoredCheck, after: StoredCheck) =>
    computeChanges(scan(replace(BASE_CHECKS, before)), scan(replace(BASE_CHECKS, after)));
  const warn = (...entries: string[]) => check('vulnerable-libs', 'warn', { libs: entries });

  it('reports entries that were not in the baseline, new library, version or advisory alike', () => {
    const before = warn('jquery 1.12.4 (fixed in 3.5.0)');
    expect(
      libs(before, warn('jquery 1.12.4 (fixed in 3.5.0)', 'bootstrap 3.3.7 (fixed in 3.4.1)')),
    ).toEqual(
      expect.arrayContaining([{ kind: 'libs', added: ['bootstrap 3.3.7 (fixed in 3.4.1)'] }]),
    );
    expect(libs(before, warn('jquery 1.12.4 (fixed in 3.5.0) https://example.test/cve'))).toEqual([
      { kind: 'libs', added: ['jquery 1.12.4 (fixed in 3.5.0) https://example.test/cve'] },
    ]);
  });

  it('reports a library that appears on a site that had none, besides the worse check', () => {
    const changes = libs(check('vulnerable-libs', 'pass'), warn('jquery 1.12.4'));
    expect(changes).toEqual([
      { kind: 'check', id: 'vulnerable-libs', from: 'pass', to: 'warn' },
      { kind: 'libs', added: ['jquery 1.12.4'] },
    ]);
  });

  it('does not report fixed libraries or the same ones', () => {
    expect(libs(warn('jquery 1.12.4', 'x 1'), warn('jquery 1.12.4'))).toEqual([]);
    expect(libs(warn('jquery 1.12.4'), warn('jquery 1.12.4'))).toEqual([]);
  });

  it('does not treat every library as new when the baseline could not tell (no Retire.js data)', () => {
    expect(
      libs(check('vulnerable-libs', 'info', { reason: 'no-data' }), warn('jquery 1.12.4')),
    ).toEqual([]);
  });
});

describe('computeChanges: order and combination', () => {
  it('lists checks, certificate, records and libraries in that order', () => {
    const changes = computeChanges(
      scan(
        [
          check('hsts', 'pass'),
          check('cert-expiry', 'pass', { days: 20 }),
          check('vulnerable-libs', 'warn', { libs: [] }),
        ],
        snapshot(),
      ),
      scan(
        [
          check('hsts', 'fail'),
          check('cert-expiry', 'warn', { days: 13 }),
          check('vulnerable-libs', 'warn', { libs: ['a 1'] }),
        ],
        snapshot({ ns: ['x.test'] }, { issuer: 'Other' }),
      ),
    );
    expect(changes.map((c) => (c.kind === 'records' ? `records:${c.record}` : c.kind))).toEqual([
      'check',
      'cert_expiry',
      'cert_issuer',
      'records:ns',
      'libs',
    ]);
  });
});

describe('changeText and changeShortText', () => {
  const changes: SurfaceChange[] = [
    { kind: 'check', id: 'hsts', from: 'pass', to: 'fail' },
    { kind: 'cert_expiry', threshold: 7, days: 7 },
    { kind: 'cert_issuer', from: "Let's Encrypt", to: 'Evil CA' },
    { kind: 'records', record: 'spf', added: ['v=spf1 +all'], removed: ['v=spf1 -all'] },
    { kind: 'records', record: 'dnssec', added: ['unsigned'], removed: ['signed'] },
    { kind: 'libs', added: ['jquery 1.12.4 (fixed in 3.5.0)'] },
  ];

  it('writes each change in plain words in English', () => {
    const lines = changes.map((c) => changeText(c, 'en'));
    expect(lines[0]).toMatch(/pass → fail/);
    expect(lines[1]).toBe('The certificate expires in 7 days');
    expect(lines[2]).toContain('Evil CA');
    expect(lines[3]).toBe('SPF record changed: removed "v=spf1 -all", added "v=spf1 +all"');
    expect(lines[4]).toBe('DNSSEC: signed → unsigned');
    expect(lines[5]).toBe('New vulnerable library: jquery 1.12.4 (fixed in 3.5.0)');
  });

  it('writes them in Spanish too', () => {
    const lines = changes.map((c) => changeText(c, 'es'));
    expect(lines[0]).toMatch(/bien → fallo/);
    expect(lines[1]).toBe('El certificado caduca en 7 días');
    expect(lines[3]).toContain('cambiado');
    expect(lines[5]).toContain('Nueva librería vulnerable');
  });

  it('keeps the short form free of record values', () => {
    expect(changeShortText(changes[3]!, 'en')).toBe('SPF record changed');
    expect(changeShortText(changes[1]!, 'en')).toBe('certificate expires in 7 days');
    expect(changeShortText(changes[0]!, 'en')).toMatch(/pass → fail/);
  });
});
