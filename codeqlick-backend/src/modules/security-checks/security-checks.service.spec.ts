import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { SecurityCheck } from '../../generated/prisma/client.js';
import type { LeadsService } from '../leads/leads.service.js';
import type { MailService } from '../mail/mail.service.js';
import { DomainNotFoundError, gatherInputs, type Probes } from './gather.js';
import { readDns, type DnsClient } from './dns-lookup.js';
import { probeTls } from './tls-probe.js';
import { runChecks } from './run-checks.js';
import type { SecurityInputs } from './security-check-inputs.js';
import {
  DAILY_DOMAIN_LIMIT,
  DAILY_EMAIL_LIMIT,
  SecurityChecksService,
} from './security-checks.service.js';
import type { SecurityChecksRepository } from './security-checks.repository.js';

const GOOD_HEADERS = {
  'strict-transport-security': 'max-age=31536000',
  'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=()',
};

function inputs(): SecurityInputs {
  return {
    domain: 'lucia.com',
    now: new Date('2026-11-18T12:00:00Z'),
    web: {
      page: {
        url: 'https://lucia.com/',
        status: 200,
        headers: GOOD_HEADERS,
        body: '<html><script src="/a.js"></script></html>',
      },
      certificateFailed: false,
      http: { finalUrl: 'https://lucia.com/', firstRedirect: 'https://lucia.com/', status: 200 },
      tls: {
        version: 'TLSv1.3',
        cipher: 'TLS_AES_256_GCM_SHA384',
        authorized: true,
        authError: null,
        validTo: new Date('2027-06-01T00:00:00Z'),
        tls10: false,
        tls11: false,
      },
      securityTxt: 'Contact: mailto:s@lucia.com\nExpires: 2027-06-01T00:00:00Z',
    },
    dns: {
      mx: [{ exchange: 'mx.lucia.com', priority: 10 }],
      txt: ['v=spf1 -all'],
      spf: { records: ['v=spf1 -all'], lookups: 0, redirectRecord: null },
      dmarc: ['v=DMARC1; p=reject; rua=mailto:d@lucia.com'],
      dkim: ['default'],
      caa: ['0 issue "letsencrypt.org"'],
      mtaSts: { txt: [], policy: null },
      tlsRpt: [],
      dnssec: { ad: true, hasDs: true },
    },
    retire: null,
  };
}

function row(overrides: Partial<SecurityCheck> = {}): SecurityCheck {
  return {
    id: 'a0000000-0000-4000-8000-000000000001',
    domain: 'lucia.com',
    name: 'Lucía',
    email: 'lucia@example.com',
    locale: 'ES',
    status: 'PENDING',
    score: null,
    grade: null,
    result: null,
    error: null,
    leadId: null,
    finishedAt: null,
    createdAt: new Date('2026-11-18T12:00:00Z'),
    updatedAt: new Date('2026-11-18T12:00:00Z'),
    ...overrides,
  };
}

describe('SecurityChecksService', () => {
  let repository: Record<string, ReturnType<typeof vi.fn>>;
  let leads: { createQuietly: ReturnType<typeof vi.fn> };
  let mail: { send: ReturnType<typeof vi.fn> };
  let service: SecurityChecksService;
  const create = {
    domain: 'lucia.com',
    email: 'Lucia@Example.com',
    name: 'Lucía',
    locale: 'es' as const,
    acceptPrivacy: true as const,
  };

  beforeEach(() => {
    repository = {
      create: vi.fn().mockResolvedValue(row()),
      find: vi.fn().mockResolvedValue(row()),
      findRecent: vi.fn().mockResolvedValue(null),
      countByEmailSince: vi.fn().mockResolvedValue(0),
      countByDomainSince: vi.fn().mockResolvedValue(0),
      update: vi.fn((_id: string, data: Partial<SecurityCheck>) =>
        Promise.resolve(row({ ...data })),
      ),
      retireData: vi.fn().mockResolvedValue(null),
      saveRetireData: vi.fn().mockResolvedValue(undefined),
      list: vi.fn(),
    };
    leads = { createQuietly: vi.fn().mockResolvedValue({ id: 'lead-1' }) };
    mail = { send: vi.fn().mockResolvedValue(undefined) };
    const config = {
      isTest: true,
      siteUrl: 'https://codeqlick.com',
      leadsNotifyTo: 'hello@codeqlick.com',
    } as unknown as AppConfigService;
    service = new SecurityChecksService(
      repository as unknown as SecurityChecksRepository,
      leads as unknown as LeadsService,
      mail as unknown as MailService,
      config,
    );
    service.fetchRetireJson = () => Promise.reject(new Error('no network in tests'));
  });

  it('stores a request with the email in lowercase, and does not run it in tests', async () => {
    const gather = vi.fn();
    service.gather = gather;
    await expect(service.create(create)).resolves.toEqual({ id: row().id });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'lucia@example.com', domain: 'lucia.com', locale: 'ES' }),
    );
    expect(gather).not.toHaveBeenCalled();
  });

  it('returns the earlier check for the same email and domain within a day', async () => {
    repository.findRecent.mockResolvedValue(row({ id: 'earlier' }));
    await expect(service.create(create)).resolves.toEqual({ id: 'earlier' });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it(`refuses more than ${DAILY_EMAIL_LIMIT} checks a day per email`, async () => {
    repository.countByEmailSince.mockResolvedValue(DAILY_EMAIL_LIMIT);
    await expect(service.create(create)).rejects.toMatchObject({ status: 429 });
    repository.countByEmailSince.mockResolvedValue(DAILY_EMAIL_LIMIT - 1);
    await expect(service.create(create)).resolves.toBeDefined();
  });

  it(`refuses more than ${DAILY_DOMAIN_LIMIT} checks a day per domain`, async () => {
    repository.countByDomainSince.mockResolvedValue(DAILY_DOMAIN_LIMIT);
    await expect(service.create(create)).rejects.toMatchObject({ status: 429 });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('discards a filled honeypot', async () => {
    await service.create({ ...create, website: 'spam' });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('runs a check: result stored, lead made, report and team emails sent', async () => {
    service.gather = (_domain, retire) => Promise.resolve({ ...inputs(), retire });
    await service.run(row().id);
    expect(repository.update).toHaveBeenCalledWith(
      row().id,
      expect.objectContaining({ status: 'DONE', score: expect.any(Number), grade: 'A+' }),
    );
    expect(leads.createQuietly).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'lucia@example.com',
        company: 'lucia.com',
        projectType: 'security',
      }),
    );
    expect(repository.update).toHaveBeenCalledWith(row().id, { leadId: 'lead-1' });
    const sent = mail.send.mock.calls.map(
      ([message]) => message as { to: string; subject: string; text: string },
    );
    expect(sent[0]).toMatchObject({ to: 'lucia@example.com' });
    expect(sent[0]!.subject).toMatch(/^Revisión de seguridad de lucia\.com: nota A\+/);
    expect(sent[0]!.text).toContain('/es/security-check/');
    expect(sent[1]).toMatchObject({ to: 'hello@codeqlick.com' });
  });

  it('marks a domain that does not exist FAILED and says so to the visitor', async () => {
    service.gather = () => Promise.reject(new DomainNotFoundError('Domain not found'));
    await service.run(row().id);
    expect(repository.update).toHaveBeenCalledWith(
      row().id,
      expect.objectContaining({ status: 'FAILED', error: 'Domain not found' }),
    );
    const [visitor] = mail.send.mock.calls[0] as [{ subject: string; text: string }];
    expect(visitor.subject).toBe('No hemos podido revisar lucia.com');
    expect(visitor.text).toContain('no existe');
  });

  it('fails a check that takes longer than its time limit', async () => {
    vi.useFakeTimers();
    try {
      service.gather = () => new Promise<SecurityInputs>(() => undefined);
      const running = service.run(row().id);
      await vi.advanceTimersByTimeAsync(61_000);
      await running;
      expect(repository.update).toHaveBeenCalledWith(
        row().id,
        expect.objectContaining({ status: 'FAILED', error: 'Timed out' }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not run a check twice', async () => {
    repository.find.mockResolvedValue(row({ status: 'DONE' }));
    const gather = vi.fn();
    service.gather = gather;
    await service.run(row().id);
    expect(gather).not.toHaveBeenCalled();
  });

  it('reports without email or name, texts in the language asked', async () => {
    const checks = runChecks(inputs());
    repository.find.mockResolvedValue(
      row({
        status: 'DONE',
        score: 90,
        grade: 'A',
        result: { finalUrl: 'https://lucia.com/', checks, retireFetchedAt: null } as never,
      }),
    );
    const report = await service.report(row().id, 'en');
    expect(JSON.stringify(report)).not.toContain('lucia@example.com');
    expect(JSON.stringify(report)).not.toContain('Lucía');
    expect(report.groups.map((group) => group.key)).toEqual([
      'https',
      'headers',
      'page',
      'dns-email',
      'security-txt',
    ]);
    // Worst first inside a group.
    const statuses = report.groups[1]!.checks.map((check) => check.status);
    expect(statuses).toEqual(
      statuses.toSorted((a, b) => 'fwip'.indexOf(a[0]!) - 'fwip'.indexOf(b[0]!)),
    );
    expect(report.groups[0]!.checks.find((check) => check.id === 'https-available')?.title).toBe(
      'The site is served over HTTPS',
    );
  });

  it('reports PENDING with no groups and an unknown check as 404', async () => {
    await expect(service.report(row().id, 'en')).resolves.toMatchObject({
      status: 'PENDING',
      groups: [],
    });
    repository.find.mockResolvedValue(null);
    await expect(service.report(row().id, 'en')).rejects.toMatchObject({ status: 404 });
  });

  describe('Retire.js data', () => {
    const json = {
      jquery: {
        vulnerabilities: [{ below: '3.5.0', severity: 'medium' }],
        extractors: { filename: ['jquery-(§§version§§)\\.js'] },
      },
    };

    it('is fetched, kept in settings, and reused for a day', async () => {
      const fetchJson = vi.fn().mockResolvedValue(json);
      service.fetchRetireJson = fetchJson;
      const first = await service.retire();
      expect(first?.repository.jquery).toBeDefined();
      expect(repository.saveRetireData).toHaveBeenCalledTimes(1);
      repository.retireData.mockResolvedValue({
        fetchedAt: new Date(Date.now() - 3600_000),
        data: first!.repository,
      });
      await service.retire();
      expect(fetchJson).toHaveBeenCalledTimes(1);
    });

    it('is refreshed when the copy is over a day old', async () => {
      const fetchJson = vi.fn().mockResolvedValue(json);
      service.fetchRetireJson = fetchJson;
      repository.retireData.mockResolvedValue({
        fetchedAt: new Date(Date.now() - 25 * 3600_000),
        data: {},
      });
      await service.retire();
      expect(fetchJson).toHaveBeenCalledTimes(1);
    });

    it('falls back to the cached copy when the fetch fails, and to null with none', async () => {
      await expect(service.retire()).resolves.toBeNull();
      const cached = { fetchedAt: new Date(Date.now() - 48 * 3600_000), data: {} };
      repository.retireData.mockResolvedValue(cached);
      // Within the hour of the failed attempt it isn't tried again.
      await expect(service.retire()).resolves.toMatchObject({ fetchedAt: cached.fetchedAt });
    });

    it('rejects data that is not the Retire.js format', async () => {
      service.fetchRetireJson = () => Promise.resolve([1, 2, 3]);
      await expect(service.retire()).resolves.toBeNull();
      expect(repository.saveRetireData).not.toHaveBeenCalled();
    });
  });
});

describe('gatherInputs (fake network)', () => {
  const page = (url: string, status = 200, headers = {}, body = '') => ({
    url,
    status,
    headers,
    body,
    bytes: body.length,
    truncated: false,
    ttfbMs: 10,
    redirects: [],
    certificateValidTo: null,
  });
  const dns = (over: Partial<DnsClient> = {}): DnsClient => ({
    txt: () => Promise.resolve([]),
    mx: () => Promise.resolve([]),
    caa: () => Promise.resolve([]),
    exists: () => Promise.resolve(true),
    dnssec: () => Promise.resolve({ ad: null, hasDs: null }),
    ...over,
  });

  it('reads the homepage, the http redirect and security.txt; mta-sts only when its TXT exists', async () => {
    const urls: string[] = [];
    const probes: Probes = {
      fetch: (url) => {
        urls.push(url);
        if (url === 'http://lucia.com/') {
          return Promise.resolve({
            ...page('https://lucia.com/'),
            redirects: ['https://lucia.com/'],
          });
        }
        if (url.endsWith('security.txt')) {
          return Promise.resolve(page(url, 200, { 'content-type': 'text/plain' }, 'Contact: x'));
        }
        return Promise.resolve(page(url, 200, { server: 'nginx' }, '<html></html>'));
      },
      tls: () => Promise.resolve(null),
      dns: dns(),
    };
    const result = await gatherInputs('lucia.com', null, probes);
    expect(result.web.page?.status).toBe(200);
    expect(result.web.http).toMatchObject({ firstRedirect: 'https://lucia.com/' });
    expect(result.web.securityTxt).toBe('Contact: x');
    expect(urls.some((url) => url.includes('mta-sts'))).toBe(false);
    expect(urls.every((url) => /^https?:\/\/lucia\.com\//.test(url))).toBe(true);
  });

  it('reads the page anyway when the certificate is wrong, and says so', async () => {
    const probes: Probes = {
      fetch: (url, options) => {
        if (
          url.startsWith('https://lucia.com/') &&
          !options?.insecure &&
          !url.includes('.well-known')
        ) {
          return Promise.reject(Object.assign(new Error('x'), { code: 'CERT_HAS_EXPIRED' }));
        }
        return Promise.resolve(page(url));
      },
      tls: () => Promise.resolve(null),
      dns: dns(),
    };
    const result = await gatherInputs('lucia.com', null, probes);
    expect(result.web.certificateFailed).toBe(true);
    expect(result.web.page).not.toBeNull();
  });

  it('works for a domain with no website: DNS checks still run', async () => {
    const probes: Probes = {
      fetch: () => Promise.reject(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' })),
      tls: () => Promise.resolve(null),
      dns: dns({
        mx: () => Promise.resolve([{ exchange: 'mx.lucia.com', priority: 1 }]),
        txt: (name) => Promise.resolve(name === 'lucia.com' ? ['v=spf1 -all'] : []),
      }),
    };
    const result = await gatherInputs('lucia.com', null, probes);
    expect(result.web.page).toBeNull();
    const checks = runChecks(result);
    expect(checks.find((check) => check.id === 'https-available')?.status).toBe('fail');
    expect(checks.find((check) => check.id === 'spf')?.status).toBe('pass');
  });

  it('throws for a domain with no records at all', async () => {
    const probes: Probes = {
      fetch: () => Promise.reject(new Error('x')),
      tls: () => Promise.resolve(null),
      dns: dns({ exists: () => Promise.resolve(false) }),
    };
    await expect(gatherInputs('nope.com', null, probes)).rejects.toBeInstanceOf(
      DomainNotFoundError,
    );
  });
});

describe('readDns (fake resolver)', () => {
  const records: Record<string, string[]> = {
    'a.com': ['v=spf1 include:b.com include:c.com mx -all'],
    'b.com': ['v=spf1 include:d.com a mx -all'],
    'c.com': ['v=spf1 ip4:1.2.3.4 -all'],
    'd.com': ['v=spf1 exists:x.%{i}.d.com ptr -all'],
    '_dmarc.a.com': ['v=DMARC1; p=none'],
    'google._domainkey.a.com': ['v=DKIM1; k=rsa; p=AAA'],
    '_mta-sts.a.com': ['v=STSv1; id=1'],
  };
  const dns: DnsClient = {
    txt: (name) => Promise.resolve(records[name] ?? []),
    mx: () => Promise.resolve([]),
    caa: () => Promise.resolve([]),
    exists: () => Promise.resolve(true),
    dnssec: () => Promise.resolve({ ad: true, hasDs: true }),
  };

  it('counts SPF lookups through includes, finds DKIM selectors and the MTA-STS policy', async () => {
    const result = await readDns('a.com', dns, () => Promise.resolve('mode: enforce'));
    // include b, include c, mx | b: include d, a, mx | d: exists, ptr → 8
    expect(result.spf.lookups).toBe(8);
    expect(result.dmarc).toEqual(['v=DMARC1; p=none']);
    expect(result.dkim).toEqual(['google']);
    expect(result.mtaSts).toEqual({ txt: ['v=STSv1; id=1'], policy: 'mode: enforce' });
    expect(result.dnssec).toEqual({ ad: true, hasDs: true });
  });

  it('stops following includes once past the limit', async () => {
    const loop: DnsClient = {
      ...dns,
      txt: (name) =>
        Promise.resolve(
          name === 'a.com'
            ? ['v=spf1 include:a1.com include:a2.com include:a3.com -all']
            : [`v=spf1 include:${name}x.com a mx -all`],
        ),
    };
    const result = await readDns('a.com', loop, () => Promise.resolve(null));
    expect(result.spf.lookups).toBeGreaterThan(10);
  });
});

describe('probeTls', () => {
  it('returns null without connecting when the name does not resolve to a public address', async () => {
    await expect(
      probeTls('internal.lucia.com', () =>
        Promise.reject(new Error('The name points to a private address')),
      ),
    ).resolves.toBeNull();
  });
});
