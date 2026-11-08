import { disposableEmailBlocklistSet } from 'disposable-email-domains-js';

/** The community list of disposable email domains (architecture 4.3), loaded once. */
const DOMAINS = disposableEmailBlocklistSet();

/**
 * Whether the address is on a disposable email service: its domain, or any domain it is under
 * (`x.mailinator.com` is under `mailinator.com`), is on the list.
 */
export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  const labels = email
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
    .split('.');
  for (let start = 0; start < labels.length - 1; start += 1) {
    if (DOMAINS.has(labels.slice(start).join('.'))) return true;
  }
  return false;
}

/** The field error the API answers for a disposable address (400). */
export const DISPOSABLE_EMAIL_ERROR = { path: 'email', message: 'disposable' } as const;
