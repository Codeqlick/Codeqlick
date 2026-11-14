import 'server-only';
import { apiFetch } from './client';
import type { Locale, NewsletterList, NewsletterStatus } from './types';

/** Blog newsletter (architecture 4.14). Always answers 202, so it never reveals who is subscribed. */
export function subscribeToNewsletter(input: { email: string; locale: Locale }) {
  return apiFetch<void>('/newsletter', {
    method: 'POST',
    body: { ...input, acceptPrivacy: true },
    forwardClientIp: true,
  });
}

/** The emailed link's token: the subscriber becomes active. 400 when unknown or expired. */
export function confirmNewsletter(token: string) {
  return apiFetch<{ email: string; locale: Locale }>('/newsletter/confirm', {
    method: 'POST',
    body: { token },
    forwardClientIp: true,
  });
}

/** One step, no sign-in; also when already unsubscribed. 404 for an unknown token. */
export function unsubscribeFromNewsletter(token: string) {
  return apiFetch<{ email: string }>('/newsletter/unsubscribe', {
    method: 'POST',
    body: { token },
    forwardClientIp: true,
  });
}

export function adminListNewsletter(
  params: { status?: NewsletterStatus; q?: string; page?: number; pageSize?: number } = {},
) {
  return apiFetch<NewsletterList>('/admin/newsletter', {
    auth: 'required',
    query: { status: params.status, q: params.q, page: params.page, pageSize: params.pageSize },
  });
}

export function adminDeleteSubscriber(id: string) {
  return apiFetch<void>(`/admin/newsletter/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}
