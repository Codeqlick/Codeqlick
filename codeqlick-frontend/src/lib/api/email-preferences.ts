import 'server-only';
import type { EmailPreferences } from '@/lib/email-preferences';
import { apiFetch } from './client';

/**
 * The optional email an unsubscribe link is about (no session: the token is the proof). Changes
 * nothing. Sends the visitor's IP, since the API limits these calls per IP.
 */
export function getEmailPreferences(token: string) {
  return apiFetch<EmailPreferences>('/email/preferences', {
    query: { token },
    cache: 'no-store',
    forwardClientIp: true,
  });
}

/** The unsubscribe page's buttons: turns that email off (`false`) or back on (`true`). */
export function updateEmailPreferences(input: { token: string; subscribed: boolean }) {
  return apiFetch<EmailPreferences>('/email/preferences', {
    method: 'PUT',
    body: input,
    forwardClientIp: true,
  });
}
