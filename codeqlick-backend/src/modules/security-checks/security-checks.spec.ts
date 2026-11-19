import { describe, expect, it } from 'vitest';
import { dnsChecks, spfAll, spfTerms } from './checks-dns.js';
import { cookieProblems, cspProblems, registrableDomain, tagsOf } from './checks-web.js';
import { parseRetire, compareVersions, findVulnerableLibraries } from './retire.js';
import { runChecks } from './run-checks.js';
import type { DnsInputs, SecurityInputs, TlsInputs } from './security-check-inputs.js';
import { gradeChecks } from './security-check-score.js';
import { checkText, failureText } from './security-check-texts.js';
import {
  CHECK_GROUP,
  type CheckId,
  type CheckResult,
  type CheckStatus,
} from './security-check-types.js';
import { createSecurityCheckSchema, domainSchema } from './security-checks.schemas.js';

const NOW = new Date('2026-11-18T12:00:00Z');

const GOOD_HEADERS = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=()',
  'cross-origin-opener-policy': 'same-origin',
  server: 'nginx',
};

const GOOD_PAGE = `<!doctype html><html><head><title>Hi</title>
<script src="/app.js"></script>
<script src="https://cdn.example.net/lib.js" integrity="sha384-abc" crossorigin="anonymous"></script>
</head><body><form action="/search"><input name="q"></form><img src="https://acme.test/a.png"></body></html>`;

const GOOD_TLS: TlsInputs = {
  version: 'TLSv1.3',
  cipher: 'TLS_AES_256_GCM_SHA384',
  authorized: true,
  authError: null,
  validTo: new Date('2027-03-01T00:00:00Z'),
  issuer: "Let's Encrypt",
  tls10: false,
  tls11: false,
};

const GOOD_DNS: DnsInputs = {
  mx: [{ exchange: 'mx.acme.com', priority: 10 }],
  txt: ['v=spf1 include:_spf.acme.com -all'],
  spf: { records: ['v=spf1 include:_spf.acme.com -all'], lookups: 2, redirectRecord: null },
  dmarc: ['v=DMARC1; p=reject; rua=mailto:d@acme.com'],
  dkim: ['google'],
  caa: ['0 letsencrypt.org'],
  ns: ['ns1.acme.com'],
  mtaSts: { txt: ['v=STSv1; id=1'], policy: 'version: STSv1\nmode: enforce\nmx: mx.acme.com' },
  tlsRpt: ['v=TLSRPTv1; rua=mailto:t@acme.com'],
  dnssec: { ad: true, hasDs: true },
};

function inputs(overrides: Partial<SecurityInputs> = {}): SecurityInputs {
  return {
    domain: 'acme.com',
    now: NOW,
    web: {
      page: { url: 'https://acme.com/', status: 200, headers: GOOD_HEADERS, body: GOOD_PAGE },
      certificateFailed: false,
      http: { finalUrl: 'https://acme.com/', firstRedirect: 'https://acme.com/', status: 200 },
      tls: GOOD_TLS,
      securityTxt: 'Contact: mailto:security@acme.com\nExpires: 2027-06-01T00:00:00Z',
    },
    dns: GOOD_DNS,
    retire: null,
    ...overrides,
  };
}

/** Same inputs with one change to the web part. */
function withWeb(change: Partial<SecurityInputs['web']>): SecurityInputs {
  const base = inputs();
  return { ...base, web: { ...base.web, ...change } };
}
function withPage(change: Partial<NonNullable<SecurityInputs['web']['page']>>): SecurityInputs {
  const base = inputs();
  return withWeb({ page: { ...base.web.page!, ...change } });
}

const find = (checks: CheckResult[], id: CheckId) => checks.find((check) => check.id === id)!;
const statusOf = (input: SecurityInputs, id: CheckId): CheckStatus =>
  find(runChecks(input), id).status;

describe('runChecks', () => {
  it('returns every check once and passes a well-made site with an A+', () => {
    const checks = runChecks(inputs());
    expect(checks.map((check) => check.id).toSorted()).toEqual(Object.keys(CHECK_GROUP).toSorted());
    expect(checks.filter((check) => check.status === 'fail' || check.status === 'warn')).toEqual(
      [],
    );
    expect(gradeChecks(checks)).toEqual({ score: 100, grade: 'A+' });
  });

  it('turns a site with no website into fails and infos, not a crash', () => {
    const input = withWeb({
      page: null,
      http: null,
      tls: null,
      securityTxt: null,
      certificateFailed: false,
    });
    const checks = runChecks(input);
    expect(find(checks, 'https-available').status).toBe('fail');
    expect(find(checks, 'csp-present').status).toBe('info');
    expect(find(checks, 'mixed-content').status).toBe('info');
    // DNS and email checks still run.
    expect(find(checks, 'spf').status).toBe('pass');
    expect(gradeChecks(checks).grade).toBe('D');
  });
});

describe('HTTPS checks', () => {
  it('http-redirect needs a redirect to https on the same site', () => {
    expect(statusOf(inputs(), 'http-redirect')).toBe('pass');
    const web = (finalUrl: string, firstRedirect: string | null) =>
      withWeb({ http: { finalUrl, firstRedirect, status: 200 } });
    expect(statusOf(web('http://acme.com/', null), 'http-redirect')).toBe('fail');
    expect(statusOf(web('https://evil.test/', 'https://evil.test/'), 'http-redirect')).toBe('fail');
    expect(statusOf(web('https://www.acme.com/', 'https://acme.com/'), 'http-redirect')).toBe(
      'pass',
    );
    expect(statusOf(withWeb({ http: null }), 'http-redirect')).toBe('info');
  });

  it('cert-expiry: over 30 days passes, 14 to 30 warns, under 14 fails', () => {
    const days = (count: number) =>
      withWeb({
        tls: { ...GOOD_TLS, validTo: new Date(NOW.getTime() + count * 24 * 3600 * 1000) },
      });
    expect(statusOf(days(45), 'cert-expiry')).toBe('pass');
    expect(statusOf(days(20), 'cert-expiry')).toBe('warn');
    expect(statusOf(days(5), 'cert-expiry')).toBe('fail');
    expect(statusOf(days(-2), 'cert-expiry')).toBe('fail');
  });

  it('cert-valid fails for an untrusted certificate, and the page is still read', () => {
    const bad = withWeb({
      tls: { ...GOOD_TLS, authorized: false, authError: 'CERT_HAS_EXPIRED' },
    });
    expect(find(runChecks(bad), 'cert-valid')).toMatchObject({
      status: 'fail',
      values: { error: 'CERT_HAS_EXPIRED' },
    });
    expect(gradeChecks(runChecks(bad)).grade).toBe('D');
    const noHandshake = withWeb({ tls: null, certificateFailed: true });
    expect(statusOf(noHandshake, 'cert-valid')).toBe('fail');
  });

  it('tls checks: version, legacy versions and weak ciphers', () => {
    const tls = (change: Partial<TlsInputs>) => withWeb({ tls: { ...GOOD_TLS, ...change } });
    expect(statusOf(tls({ version: 'TLSv1.2' }), 'tls-version')).toBe('pass');
    expect(statusOf(tls({ version: null }), 'tls-version')).toBe('fail');
    expect(statusOf(tls({ tls10: true }), 'tls-legacy')).toBe('fail');
    expect(find(runChecks(tls({ tls11: true })), 'tls-legacy').values).toEqual({
      versions: ['1.1'],
    });
    expect(statusOf(tls({ tls10: null, tls11: null }), 'tls-legacy')).toBe('info');
    expect(statusOf(tls({ cipher: 'ECDHE-RSA-DES-CBC3-SHA' }), 'tls-cipher')).toBe('fail');
    expect(statusOf(tls({ cipher: 'ECDHE-RSA-AES128-GCM-SHA256' }), 'tls-cipher')).toBe('pass');
  });

  it('hsts: long max-age passes, short warns, missing fails', () => {
    const hsts = (value?: string) =>
      withPage({ headers: value ? { ...GOOD_HEADERS, 'strict-transport-security': value } : {} });
    expect(statusOf(hsts('max-age=15552000'), 'hsts')).toBe('pass');
    expect(statusOf(hsts('max-age=3600'), 'hsts')).toBe('warn');
    expect(statusOf(hsts(), 'hsts')).toBe('fail');
    expect(find(runChecks(hsts('max-age=1; preload')), 'hsts-preload').values).toEqual({
      present: true,
    });
  });
});

describe('header checks', () => {
  const headers = (change: Record<string, string | string[] | undefined>) =>
    withPage({ headers: { ...GOOD_HEADERS, ...change } });

  it('csp: none fails, report-only warns on enforced, weak sources warn', () => {
    const none = headers({ 'content-security-policy': undefined });
    expect(statusOf(none, 'csp-present')).toBe('fail');
    expect(statusOf(none, 'csp-enforced')).toBe('fail');
    expect(statusOf(none, 'csp-weak')).toBe('info');
    const reportOnly = headers({
      'content-security-policy': undefined,
      'content-security-policy-report-only': "default-src 'self'",
    });
    expect(statusOf(reportOnly, 'csp-present')).toBe('pass');
    expect(statusOf(reportOnly, 'csp-enforced')).toBe('warn');
    const weak = headers({ 'content-security-policy': "script-src 'self' 'unsafe-inline' *" });
    expect(statusOf(weak, 'csp-weak')).toBe('warn');
  });

  it('cspProblems ignores unsafe-inline next to a nonce', () => {
    expect(cspProblems("script-src 'nonce-abc' 'unsafe-inline'")).toEqual([]);
    expect(cspProblems("default-src 'unsafe-eval' data:")).toEqual([
      "'unsafe-eval'",
      'default-src data:',
    ]);
  });

  it('frame protection comes from frame-ancestors or X-Frame-Options', () => {
    const noCsp = { 'content-security-policy': undefined };
    expect(statusOf(headers({ ...noCsp }), 'frame-protection')).toBe('fail');
    expect(statusOf(headers({ ...noCsp, 'x-frame-options': 'DENY' }), 'frame-protection')).toBe(
      'pass',
    );
    expect(statusOf(inputs(), 'frame-protection')).toBe('pass');
  });

  it('nosniff, referrer-policy and permissions-policy warn when missing', () => {
    const bare = headers({
      'x-content-type-options': undefined,
      'referrer-policy': undefined,
      'permissions-policy': undefined,
    });
    expect(statusOf(bare, 'x-content-type-options')).toBe('warn');
    expect(statusOf(bare, 'referrer-policy')).toBe('warn');
    expect(statusOf(bare, 'permissions-policy')).toBe('warn');
    expect(statusOf(headers({ 'referrer-policy': 'unsafe-url' }), 'referrer-policy')).toBe('warn');
  });

  it('cookies: session cookies without Secure or HttpOnly fail, a missing SameSite warns', () => {
    const cookies = (...set: string[]) => headers({ 'set-cookie': set });
    expect(statusOf(cookies('theme=dark; Secure; SameSite=Lax'), 'cookies')).toBe('pass');
    expect(statusOf(cookies('theme=dark; Secure'), 'cookies')).toBe('warn');
    expect(statusOf(cookies('theme=dark; SameSite=Lax'), 'cookies')).toBe('warn');
    expect(statusOf(cookies('sessionid=abc; Secure; SameSite=Lax'), 'cookies')).toBe('fail');
    expect(statusOf(cookies('sid=abc; HttpOnly; SameSite=Lax'), 'cookies')).toBe('fail');
    expect(statusOf(cookies('sid=abc; Secure; HttpOnly; SameSite=Strict'), 'cookies')).toBe('pass');
    expect(cookieProblems(['sid=1'], true).session).toEqual(['sid: Secure, HttpOnly, SameSite']);
  });

  it('info-leak: versions warn, bare names are for information only', () => {
    expect(statusOf(headers({ server: 'Apache/2.4.41 (Ubuntu)' }), 'info-leak')).toBe('warn');
    expect(statusOf(headers({ 'x-powered-by': 'PHP/8.1.2' }), 'info-leak')).toBe('warn');
    expect(statusOf(headers({ 'x-powered-by': 'Express' }), 'info-leak')).toBe('info');
    expect(statusOf(headers({ server: 'nginx' }), 'info-leak')).toBe('info');
    expect(statusOf(headers({ server: undefined }), 'info-leak')).toBe('pass');
    const generator = withPage({ body: '<meta name="generator" content="WordPress 5.2.1">' });
    expect(statusOf(generator, 'info-leak')).toBe('warn');
  });
});

describe('page checks', () => {
  it('mixed-content: http scripts fail, http images warn', () => {
    const body = (html: string) => withPage({ body: html });
    expect(statusOf(body('<script src="http://cdn.test/a.js"></script>'), 'mixed-content')).toBe(
      'fail',
    );
    expect(statusOf(body('<img src="http://cdn.test/a.png">'), 'mixed-content')).toBe('warn');
    expect(
      statusOf(
        body('<img src="https://cdn.test/a.png"><a href="http://x.test">x</a>'),
        'mixed-content',
      ),
    ).toBe('pass');
    expect(
      statusOf(
        withPage({ url: 'http://acme.com/', body: '<img src="http://cdn.test/a.png">' }),
        'mixed-content',
      ),
    ).toBe('info');
  });

  it('sri: third-party files without integrity warn; own and sibling hosts do not count', () => {
    const body = (html: string) => withPage({ body: html });
    expect(statusOf(body('<script src="https://cdn.other.net/a.js"></script>'), 'sri')).toBe(
      'warn',
    );
    expect(
      find(runChecks(body('<link rel="stylesheet" href="//cdn.other.net/a.css">')), 'sri').values,
    ).toMatchObject({ count: 1, hosts: ['cdn.other.net'] });
    expect(statusOf(body('<script src="https://static.acme.com/a.js"></script>'), 'sri')).toBe(
      'pass',
    );
    expect(statusOf(inputs(), 'sri')).toBe('pass');
  });

  it('form-http: an http action or a password field over http fails', () => {
    const body = (html: string, url = 'https://acme.com/') => withPage({ url, body: html });
    expect(statusOf(body('<form action="http://acme.com/login"></form>'), 'form-http')).toBe(
      'fail',
    );
    expect(statusOf(body('<input type="password">', 'http://acme.com/'), 'form-http')).toBe('fail');
    expect(
      statusOf(body('<form action="/login"><input type="password"></form>'), 'form-http'),
    ).toBe('pass');
  });

  it('vulnerable-libs uses Retire.js data on script URLs and names only', () => {
    const retire = parseRetire({
      jquery: {
        vulnerabilities: [
          { below: '3.5.0', severity: 'medium', info: ['https://example.org/advisory'] },
        ],
        extractors: {
          filename: ['jquery-(§§version§§)(\\.min)?\\.js'],
          uri: ['/(§§version§§)/jquery(\\.min)?\\.js'],
        },
      },
      angularjs: {
        vulnerabilities: [{ below: '1.8.0', severity: 'high' }],
        extractors: { filename: ['angular-(§§version§§)(\\.min)?\\.js'] },
      },
      other: { vulnerabilities: [], extractors: { func: ['x'] } },
    });
    const page = (src: string) => withPage({ body: `<script src="${src}"></script>` });
    const withRetire = (input: SecurityInputs): SecurityInputs => ({ ...input, retire });
    expect(statusOf(withRetire(page('/js/jquery-3.4.1.min.js')), 'vulnerable-libs')).toBe('warn');
    expect(
      find(runChecks(withRetire(page('/js/jquery-3.4.1.min.js'))), 'vulnerable-libs').values,
    ).toEqual({ libs: ['jquery 3.4.1 (fixed in 3.5.0) https://example.org/advisory'] });
    expect(
      statusOf(withRetire(page('https://cdn.test/ajax/1.2.3/jquery.min.js')), 'vulnerable-libs'),
    ).toBe('warn');
    expect(statusOf(withRetire(page('/js/angular-1.5.8.min.js')), 'vulnerable-libs')).toBe('fail');
    expect(statusOf(withRetire(page('/js/jquery-3.6.0.min.js')), 'vulnerable-libs')).toBe('pass');
    expect(statusOf(page('/js/jquery-1.0.0.js'), 'vulnerable-libs')).toBe('info');
  });
});

describe('security.txt', () => {
  const txt = (securityTxt: string | null) => withWeb({ securityTxt });
  it('passes with Contact and a future Expires, warns when expired or without Contact', () => {
    expect(statusOf(inputs(), 'security-txt')).toBe('pass');
    expect(statusOf(txt('Contact: a@b.com\nExpires: 2020-01-01T00:00:00Z'), 'security-txt')).toBe(
      'warn',
    );
    expect(statusOf(txt('Expires: 2030-01-01T00:00:00Z'), 'security-txt')).toBe('warn');
    expect(statusOf(txt('Contact: a@b.com'), 'security-txt')).toBe('warn');
    expect(statusOf(txt(null), 'security-txt')).toBe('info');
  });
});

describe('DNS and email checks', () => {
  const dns = (change: Partial<DnsInputs>) => dnsChecks({ ...GOOD_DNS, ...change });
  const status = (checks: CheckResult[], id: CheckId) => find(checks, id).status;

  it('passes a well-configured domain', () => {
    const checks = dns({});
    // tls-rpt is only ever informational.
    expect(checks.filter((check) => check.status !== 'pass' && check.id !== 'tls-rpt')).toEqual([]);
  });

  it('spf: -all passes, ~all warns, others fail, over 10 lookups or several records fail', () => {
    const spf = (record: string, lookups = 1) =>
      status(dns({ spf: { records: [record], lookups, redirectRecord: null } }), 'spf');
    expect(spf('v=spf1 -all')).toBe('pass');
    expect(spf('v=spf1 ~all')).toBe('warn');
    expect(spf('v=spf1 ?all')).toBe('fail');
    expect(spf('v=spf1 +all')).toBe('fail');
    expect(spf('v=spf1 ip4:1.2.3.4')).toBe('fail');
    expect(spf('v=spf1 -all', 11)).toBe('fail');
    expect(status(dns({ spf: { records: [], lookups: 0, redirectRecord: null } }), 'spf')).toBe(
      'fail',
    );
    expect(
      status(
        dns({ spf: { records: ['v=spf1 -all', 'v=spf1 ~all'], lookups: 0, redirectRecord: null } }),
        'spf',
      ),
    ).toBe('fail');
    expect(
      status(
        dns({
          spf: {
            records: ['v=spf1 redirect=_spf.x.com'],
            lookups: 1,
            redirectRecord: 'v=spf1 -all',
          },
        }),
        'spf',
      ),
    ).toBe('pass');
  });

  it('counts the lookup terms of an SPF record', () => {
    expect(
      spfTerms('v=spf1 include:a.com mx a ip4:1.2.3.4 ptr exists:%{i}.x.com -all').lookups,
    ).toHaveLength(5);
    expect(spfTerms('v=spf1 redirect=x.com').redirect).toBe('x.com');
    expect(spfAll('v=spf1 include:a.com ~all')).toBe('~');
    expect(spfAll('v=spf1 ip4:1.2.3.4')).toBeNull();
  });

  it('dmarc: reject and quarantine pass, none warns, missing fails', () => {
    const dmarc = (...records: string[]) => status(dns({ dmarc: records }), 'dmarc');
    expect(dmarc('v=DMARC1; p=quarantine')).toBe('pass');
    expect(dmarc('v=DMARC1; p=none; rua=mailto:a@b.com')).toBe('warn');
    expect(dmarc()).toBe('fail');
    expect(find(dns({ dmarc: ['v=DMARC1; p=reject'] }), 'dmarc').values).toEqual({
      policy: 'reject',
      rua: false,
    });
  });

  it('dkim is only informational when not found; mx may be a null MX', () => {
    expect(status(dns({ dkim: [] }), 'dkim')).toBe('info');
    expect(find(dns({ mx: [{ exchange: '', priority: 0 }] }), 'mx').values).toMatchObject({
      nullMx: true,
    });
    expect(status(dns({ mx: [] }), 'mx')).toBe('warn');
  });

  it('skips SPF, DMARC, MX and DKIM for a domain that sends no email', () => {
    const checks = dns({
      mx: [],
      txt: [],
      spf: { records: [], lookups: 0, redirectRecord: null },
      dmarc: [],
      dkim: [],
    });
    for (const id of ['mx', 'spf', 'dmarc', 'dkim'] as const) {
      expect(find(checks, id)).toMatchObject({ status: 'info', values: { reason: 'no-email' } });
    }
  });

  it('caa, dnssec, mta-sts and tls-rpt', () => {
    expect(status(dns({ caa: [] }), 'caa')).toBe('info');
    expect(status(dns({ dnssec: { ad: false, hasDs: false } }), 'dnssec')).toBe('warn');
    expect(status(dns({ dnssec: { ad: null, hasDs: null } }), 'dnssec')).toBe('info');
    const sts = (policy: string | null, txt = ['v=STSv1; id=1']) =>
      status(dns({ mtaSts: { txt, policy } }), 'mta-sts');
    expect(sts('mode: testing')).toBe('warn');
    expect(sts('mode: none')).toBe('info');
    expect(sts(null)).toBe('warn');
    expect(sts(null, [])).toBe('info');
    expect(status(dns({ tlsRpt: [] }), 'tls-rpt')).toBe('info');
  });
});

describe('helpers', () => {
  it('registrableDomain', () => {
    expect(registrableDomain('www.acme.com')).toBe('acme.com');
    expect(registrableDomain('shop.acme.co.uk')).toBe('acme.co.uk');
    expect(registrableDomain('acme.com')).toBe('acme.com');
  });

  it('tagsOf reads attributes with every quoting style', () => {
    expect(
      tagsOf(`<script SRC='a.js' defer integrity=x></script><scripty src="no">`, 'script'),
    ).toEqual([{ src: 'a.js', defer: '', integrity: 'x' }]);
  });

  it('compareVersions and findVulnerableLibraries respect atOrAbove and below', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('2.0', '2.0.0')).toBe(0);
    const repository = parseRetire({
      lib: {
        vulnerabilities: [{ atOrAbove: '2.0.0', below: '2.5.0', severity: 'low' }],
        extractors: { filename: ['lib-(§§version§§)\\.js'] },
      },
    });
    expect(findVulnerableLibraries(['/lib-1.9.0.js', '/lib-2.5.0.js'], repository)).toEqual([]);
    expect(findVulnerableLibraries(['/lib-2.1.0.js'], repository)).toHaveLength(1);
  });
});

describe('domainSchema and createSecurityCheckSchema', () => {
  it('reduces URLs to their host and lower-cases', () => {
    expect(domainSchema.parse('Acme.COM')).toBe('acme.com');
    expect(domainSchema.parse(' https://www.Acme.com/path?q=1#x ')).toBe('www.acme.com');
    expect(domainSchema.parse('acme.com:8080/x')).toBe('acme.com');
    expect(domainSchema.parse('acme.com.')).toBe('acme.com');
  });

  it('refuses IPs, localhost, names without a dot and private or reserved names', () => {
    for (const value of [
      '127.0.0.1',
      'http://10.0.0.1',
      '[::1]',
      'localhost',
      'intranet',
      'printer.local',
      'foo.internal',
      'foo.test',
      'foo.example',
      'a..com',
      '-bad.com',
      'x.1234',
    ]) {
      expect([value, domainSchema.safeParse(value).success]).toEqual([value, false]);
    }
  });

  it('needs the email and the privacy consent', () => {
    const base = { domain: 'acme.com', email: 'a@b.com', locale: 'en', acceptPrivacy: true };
    expect(createSecurityCheckSchema.safeParse(base).success).toBe(true);
    expect(createSecurityCheckSchema.safeParse({ ...base, acceptPrivacy: false }).success).toBe(
      false,
    );
    expect(createSecurityCheckSchema.safeParse({ ...base, email: 'nope' }).success).toBe(false);
    expect(createSecurityCheckSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});

describe('texts', () => {
  const statuses: CheckStatus[] = ['pass', 'warn', 'fail', 'info'];

  it('exist for every check in both languages, with no placeholder left unfilled', () => {
    const values = { reason: 'x', rua: false, policy: 'none', present: false };
    for (const id of Object.keys(CHECK_GROUP) as CheckId[]) {
      for (const status of statuses) {
        for (const locale of ['en', 'es'] as const) {
          const text = checkText(id, status, locale, values);
          expect(text.title, `${id} title`).not.toBe('');
          expect(text.explanation, `${id} ${status} ${locale}`).not.toBe('');
          expect(`${text.explanation}${text.advice}`).not.toMatch(/\{\w+\}/);
        }
      }
    }
  });

  it('fills values, joins lists, and keeps fix advice off passes', () => {
    const text = checkText('cert-expiry', 'warn', 'es', { days: 20 });
    expect(text.explanation).toContain('20 días');
    expect(text.advice).not.toBe('');
    expect(checkText('cert-expiry', 'pass', 'en', { days: 90 }).advice).toBe('');
    expect(
      checkText('tls-legacy', 'fail', 'en', { versions: ['1.0', '1.1'] }).explanation,
    ).toContain('1.0, 1.1');
  });

  it('explains failures in plain words', () => {
    expect(failureText('Domain not found', 'en')).toContain("doesn't exist");
    expect(failureText('Timed out', 'es')).toContain('tardó');
    expect(failureText('whatever', 'en')).toContain('could not be completed');
  });
});
