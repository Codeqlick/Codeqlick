import type { CheckId, CheckResult, CheckStatus } from './security-check-types.js';
import { CHECK_GROUP } from './security-check-types.js';

/**
 * Weights of the scored checks (architecture 4.19): HTTPS 30, headers 25, page 15, DNS and email
 * 25, security.txt 5, 100 in all. `cert-expiry` shares `cert-valid`'s weight and `tls-cipher`
 * `tls-version`'s (the worse status of the pair counts); the other checks are not scored.
 */
export const WEIGHTS: Partial<Record<CheckId, number>> = {
  'https-available': 8,
  'cert-valid': 8,
  'http-redirect': 4,
  hsts: 4,
  'tls-version': 3,
  'tls-legacy': 3,
  'csp-present': 6,
  'csp-enforced': 3,
  'csp-weak': 3,
  'frame-protection': 3,
  'x-content-type-options': 3,
  'referrer-policy': 2,
  'permissions-policy': 2,
  cookies: 3,
  'mixed-content': 5,
  'vulnerable-libs': 5,
  sri: 3,
  'form-http': 2,
  spf: 6,
  dmarc: 6,
  dnssec: 3,
  caa: 2,
  mx: 2,
  'mta-sts': 3,
  dkim: 3,
  'security-txt': 5,
};

/** Checks that count under another check's weight. */
const PAIRED: Partial<Record<CheckId, CheckId>> = {
  'cert-expiry': 'cert-valid',
  'tls-cipher': 'tls-version',
};

const EARNED: Record<CheckStatus, number | null> = { pass: 1, warn: 0.5, fail: 0, info: null };
const SEVERITY: Record<CheckStatus, number> = { fail: 0, warn: 1, pass: 2, info: 3 };

export type Grade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** The check's status, or the worse one of it and the check that shares its weight. */
function effectiveStatuses(checks: CheckResult[]): Map<CheckId, CheckStatus> {
  const statuses = new Map<CheckId, CheckStatus>();
  for (const check of checks) {
    const key = PAIRED[check.id] ?? check.id;
    const current = statuses.get(key);
    // `info` yields to a real status: a pair with one unknown half counts by the known one.
    if (
      current === undefined ||
      current === 'info' ||
      (check.status !== 'info' && SEVERITY[check.status] < SEVERITY[current])
    ) {
      statuses.set(key, check.status);
    }
  }
  return statuses;
}

/** The score (earned share of the weights, 0–100) of a set of checks. */
export function scoreOf(checks: CheckResult[]): number {
  let earned = 0;
  let total = 0;
  for (const [id, status] of effectiveStatuses(checks)) {
    const weight = WEIGHTS[id];
    const share = EARNED[status];
    if (weight === undefined || share === null) continue;
    earned += weight * share;
    total += weight;
  }
  return total === 0 ? 0 : Math.round((earned / total) * 100);
}

const CAP_D: readonly CheckId[] = ['cert-valid', 'https-available', 'form-http'];

/** A+ ≥ 97 with no warn or fail among HTTPS and headers, A ≥ 90, B ≥ 80, C ≥ 65, D ≥ 50, E ≥ 35. */
export function gradeOf(score: number, checks: CheckResult[]): Grade {
  let grade: Grade;
  if (score >= 97) {
    const clean = checks
      .filter((check) => CHECK_GROUP[check.id] === 'https' || CHECK_GROUP[check.id] === 'headers')
      .every((check) => check.status !== 'warn' && check.status !== 'fail');
    grade = clean ? 'A+' : 'A';
  } else if (score >= 90) grade = 'A';
  else if (score >= 80) grade = 'B';
  else if (score >= 65) grade = 'C';
  else if (score >= 50) grade = 'D';
  else if (score >= 35) grade = 'E';
  else grade = 'F';

  const capped = checks.some((check) => CAP_D.includes(check.id) && check.status === 'fail');
  if (capped && ['A+', 'A', 'B', 'C'].includes(grade)) return 'D';
  return grade;
}

export function gradeChecks(checks: CheckResult[]): { score: number; grade: Grade } {
  const score = scoreOf(checks);
  return { score, grade: gradeOf(score, checks) };
}
