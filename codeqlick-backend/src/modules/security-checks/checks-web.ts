import type { IncomingHttpHeaders } from 'node:http';
import { findVulnerableLibraries } from './retire.js';
import type { SecurityInputs, WebInputs } from './security-check-inputs.js';
import type { CheckResult, CheckStatus, CheckValue } from './security-check-types.js';
import type { CheckId } from './security-check-types.js';

function result(
  id: CheckId,
  status: CheckStatus,
  values: Record<string, CheckValue> = {},
): CheckResult {
  return { id, status, values };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The first value of a response header, lower-cased name looked up. */
function header(headers: IncomingHttpHeaders, name: string): string | null {
  const value = headers[name];
  if (Array.isArray(value)) return value.join(', ');
  return typeof value === 'string' ? value : null;
}

/** The last two labels of a host, or three for `co.uk`-like names. */
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, '').split('.');
  if (labels.length <= 2) return labels.join('.');
  const second = labels.at(-2)!;
  const last = labels.at(-1)!;
  const wide =
    last.length === 2 &&
    ['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'or', 'ne'].includes(second);
  return labels.slice(wide ? -3 : -2).join('.');
}

// ── HTML reading ────────────────────────────────────────────────────────────────────────────────

type Attributes = Record<string, string>;

/** The attributes of every `<name …>` tag of `html`. */
export function tagsOf(html: string, name: string): Attributes[] {
  const tags: Attributes[] = [];
  const open = new RegExp(`<${name}(?=[\\s/>])([^>]*)>`, 'gi');
  for (const match of html.matchAll(open)) {
    const attributes: Attributes = {};
    const pair = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    for (const attribute of (match[1] ?? '').matchAll(pair)) {
      attributes[attribute[1]!.toLowerCase()] = attribute[2] ?? attribute[3] ?? attribute[4] ?? '';
    }
    tags.push(attributes);
  }
  return tags;
}

/** `value` as an absolute URL against `base`, or null (data:, javascript:, bad URLs). */
function absolute(value: string | undefined, base: string): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim(), base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** Short text for a URL in a result: the address without query or fragment. */
function shorten(url: URL): string {
  return `${url.protocol}//${url.host}${url.pathname}`.slice(0, 150);
}

// ── HTTPS ───────────────────────────────────────────────────────────────────────────────────────

const MIN_HSTS = 15_552_000;

function httpsChecks(input: SecurityInputs): CheckResult[] {
  const { web, domain, now } = input;
  const { page, tls } = web;
  const checks: CheckResult[] = [];
  const answered = page !== null || tls !== null;

  checks.push(result('https-available', answered ? 'pass' : 'fail'));

  // http → https
  if (!answered) {
    checks.push(result('http-redirect', 'info', { reason: 'no-website' }));
  } else if (!web.http) {
    checks.push(result('http-redirect', 'info', { reason: 'no-http' }));
  } else {
    const final = new URL(web.http.finalUrl);
    const redirected = web.http.firstRedirect?.startsWith('https://') ?? false;
    const sameSite = registrableDomain(final.hostname) === registrableDomain(domain);
    checks.push(
      redirected && final.protocol === 'https:' && sameSite
        ? result('http-redirect', 'pass', { to: final.hostname })
        : result('http-redirect', 'fail', {
            to: final.protocol === 'https:' ? final.hostname : null,
            served: final.protocol === 'http:',
          }),
    );
  }

  // Certificate
  if (!tls) {
    // No handshake details, but a page that loaded with a trusted certificate is still a pass.
    const reason = answered ? (web.certificateFailed ? 'invalid' : 'unknown') : 'no-website';
    const trusted = page !== null && !web.certificateFailed;
    const status: CheckStatus = web.certificateFailed ? 'fail' : trusted ? 'pass' : 'info';
    checks.push(result('cert-valid', status, { reason }));
    checks.push(result('cert-expiry', 'info', { reason }));
  } else {
    checks.push(
      tls.authorized
        ? result('cert-valid', 'pass')
        : result('cert-valid', 'fail', { error: tls.authError ?? 'unknown' }),
    );
    if (tls.validTo) {
      const days = Math.floor((tls.validTo.getTime() - now.getTime()) / DAY_MS);
      const status: CheckStatus = days > 30 ? 'pass' : days >= 14 ? 'warn' : 'fail';
      checks.push(result('cert-expiry', status, { days, expires: tls.validTo.toISOString() }));
    } else {
      checks.push(result('cert-expiry', 'info', { reason: 'unknown' }));
    }
  }

  // TLS versions and cipher
  if (!tls) {
    for (const id of ['tls-version', 'tls-legacy', 'tls-cipher'] as const) {
      checks.push(result(id, 'info', { reason: answered ? 'unknown' : 'no-website' }));
    }
  } else {
    if (tls.version === null) {
      checks.push(result('tls-version', 'fail', { version: null }));
    } else {
      const modern = tls.version === 'TLSv1.3' || tls.version === 'TLSv1.2';
      checks.push(
        result('tls-version', modern ? 'pass' : 'fail', {
          version: tls.version.replace('TLSv', ''),
        }),
      );
    }
    if (tls.tls10 === null && tls.tls11 === null) {
      checks.push(result('tls-legacy', 'info', { reason: 'unknown' }));
    } else {
      const accepted = [tls.tls10 ? '1.0' : null, tls.tls11 ? '1.1' : null].filter(
        (version): version is string => version !== null,
      );
      checks.push(
        result('tls-legacy', accepted.length > 0 ? 'fail' : 'pass', { versions: accepted }),
      );
    }
    if (tls.cipher === null) {
      checks.push(result('tls-cipher', 'info', { reason: 'unknown' }));
    } else {
      const weak = /RC4|3DES|DES-CBC3|EXP|NULL|(^|[-_])DES([-_]|$)/i.test(tls.cipher);
      checks.push(result('tls-cipher', weak ? 'fail' : 'pass', { cipher: tls.cipher }));
    }
  }

  // HSTS
  if (!page) {
    checks.push(result('hsts', 'info', { reason: 'no-website' }));
    checks.push(result('hsts-subdomains', 'info', { reason: 'no-website' }));
    checks.push(result('hsts-preload', 'info', { reason: 'no-website' }));
  } else {
    const value = header(page.headers, 'strict-transport-security');
    const maxAge = value ? Number(/max-age\s*=\s*"?(\d+)/i.exec(value)?.[1] ?? Number.NaN) : null;
    if (value === null) checks.push(result('hsts', 'fail', { present: false }));
    else if (maxAge !== null && Number.isFinite(maxAge) && maxAge >= MIN_HSTS) {
      checks.push(result('hsts', 'pass', { maxAge }));
    } else {
      checks.push(result('hsts', 'warn', { maxAge: Number.isFinite(maxAge) ? maxAge : null }));
    }
    checks.push(
      result('hsts-subdomains', 'info', { present: /includesubdomains/i.test(value ?? '') }),
    );
    checks.push(
      result('hsts-preload', 'info', { present: /(^|;)\s*preload\b/i.test(value ?? '') }),
    );
  }
  return checks;
}

// ── Headers ─────────────────────────────────────────────────────────────────────────────────────

/** A CSP as directive → source list. */
export function parseCsp(policy: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of policy.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name && !directives.has(name.toLowerCase())) {
      directives.set(name.toLowerCase(), sources);
    }
  }
  return directives;
}

/** Weaknesses of an enforced CSP: unsafe keywords in script-src, wildcard and data: sources. */
export function cspProblems(policy: string): string[] {
  const directives = parseCsp(policy);
  const problems: string[] = [];
  const scripts = directives.get('script-src') ?? directives.get('default-src') ?? [];
  const lowered = scripts.map((source) => source.toLowerCase());
  const protectedInline = lowered.some(
    (source) =>
      source.startsWith("'nonce-") || source.startsWith("'sha") || source === "'strict-dynamic'",
  );
  if (lowered.includes("'unsafe-inline'") && !protectedInline) problems.push("'unsafe-inline'");
  if (lowered.includes("'unsafe-eval'")) problems.push("'unsafe-eval'");
  for (const name of ['script-src', 'default-src', 'object-src']) {
    const sources = (directives.get(name) ?? []).map((source) => source.toLowerCase());
    if (sources.includes('*')) problems.push(`${name} *`);
    if (sources.includes('data:')) problems.push(`${name} data:`);
  }
  return [...new Set(problems)];
}

const SESSION_NAME = /(sess|sid|auth|token|jwt|login)/i;

/** Problems of each `Set-Cookie`: `name: Secure, HttpOnly, SameSite`. */
export function cookieProblems(
  cookies: string[],
  https: boolean,
): { session: string[]; other: string[] } {
  const session: string[] = [];
  const other: string[] = [];
  for (const cookie of cookies) {
    const [pair, ...attributes] = cookie.split(';').map((piece) => piece.trim());
    const name = pair?.split('=')[0]?.trim() ?? '';
    if (!name) continue;
    const flags = attributes.map((attribute) => attribute.toLowerCase());
    const missing: string[] = [];
    if (https && !flags.includes('secure')) missing.push('Secure');
    const sessionLike = SESSION_NAME.test(name);
    if (sessionLike && !flags.includes('httponly')) missing.push('HttpOnly');
    if (!flags.some((flag) => flag.startsWith('samesite'))) missing.push('SameSite');
    if (missing.length === 0) continue;
    const critical = sessionLike && missing.some((flag) => flag !== 'SameSite');
    (critical ? session : other).push(`${name.slice(0, 60)}: ${missing.join(', ')}`);
  }
  return { session, other };
}

const VERSIONED = /\d+\.\d+/;

function headerChecks(input: SecurityInputs): CheckResult[] {
  const { page } = input.web;
  const ids: CheckId[] = [
    'csp-present',
    'csp-enforced',
    'csp-weak',
    'frame-protection',
    'x-content-type-options',
    'referrer-policy',
    'permissions-policy',
    'coop',
    'cookies',
    'info-leak',
  ];
  if (!page) return ids.map((id) => result(id, 'info', { reason: 'no-website' }));
  const { headers } = page;
  const checks: CheckResult[] = [];

  const csp = header(headers, 'content-security-policy');
  const reportOnly = header(headers, 'content-security-policy-report-only');
  checks.push(result('csp-present', csp || reportOnly ? 'pass' : 'fail'));
  if (csp) checks.push(result('csp-enforced', 'pass'));
  else
    checks.push(result('csp-enforced', reportOnly ? 'warn' : 'fail', { reportOnly: !!reportOnly }));
  if (csp) {
    const problems = cspProblems(csp);
    checks.push(result('csp-weak', problems.length > 0 ? 'warn' : 'pass', { problems }));
  } else {
    checks.push(result('csp-weak', 'info', { reason: 'no-policy' }));
  }

  const ancestors = csp ? parseCsp(csp).has('frame-ancestors') : false;
  const xfo = header(headers, 'x-frame-options');
  checks.push(
    ancestors || xfo
      ? result('frame-protection', 'pass', { via: ancestors ? 'csp' : 'xfo' })
      : result('frame-protection', 'fail'),
  );
  const nosniff = header(headers, 'x-content-type-options');
  checks.push(result('x-content-type-options', /nosniff/i.test(nosniff ?? '') ? 'pass' : 'warn'));

  const referrer = header(headers, 'referrer-policy');
  if (!referrer) checks.push(result('referrer-policy', 'warn', { present: false }));
  else {
    const weak = /(^|,|\s)(unsafe-url|no-referrer-when-downgrade)\s*$/i.test(referrer.trim());
    checks.push(
      result('referrer-policy', weak ? 'warn' : 'pass', { value: referrer.slice(0, 100) }),
    );
  }
  const permissions = header(headers, 'permissions-policy') ?? header(headers, 'feature-policy');
  checks.push(result('permissions-policy', permissions ? 'pass' : 'warn'));
  const coop = header(headers, 'cross-origin-opener-policy');
  checks.push(result('coop', 'info', { value: coop ? coop.slice(0, 100) : null }));

  // Cookies
  const raw = headers['set-cookie'] ?? [];
  const cookies = Array.isArray(raw) ? raw : [raw];
  const found = cookieProblems(cookies, new URL(page.url).protocol === 'https:');
  const count = cookies.length;
  if (found.session.length > 0) {
    checks.push(
      result('cookies', 'fail', {
        count,
        problems: [...found.session, ...found.other].slice(0, 6),
      }),
    );
  } else if (found.other.length > 0) {
    checks.push(result('cookies', 'warn', { count, problems: found.other.slice(0, 6) }));
  } else checks.push(result('cookies', 'pass', { count }));

  // Information leaks
  const leaks: string[] = [];
  const bare: string[] = [];
  for (const name of ['server', 'x-powered-by', 'x-aspnet-version', 'x-aspnetmvc-version']) {
    const value = header(headers, name);
    if (!value) continue;
    const shown = `${name}: ${value.slice(0, 60)}`;
    if (VERSIONED.test(value) || name.startsWith('x-aspnet')) leaks.push(shown);
    else bare.push(shown);
  }
  const generator = tagsOf(page.body, 'meta').find(
    (tag) => tag.name?.toLowerCase() === 'generator',
  );
  if (generator?.content) {
    const shown = `generator: ${generator.content.slice(0, 60)}`;
    (VERSIONED.test(generator.content) ? leaks : bare).push(shown);
  }
  if (leaks.length > 0) checks.push(result('info-leak', 'warn', { found: leaks }));
  else if (bare.length > 0) checks.push(result('info-leak', 'info', { found: bare }));
  else checks.push(result('info-leak', 'pass'));
  return checks;
}

// ── Page ────────────────────────────────────────────────────────────────────────────────────────

function pageChecks(input: SecurityInputs): CheckResult[] {
  const { page } = input.web;
  if (!page) {
    return (['mixed-content', 'sri', 'vulnerable-libs', 'form-http'] as const).map((id) =>
      result(id, 'info', { reason: 'no-website' }),
    );
  }
  const html = page.body;
  const base = page.url;
  const https = new URL(base).protocol === 'https:';
  const checks: CheckResult[] = [];

  const scripts = tagsOf(html, 'script').flatMap((tag) => {
    const url = absolute(tag.src, base);
    return url ? [{ url, integrity: tag.integrity }] : [];
  });
  const styles = tagsOf(html, 'link').flatMap((tag) => {
    if (!/stylesheet/i.test(tag.rel ?? '')) return [];
    const url = absolute(tag.href, base);
    return url ? [{ url, integrity: tag.integrity }] : [];
  });

  // Mixed content
  if (!https) {
    checks.push(result('mixed-content', 'info', { reason: 'not-https' }));
  } else {
    const active: string[] = [];
    const passive: string[] = [];
    for (const item of [...scripts, ...styles])
      if (item.url.protocol === 'http:') active.push(shorten(item.url));
    for (const tag of tagsOf(html, 'iframe')) {
      const url = absolute(tag.src, base);
      if (url?.protocol === 'http:') active.push(shorten(url));
    }
    for (const name of ['img', 'source', 'video', 'audio', 'embed']) {
      for (const tag of tagsOf(html, name)) {
        const url = absolute(tag.src, base);
        if (url?.protocol === 'http:') passive.push(shorten(url));
      }
    }
    checks.push(
      active.length > 0
        ? result('mixed-content', 'fail', {
            active: active.slice(0, 5),
            passive: passive.slice(0, 5),
          })
        : passive.length > 0
          ? result('mixed-content', 'warn', { active: [], passive: passive.slice(0, 5) })
          : result('mixed-content', 'pass'),
    );
  }

  // Subresource integrity
  const here = registrableDomain(new URL(base).hostname);
  const external = [...scripts, ...styles].filter(
    (item) => registrableDomain(item.url.hostname) !== here,
  );
  const unprotected = external.filter((item) => !item.integrity);
  checks.push(
    unprotected.length > 0
      ? result('sri', 'warn', {
          count: unprotected.length,
          hosts: [...new Set(unprotected.map((item) => item.url.hostname))].slice(0, 5),
        })
      : result('sri', 'pass', { external: external.length }),
  );

  // Known-vulnerable libraries
  if (!input.retire) {
    checks.push(result('vulnerable-libs', 'info', { reason: 'no-data' }));
  } else {
    const findings = findVulnerableLibraries(
      scripts.map((item) => item.url.toString()),
      input.retire,
    );
    if (findings.length === 0) checks.push(result('vulnerable-libs', 'pass'));
    else {
      const high = findings.some((f) => f.severity === 'high' || f.severity === 'critical');
      checks.push(
        result('vulnerable-libs', high ? 'fail' : 'warn', {
          libs: findings
            .slice(0, 6)
            .map(
              (f) =>
                `${f.library} ${f.version}${f.fixedIn ? ` (fixed in ${f.fixedIn})` : ''}${f.advisory ? ` ${f.advisory}` : ''}`,
            ),
        }),
      );
    }
  }

  // Forms
  const insecureForms = tagsOf(html, 'form').filter((form) => {
    const action = absolute(form.action, base);
    return action?.protocol === 'http:';
  });
  const passwordOverHttp =
    !https && tagsOf(html, 'input').some((tag) => tag.type?.toLowerCase() === 'password');
  checks.push(
    insecureForms.length > 0 || passwordOverHttp
      ? result('form-http', 'fail', { forms: insecureForms.length, password: passwordOverHttp })
      : result('form-http', 'pass'),
  );
  return checks;
}

// ── security.txt ────────────────────────────────────────────────────────────────────────────────

function securityTxtCheck(web: WebInputs, now: Date): CheckResult {
  if (web.securityTxt === null) return result('security-txt', 'info');
  const fields = new Map<string, string>();
  for (const line of web.securityTxt.split(/\r?\n/)) {
    const match = /^([A-Za-z-]+):\s*(.+)$/.exec(line.trim());
    if (match && !fields.has(match[1]!.toLowerCase()))
      fields.set(match[1]!.toLowerCase(), match[2]!);
  }
  const contact = fields.has('contact');
  const expiresText = fields.get('expires') ?? null;
  const expires = expiresText ? new Date(expiresText) : null;
  const valid = expires !== null && !Number.isNaN(expires.getTime());
  const future = valid && expires.getTime() > now.getTime();
  if (contact && future) return result('security-txt', 'pass', { expires: expires.toISOString() });
  return result('security-txt', 'warn', {
    contact,
    expires: valid ? expires.toISOString() : null,
    expired: valid && !future,
  });
}

export function webChecks(input: SecurityInputs): CheckResult[] {
  return [
    ...httpsChecks(input),
    ...headerChecks(input),
    ...pageChecks(input),
    securityTxtCheck(input.web, input.now),
  ];
}
