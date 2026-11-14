import { parse, type HTMLElement } from 'node-html-parser';
import type { IncomingHttpHeaders } from 'node:http';

export const CATEGORIES = ['speed', 'mobile', 'seo', 'security'] as const;
export type Category = (typeof CATEGORIES)[number];
export type CheckStatus = 'pass' | 'warn' | 'fail';

export const CHECK_IDS = [
  'ttfb',
  'html-size',
  'compression',
  'blocking-scripts',
  'psi-performance',
  'psi-lcp',
  'viewport',
  'zoom',
  'lang',
  'touch-icon',
  'title',
  'description',
  'h1',
  'img-alt',
  'canonical',
  'indexable',
  'robots-txt',
  'sitemap',
  'open-graph',
  'structured-data',
  'https',
  'http-redirect',
  'certificate',
  'hsts',
  'security-headers',
  'mixed-content',
  'versions',
] as const;
export type CheckId = (typeof CHECK_IDS)[number];

/** The category each check counts towards. */
export const CHECK_CATEGORY: Record<CheckId, Category> = {
  ttfb: 'speed',
  'html-size': 'speed',
  compression: 'speed',
  'blocking-scripts': 'speed',
  'psi-performance': 'speed',
  'psi-lcp': 'speed',
  viewport: 'mobile',
  zoom: 'mobile',
  lang: 'mobile',
  'touch-icon': 'mobile',
  title: 'seo',
  description: 'seo',
  h1: 'seo',
  'img-alt': 'seo',
  canonical: 'seo',
  indexable: 'seo',
  'robots-txt': 'seo',
  sitemap: 'seo',
  'open-graph': 'seo',
  'structured-data': 'seo',
  https: 'security',
  'http-redirect': 'security',
  certificate: 'security',
  hsts: 'security',
  'security-headers': 'security',
  'mixed-content': 'security',
  versions: 'security',
};

/** Values the texts put in their placeholders (`{ms}`, `{count}`…). */
export type CheckValues = Record<string, string | number>;

export interface CheckResult {
  id: CheckId;
  status: CheckStatus;
  values?: CheckValues;
}

/** What the run gathered besides the page itself. */
export interface AuditInputs {
  /** The page as answered (final URL after redirects). */
  page: {
    url: string;
    status: number;
    headers: IncomingHttpHeaders;
    body: string;
    bytes: number;
    ttfbMs: number;
  };
  /** The certificate: its expiry, or why it was refused (`null` for an http page). */
  certificate: { validTo: Date | null; error: string | null } | null;
  /** How `http://<host>/` answered: `https` when it sends to https, `http` when it serves the page over http, `none` when nothing answers. */
  httpVersion: 'https' | 'http' | 'none' | null;
  robotsTxt: string | null;
  /** Whether `/sitemap.xml` (or a sitemap listed in robots.txt) answered. */
  sitemapFound: boolean;
  /** Google PageSpeed Insights (mobile), when it ran. */
  pageSpeed: { performance: number; lcpMs: number | null } | null;
  now: Date;
}

const grade = (value: number, pass: number, warn: number): CheckStatus =>
  value <= pass ? 'pass' : value <= warn ? 'warn' : 'fail';

function header(headers: IncomingHttpHeaders, name: string): string {
  const value = headers[name];
  return (Array.isArray(value) ? value.join(', ') : (value ?? '')).trim();
}

function meta(root: HTMLElement, name: string): string | null {
  for (const element of root.querySelectorAll('meta')) {
    const key = (
      element.getAttribute('name') ??
      element.getAttribute('property') ??
      ''
    ).toLowerCase();
    if (key === name) return (element.getAttribute('content') ?? '').trim();
  }
  return null;
}

function linkRel(root: HTMLElement, rel: string): HTMLElement | undefined {
  return root
    .querySelectorAll('link')
    .find((element) =>
      (element.getAttribute('rel') ?? '').toLowerCase().split(/\s+/).includes(rel),
    );
}

/** The sitemaps a robots.txt lists (`Sitemap:` lines). */
export function sitemapsIn(robotsTxt: string): string[] {
  return robotsTxt
    .split(/\r?\n/)
    .map((line) => /^\s*sitemap\s*:\s*(\S+)/i.exec(line)?.[1])
    .filter((value): value is string => !!value);
}

/** Every check over what the run gathered (architecture 4.12). */
export function runChecks(input: AuditInputs): CheckResult[] {
  const { page } = input;
  const root = parse(page.body, { lowerCaseTagName: true, comment: false });
  const head = root.querySelector('head') ?? root;
  const results: CheckResult[] = [];
  const add = (id: CheckId, status: CheckStatus, values?: CheckValues) =>
    results.push(values ? { id, status, values } : { id, status });
  const https = page.url.startsWith('https://');

  // Speed
  add('ttfb', grade(page.ttfbMs, 600, 1500), {
    seconds: Math.max(0.1, Math.round(page.ttfbMs / 100) / 10),
  });
  const kb = Math.round(page.bytes / 1024);
  add('html-size', grade(kb, 150, 500), { kb });
  const encoding = header(page.headers, 'content-encoding').toLowerCase();
  add('compression', /gzip|br|deflate|zstd/.test(encoding) || page.bytes < 2048 ? 'pass' : 'fail');
  const blocking = head
    .querySelectorAll('script')
    .filter(
      (script) =>
        script.getAttribute('src') &&
        !script.hasAttribute('async') &&
        !script.hasAttribute('defer') &&
        (script.getAttribute('type') ?? '').toLowerCase() !== 'module',
    ).length;
  add('blocking-scripts', grade(blocking, 2, 5), { count: blocking });
  if (input.pageSpeed) {
    const performance = Math.round(input.pageSpeed.performance);
    add('psi-performance', performance >= 90 ? 'pass' : performance >= 50 ? 'warn' : 'fail', {
      score: performance,
    });
    if (input.pageSpeed.lcpMs !== null) {
      add('psi-lcp', grade(input.pageSpeed.lcpMs, 2500, 4000), {
        seconds: Math.round(input.pageSpeed.lcpMs / 100) / 10,
      });
    }
  }

  // Mobile
  const viewport = (meta(root, 'viewport') ?? '').toLowerCase().replace(/\s+/g, '');
  add('viewport', viewport.includes('width=device-width') ? 'pass' : 'fail');
  const zoomBlocked =
    /user-scalable=(no|0)/.test(viewport) || /maximum-scale=(1(\.0*)?|0?\.\d+)(,|$)/.test(viewport);
  add('zoom', zoomBlocked ? 'warn' : 'pass');
  const lang = (root.querySelector('html')?.getAttribute('lang') ?? '').trim();
  add('lang', lang ? 'pass' : 'warn', lang ? { lang } : undefined);
  add('touch-icon', linkRel(root, 'apple-touch-icon') ? 'pass' : 'warn');

  // Google
  const title = (head.querySelector('title')?.text ?? '').replace(/\s+/g, ' ').trim();
  add(
    'title',
    !title ? 'fail' : title.length >= 10 && title.length <= 65 ? 'pass' : 'warn',
    title ? { length: title.length } : undefined,
  );
  const description = meta(root, 'description') ?? '';
  add(
    'description',
    !description ? 'fail' : description.length >= 50 && description.length <= 160 ? 'pass' : 'warn',
    description ? { length: description.length } : undefined,
  );
  const h1s = root.querySelectorAll('h1').length;
  add('h1', h1s === 1 ? 'pass' : h1s === 0 ? 'fail' : 'warn', { count: h1s });
  const images = root.querySelectorAll('img');
  const missingAlt = images.filter((image) => !image.hasAttribute('alt')).length;
  add('img-alt', missingAlt === 0 ? 'pass' : missingAlt <= images.length * 0.2 ? 'warn' : 'fail', {
    count: missingAlt,
    total: images.length,
  });
  add('canonical', linkRel(root, 'canonical') ? 'pass' : 'warn');
  const robotsMeta = `${meta(root, 'robots') ?? ''} ${meta(root, 'googlebot') ?? ''} ${header(page.headers, 'x-robots-tag')}`;
  add('indexable', /noindex/i.test(robotsMeta) ? 'fail' : 'pass');
  add('robots-txt', input.robotsTxt !== null ? 'pass' : 'warn');
  add('sitemap', input.sitemapFound ? 'pass' : 'warn');
  const og = !!meta(root, 'og:title') && !!meta(root, 'og:image');
  add('open-graph', og ? 'pass' : 'warn');
  const ldJson = root
    .querySelectorAll('script')
    .some((script) => (script.getAttribute('type') ?? '').toLowerCase() === 'application/ld+json');
  add('structured-data', ldJson ? 'pass' : 'warn');

  // Security
  add('https', https ? 'pass' : 'fail');
  if (https) {
    add('http-redirect', input.httpVersion === 'http' ? 'fail' : 'pass');
    const certificate = input.certificate;
    if (certificate?.error) {
      add('certificate', 'fail', { reason: certificate.error });
    } else if (certificate?.validTo) {
      const days = Math.floor((certificate.validTo.getTime() - input.now.getTime()) / 86_400_000);
      add('certificate', days > 14 ? 'pass' : days >= 0 ? 'warn' : 'fail', { days });
    }
    add('hsts', header(page.headers, 'strict-transport-security') ? 'pass' : 'warn');
  }
  const csp = header(page.headers, 'content-security-policy');
  const missing = [
    csp ? null : 'Content-Security-Policy',
    /nosniff/i.test(header(page.headers, 'x-content-type-options'))
      ? null
      : 'X-Content-Type-Options',
    header(page.headers, 'x-frame-options') || /frame-ancestors/i.test(csp)
      ? null
      : 'X-Frame-Options',
    header(page.headers, 'referrer-policy') ? null : 'Referrer-Policy',
  ].filter((name): name is string => name !== null);
  add('security-headers', missing.length === 0 ? 'pass' : missing.length < 4 ? 'warn' : 'fail', {
    missing: missing.join(', '),
  });
  if (https) {
    const insecure = [
      ...root.querySelectorAll(
        'script[src], img[src], iframe[src], audio[src], video[src], source[src]',
      ),
    ]
      .map((element) => element.getAttribute('src') ?? '')
      .concat(
        root
          .querySelectorAll('link')
          .filter((link) => /stylesheet/i.test(link.getAttribute('rel') ?? ''))
          .map((link) => link.getAttribute('href') ?? ''),
      )
      .filter((src) => /^http:\/\//i.test(src.trim())).length;
    add('mixed-content', insecure === 0 ? 'pass' : 'fail', { count: insecure });
  }
  const shown = [
    header(page.headers, 'server'),
    header(page.headers, 'x-powered-by'),
    meta(root, 'generator') ?? '',
  ].filter((value) => /\d/.test(value));
  add('versions', shown.length === 0 ? 'pass' : 'warn', { found: shown.join(', ').slice(0, 120) });

  return results;
}

const POINTS: Record<CheckStatus, number> = { pass: 1, warn: 0.5, fail: 0 };

/**
 * Each category's score (share of points, a warn counting half) and their average. The checks
 * named in `ignore` count for nothing (a pull request's preview is noindex on purpose).
 */
export function scoreOf(
  checks: CheckResult[],
  ignore: readonly CheckId[] = [],
): {
  score: number;
  categories: Record<Category, number>;
} {
  const categories = {} as Record<Category, number>;
  for (const category of CATEGORIES) {
    const own = checks.filter(
      (check) => CHECK_CATEGORY[check.id] === category && !ignore.includes(check.id),
    );
    categories[category] = own.length
      ? Math.round((100 * own.reduce((sum, check) => sum + POINTS[check.status], 0)) / own.length)
      : 100;
  }
  const score = Math.round(
    CATEGORIES.reduce((sum, category) => sum + categories[category], 0) / CATEGORIES.length,
  );
  return { score, categories };
}
