import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { SiteAudit } from '../../generated/prisma/client.js';
import type { LeadsService } from '../leads/leads.service.js';
import type { MailService } from '../mail/mail.service.js';
import { assertCheckableUrl, isPublicAddress, UnsafeUrlError } from './safe-fetch.js';
import { runChecks, scoreOf, type AuditInputs, type CheckResult } from './site-audit-checks.js';
import { checkText, failureText } from './site-audit-texts.js';
import type { SiteAuditsRepository } from './site-audits.repository.js';
import { createSiteAuditSchema, websiteUrlSchema } from './site-audits.schemas.js';
import { DAILY_LIMIT, SiteAuditsService } from './site-audits.service.js';

const GOOD_PAGE = `<!doctype html><html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Peluquería Lucía — Peluquería en Valencia</title>
<meta name="description" content="Cortes, color y peinados en el centro de Valencia. Pide cita online o llámanos, te esperamos de martes a sábado.">
<link rel="canonical" href="https://lucia.example/"><link rel="apple-touch-icon" href="/icon.png">
<meta property="og:title" content="Peluquería Lucía"><meta property="og:image" content="https://lucia.example/og.jpg">
<script type="application/ld+json">{"@type":"HairSalon"}</script>
<script src="/app.js" defer></script>
</head><body><h1>Peluquería Lucía</h1><img src="/a.jpg" alt="Salón"></body></html>`;

const BAD_PAGE = `<html><head><meta name="viewport" content="width=1024, user-scalable=no">
<meta name="robots" content="noindex"><meta name="generator" content="WordPress 5.2.1">
<script src="/a.js"></script><script src="/b.js"></script><script src="/c.js"></script>
</head><body><img src="http://cdn.example/x.jpg"><img src="/y.jpg"><h1>A</h1><h1>B</h1></body></html>`;

function inputs(
  overrides: Partial<AuditInputs> = {},
  page: Partial<AuditInputs['page']> = {},
): AuditInputs {
  return {
    page: {
      url: 'https://lucia.example/',
      status: 200,
      headers: {
        'content-encoding': 'br',
        'strict-transport-security': 'max-age=31536000',
        'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'strict-origin-when-cross-origin',
        server: 'nginx',
      },
      body: GOOD_PAGE,
      bytes: 20_000,
      ttfbMs: 200,
      ...page,
    },
    certificate: { validTo: new Date('2027-03-01T00:00:00Z'), error: null },
    httpVersion: 'https',
    robotsTxt: 'User-agent: *\nSitemap: https://lucia.example/sitemap.xml',
    sitemapFound: true,
    pageSpeed: null,
    now: new Date('2026-11-10T12:00:00Z'),
    ...overrides,
  };
}

const statusOf = (checks: CheckResult[], id: string) =>
  checks.find((check) => check.id === id)?.status;

describe('isPublicAddress / assertCheckableUrl', () => {
  it('refuses private, loopback, link-local, shared and mapped addresses', () => {
    const blocked = [
      '10.0.0.1',
      '127.0.0.1',
      '169.254.169.254',
      '172.20.0.5',
      '192.168.1.1',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fe80::1',
      'fd00::1',
      '::ffff:127.0.0.1',
      '64:ff9b::7f00:1',
    ];
    expect(blocked.filter((address) => isPublicAddress(address))).toEqual([]);
    expect(isPublicAddress('93.184.215.14')).toBe(true);
    expect(isPublicAddress('2606:2800:21f:cb07:6820:80da:af6b:8b2c')).toBe(true);
  });

  it('refuses other schemes, ports, credentials and private IP hosts', () => {
    const refused = [
      'ftp://lucia.example/',
      'https://lucia.example:8443/',
      'https://user:pass@lucia.example/',
      'http://127.0.0.1/',
      'http://[::1]/',
    ];
    const allowed = refused.filter((url) => {
      try {
        assertCheckableUrl(new URL(url));
        return true;
      } catch {
        return false;
      }
    });
    expect(allowed).toEqual([]);
    expect(() => assertCheckableUrl(new URL('https://lucia.example/carta'))).not.toThrow(
      UnsafeUrlError,
    );
  });
});

describe('websiteUrlSchema', () => {
  it('adds https, lowercases the host and drops the fragment', () => {
    expect(websiteUrlSchema.parse(' Lucia.Example/carta#top ')).toBe('https://lucia.example/carta');
    expect(websiteUrlSchema.parse('http://lucia.example')).toBe('http://lucia.example/');
  });

  it('refuses addresses that are not public websites', () => {
    const invalid = [
      'localhost',
      'http://localhost:3000',
      '127.0.0.1',
      'https://10.0.0.1/',
      'javascript:alert(1)',
      'file:///etc/passwd',
      'https://lucia.example:8080/',
      'https://a:b@lucia.example/',
    ];
    expect(invalid.filter((value) => websiteUrlSchema.safeParse(value).success)).toEqual([]);
  });

  it('needs the privacy consent', () => {
    const base = { url: 'lucia.example', email: 'ana@example.com', locale: 'es' };
    expect(createSiteAuditSchema.safeParse(base).success).toBe(false);
    expect(createSiteAuditSchema.safeParse({ ...base, acceptPrivacy: true }).success).toBe(true);
  });
});

describe('runChecks', () => {
  it('passes a well-made page', () => {
    const checks = runChecks(inputs());
    expect(checks.filter((check) => check.status !== 'pass')).toEqual([]);
    expect(scoreOf(checks).score).toBe(100);
  });

  it('finds the problems of a poor page', () => {
    const checks = runChecks(
      inputs(
        {
          httpVersion: 'http',
          robotsTxt: null,
          sitemapFound: false,
          certificate: { validTo: new Date('2026-11-15T00:00:00Z'), error: null },
        },
        {
          body: BAD_PAGE,
          headers: { server: 'Apache/2.4.1', 'x-powered-by': 'PHP/7.4' },
          bytes: 600 * 1024,
          ttfbMs: 2100,
        },
      ),
    );
    expect(statusOf(checks, 'ttfb')).toBe('fail');
    expect(statusOf(checks, 'html-size')).toBe('fail');
    expect(statusOf(checks, 'compression')).toBe('fail');
    expect(statusOf(checks, 'blocking-scripts')).toBe('warn');
    expect(statusOf(checks, 'viewport')).toBe('fail');
    expect(statusOf(checks, 'zoom')).toBe('warn');
    expect(statusOf(checks, 'title')).toBe('fail');
    expect(statusOf(checks, 'description')).toBe('fail');
    expect(statusOf(checks, 'h1')).toBe('warn');
    expect(statusOf(checks, 'img-alt')).toBe('fail');
    expect(statusOf(checks, 'indexable')).toBe('fail');
    expect(statusOf(checks, 'http-redirect')).toBe('fail');
    expect(statusOf(checks, 'certificate')).toBe('warn');
    expect(statusOf(checks, 'security-headers')).toBe('fail');
    expect(statusOf(checks, 'mixed-content')).toBe('fail');
    expect(statusOf(checks, 'versions')).toBe('warn');
    expect(scoreOf(checks).score).toBeLessThan(40);
  });

  it('fails an http page on HTTPS and skips the checks that need it', () => {
    const checks = runChecks(
      inputs({ certificate: null, httpVersion: null }, { url: 'http://lucia.example/' }),
    );
    expect(statusOf(checks, 'https')).toBe('fail');
    expect(statusOf(checks, 'certificate')).toBeUndefined();
    expect(statusOf(checks, 'hsts')).toBeUndefined();
  });

  it('adds Google speed when PageSpeed ran', () => {
    const checks = runChecks(inputs({ pageSpeed: { performance: 42, lcpMs: 5200 } }));
    expect(statusOf(checks, 'psi-performance')).toBe('fail');
    expect(statusOf(checks, 'psi-lcp')).toBe('fail');
  });
});

describe('texts', () => {
  it('fills the values, with numbers in the language', () => {
    expect(checkText('ttfb', 'warn', 'es', { seconds: 1.2 }).advice).toContain('1,2 s');
    expect(checkText('ttfb', 'warn', 'en', { seconds: 1.2 }).advice).toContain('1.2 s');
  });

  it('explains failures in plain words', () => {
    expect(failureText('ENOTFOUND', 'es')).toContain('no existe');
    expect(failureText('HTTP 404', 'en')).toContain('404');
    expect(failureText('UNSAFE_URL', 'en')).toContain('public');
  });
});

function auditRow(overrides: Partial<SiteAudit> = {}): SiteAudit {
  return {
    id: 'a0000000-0000-4000-8000-000000000001',
    url: 'https://lucia.example/',
    host: 'lucia.example',
    name: 'Lucía',
    email: 'lucia@example.com',
    locale: 'ES',
    status: 'PENDING',
    score: null,
    result: null,
    error: null,
    leadId: null,
    finishedAt: null,
    createdAt: new Date('2026-11-10T12:00:00Z'),
    updatedAt: new Date('2026-11-10T12:00:00Z'),
    ...overrides,
  };
}

describe('SiteAuditsService', () => {
  let repository: Record<string, ReturnType<typeof vi.fn>>;
  let leads: { createQuietly: ReturnType<typeof vi.fn> };
  let mail: { send: ReturnType<typeof vi.fn> };
  let service: SiteAuditsService;
  const create = {
    url: 'https://lucia.example/',
    email: 'Lucia@Example.com',
    name: 'Lucía',
    locale: 'es' as const,
    acceptPrivacy: true as const,
  };

  beforeEach(() => {
    repository = {
      create: vi.fn().mockResolvedValue(auditRow()),
      find: vi.fn().mockResolvedValue(auditRow()),
      findRecent: vi.fn().mockResolvedValue(null),
      countSince: vi.fn().mockResolvedValue(0),
      update: vi.fn((id: string, data: Partial<SiteAudit>) =>
        Promise.resolve(auditRow({ ...data })),
      ),
    };
    leads = { createQuietly: vi.fn().mockResolvedValue({ id: 'lead-1' }) };
    mail = { send: vi.fn().mockResolvedValue(undefined) };
    const config = {
      isTest: true,
      siteUrl: 'https://codeqlick.com',
      leadsNotifyTo: 'hello@codeqlick.com',
    } as unknown as AppConfigService;
    service = new SiteAuditsService(
      repository as unknown as SiteAuditsRepository,
      leads as unknown as LeadsService,
      mail as unknown as MailService,
      config,
    );
  });

  it('stores a request with the email in lowercase', async () => {
    await expect(service.create(create)).resolves.toEqual({ id: auditRow().id });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'lucia@example.com', host: 'lucia.example', locale: 'ES' }),
    );
  });

  it('returns the same check for the same email and site within a day', async () => {
    repository.findRecent.mockResolvedValue(auditRow({ id: 'earlier' }));
    await expect(service.create(create)).resolves.toEqual({ id: 'earlier' });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it(`refuses more than ${DAILY_LIMIT} checks a day per email`, async () => {
    repository.countSince.mockResolvedValue(DAILY_LIMIT);
    await expect(service.create(create)).rejects.toMatchObject({ status: 429 });
  });

  it('discards a filled honeypot', async () => {
    await service.create({ ...create, website: 'spam' });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('runs a check: result stored, lead made, report and team emails sent', async () => {
    service.gatherInputs = () => Promise.resolve(inputs());
    await service.run(auditRow().id);
    expect(repository.update).toHaveBeenCalledWith(
      auditRow().id,
      expect.objectContaining({ status: 'DONE', score: 100 }),
    );
    expect(leads.createQuietly).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'lucia@example.com', company: 'lucia.example' }),
    );
    expect(repository.update).toHaveBeenCalledWith(auditRow().id, { leadId: 'lead-1' });
    const sent = mail.send.mock.calls.map(
      ([message]) => message as { to: string; subject: string },
    );
    expect(sent).toEqual([
      expect.objectContaining({
        to: 'lucia@example.com',
        subject: 'Revisión de lucia.example: 100/100',
      }),
      expect.objectContaining({ to: 'hello@codeqlick.com' }),
    ]);
  });

  it('tells them when the site could not be opened', async () => {
    service.gatherInputs = () => Promise.reject(new Error('ENOTFOUND'));
    await service.run(auditRow().id);
    expect(repository.update).toHaveBeenCalledWith(
      auditRow().id,
      expect.objectContaining({ status: 'FAILED', error: 'ENOTFOUND' }),
    );
    const [visitor] = mail.send.mock.calls[0] as [{ subject: string; text: string }];
    expect(visitor.subject).toBe('No hemos podido revisar lucia.example');
    expect(visitor.text).toContain('no existe');
  });

  it('does not run a check twice', async () => {
    repository.find.mockResolvedValue(auditRow({ status: 'DONE' }));
    const gatherInputs = vi.fn();
    service.gatherInputs = gatherInputs;
    await service.run(auditRow().id);
    expect(gatherInputs).not.toHaveBeenCalled();
  });

  it('reports without email or name, texts in the language asked', async () => {
    const checks = runChecks(inputs());
    repository.find.mockResolvedValue(
      auditRow({
        status: 'DONE',
        score: 100,
        result: {
          finalUrl: 'https://lucia.example/',
          categories: scoreOf(checks).categories,
          checks,
        } as never,
      }),
    );
    const report = await service.report(auditRow().id, 'en');
    expect(JSON.stringify(report)).not.toContain('lucia@example.com');
    expect(JSON.stringify(report)).not.toContain('Lucía');
    expect(report.categories.map((category) => category.name)).toEqual([
      'Speed',
      'Mobile',
      'Google',
      'Security',
    ]);
  });
});
