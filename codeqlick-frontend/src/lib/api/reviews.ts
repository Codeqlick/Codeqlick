import 'server-only';
import { apiFetch } from './client';
import { PUBLIC_REVALIDATE } from './posts';
import type { ClientReview, PublicReview } from './types';

/** Published reviews written in `locale`; [] when the API is unreachable (the home page goes on). */
export async function listPublishedReviews(
  locale: 'en' | 'es',
  limit = 3,
): Promise<PublicReview[]> {
  try {
    return await apiFetch<PublicReview[]>('/reviews', {
      query: { locale, limit },
      revalidate: PUBLIC_REVALIDATE,
    });
  } catch {
    return [];
  }
}

const path = (scope: 'portal' | 'admin', projectId: string) =>
  `/${scope}/projects/${encodeURIComponent(projectId)}/review`;

export function getMyReview(projectId: string) {
  return apiFetch<ClientReview>(path('portal', projectId), { auth: 'required' });
}

export function submitReview(
  projectId: string,
  input: {
    rating: number;
    quote: string;
    authorName: string;
    authorRole?: string;
    consent: boolean;
    locale: 'en' | 'es';
  },
) {
  return apiFetch<ClientReview>(path('portal', projectId), {
    method: 'PUT',
    body: input,
    auth: 'required',
  });
}

export function adminGetReview(projectId: string) {
  return apiFetch<ClientReview>(path('admin', projectId), { auth: 'required' });
}

export function adminRequestReview(projectId: string) {
  return apiFetch<ClientReview>(`${path('admin', projectId)}/request`, {
    method: 'POST',
    auth: 'required',
  });
}

export function adminSetReviewStatus(projectId: string, status: 'PUBLISHED' | 'HIDDEN') {
  return apiFetch<ClientReview>(`${path('admin', projectId)}/status`, {
    method: 'PUT',
    body: { status },
    auth: 'required',
  });
}
