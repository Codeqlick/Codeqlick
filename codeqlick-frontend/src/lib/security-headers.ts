/**
 * Security headers of every host the website serves (architecture 6.4, decision 109): the strict
 * Content Security Policy with a nonce that `src/proxy.ts` sends, the previous policy kept while
 * the strict one is report-only, and the headers `next.config.ts` sends on every path. Pure
 * functions with relative imports only: `next.config.ts` imports this file too.
 *
 * An app is named by its subdomain's first label (`webappForHost`); any app not named here gets
 * the defaults, so a new entry of WEBAPPS needs nothing in this file.
 */
/** Cloudflare Turnstile on sign-in and sign-up (architecture 4.3): its script, frame and checks. */
export const TURNSTILE = 'https://challenges.cloudflare.com';
/** Where Server Actions send people off the site (Checkout, the customer portal, the GitHub App). */
export const FORM_TARGETS = [
  'https://checkout.stripe.com',
  'https://billing.stripe.com',
  'https://github.com',
];
/** The website's route handler that forwards CSP reports to the API (architecture 4.11). */
export const CSP_REPORT_PATH = '/api/csp-report';
/** The group name of `report-to` and `Reporting-Endpoints`. */
export const CSP_REPORT_GROUP = 'csp';

/** Apps that make calls: camera, microphone and screen sharing (architecture 4.8). */
export const CALL_APPS: readonly string[] = ['meetings'];

export interface CspContext {
  /** The app whose host was asked (`meetings`), or null on the main site. */
  app: string | null;
  /** The request's origin as the visitor sees it: `https://meetings.codeqlick.com`. */
  origin: string;
  /**
   * Origins forms may post or redirect to besides this one: the main host and every app host and,
   * on the account host, a desktop program's port on the person's own machine.
   */
  siteOrigins: readonly string[];
  /** WebSockets on another origin (MEETINGS_WS_URL). */
  sockets?: readonly string[];
}

const unique = (values: readonly string[]) =>
  values.filter((value, index) => value && values.indexOf(value) === index);

const directives = (entries: Array<[string, readonly string[]]>) =>
  entries.map(([name, values]) => [name, ...unique(values)].join(' ')).join('; ');

/** Images: remote ones where Markdown shows them (the website), the page's own elsewhere. */
function imageSources(app: string | null): string[] {
  const base = ["'self'", 'data:', 'blob:'];
  return app === null ? [...base, 'https:'] : base;
}

/** Every directive but `script-src` and the reports, shared by both policies. */
function common(context: CspContext): Array<[string, readonly string[]]> {
  return [
    ['default-src', ["'self'"]],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', imageSources(context.app)],
    ['font-src', ["'self'"]],
    ['media-src', ["'self'", 'blob:']],
    ['connect-src', ["'self'", ...(context.sockets ?? []), TURNSTILE]],
    ['frame-src', ["'self'", TURNSTILE]],
    ['worker-src', ["'self'"]],
    ['manifest-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'", ...context.siteOrigins, ...FORM_TARGETS]],
    ['frame-ancestors', ["'none'"]],
  ];
}

/**
 * The strict policy: scripts only with this response's nonce, and what they load
 * (`'strict-dynamic'`). `'self'` and the hosts are for browsers without CSP 3.
 */
export function strictCsp(context: CspContext, nonce: string): string {
  const https = context.origin.startsWith('https:');
  const [first, ...rest] = common(context);
  return directives([
    first!,
    ['script-src', ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", TURNSTILE]],
    ...rest,
    ...(https ? ([['upgrade-insecure-requests', []]] as Array<[string, string[]]>) : []),
    ['report-uri', [CSP_REPORT_PATH]],
    ['report-to', [CSP_REPORT_GROUP]],
  ]);
}

/** The previous policy (inline scripts allowed), enforced while the strict one is report-only. */
export function previousCsp(context: CspContext): string {
  const [first, ...rest] = common(context);
  return directives([first!, ['script-src', ["'self'", "'unsafe-inline'", TURNSTILE]], ...rest]);
}

/**
 * The response headers of a page: with `enforce`, the strict policy alone; without it, the
 * previous one enforced and the strict one report-only.
 */
export function cspHeaders(
  context: CspContext,
  nonce: string,
  enforce: boolean,
): Record<string, string> {
  const strict = strictCsp(context, nonce);
  return {
    ...(enforce
      ? { 'Content-Security-Policy': strict }
      : {
          'Content-Security-Policy': previousCsp(context),
          'Content-Security-Policy-Report-Only': strict,
        }),
    'Reporting-Endpoints': `${CSP_REPORT_GROUP}="${context.origin}${CSP_REPORT_PATH}"`,
  };
}

/** A fresh nonce: 16 random bytes in base64. */
export function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/** Everything a page doesn't use is off; passkeys work everywhere (decision 104). */
export function permissionsPolicy(app: string | null): string {
  const calls = app !== null && CALL_APPS.includes(app);
  return [
    'accelerometer=()',
    `camera=${calls ? '(self)' : '()'}`,
    `display-capture=${calls ? '(self)' : '()'}`,
    'geolocation=()',
    'gyroscope=()',
    'magnetometer=()',
    `microphone=${calls ? '(self)' : '()'}`,
    'payment=()',
    'usb=()',
    'publickey-credentials-create=(self)',
    'publickey-credentials-get=(self)',
  ].join(', ');
}

export const HSTS = 'max-age=31536000; includeSubDomains';

/** The headers of every path of a host (not `/site-draft/*`), CSP aside. */
export function securityHeaders(
  app: string | null,
  production: boolean,
): Array<{ key: string; value: string }> {
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'Permissions-Policy', value: permissionsPolicy(app) },
    // Browsers ignore it over plain HTTP, so local production builds are unaffected.
    ...(production ? [{ key: 'Strict-Transport-Security', value: HSTS }] : []),
  ];
}
