import { dnsChecks } from './checks-dns.js';
import { webChecks } from './checks-web.js';
import type { SecurityInputs } from './security-check-inputs.js';
import type { CheckResult } from './security-check-types.js';

/** Every check of the Security check on what was read (pure: no network). */
export function runChecks(input: SecurityInputs): CheckResult[] {
  return [...webChecks(input), ...dnsChecks(input.dns)];
}
