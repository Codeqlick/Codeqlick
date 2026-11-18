/** Statuses of a check; `info` is never scored (architecture 4.19). */
export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info';

export type CheckGroup = 'https' | 'headers' | 'page' | 'dns-email' | 'security-txt';

export const GROUPS: readonly CheckGroup[] = [
  'https',
  'headers',
  'page',
  'dns-email',
  'security-txt',
];

/** Every check of the Security check, in report order. */
export const CHECK_GROUP = {
  'https-available': 'https',
  'http-redirect': 'https',
  'cert-valid': 'https',
  'cert-expiry': 'https',
  'tls-version': 'https',
  'tls-legacy': 'https',
  'tls-cipher': 'https',
  hsts: 'https',
  'hsts-subdomains': 'https',
  'hsts-preload': 'https',
  'csp-present': 'headers',
  'csp-enforced': 'headers',
  'csp-weak': 'headers',
  'frame-protection': 'headers',
  'x-content-type-options': 'headers',
  'referrer-policy': 'headers',
  'permissions-policy': 'headers',
  coop: 'headers',
  cookies: 'headers',
  'info-leak': 'headers',
  'mixed-content': 'page',
  sri: 'page',
  'vulnerable-libs': 'page',
  'form-http': 'page',
  caa: 'dns-email',
  dnssec: 'dns-email',
  mx: 'dns-email',
  spf: 'dns-email',
  dmarc: 'dns-email',
  dkim: 'dns-email',
  'mta-sts': 'dns-email',
  'tls-rpt': 'dns-email',
  'security-txt': 'security-txt',
} as const satisfies Record<string, CheckGroup>;

export type CheckId = keyof typeof CHECK_GROUP;

/** What a check found, kept in the result and filled into the texts. */
export type CheckValue = string | number | boolean | null | string[];

export interface CheckResult {
  id: CheckId;
  status: CheckStatus;
  values: Record<string, CheckValue>;
}
