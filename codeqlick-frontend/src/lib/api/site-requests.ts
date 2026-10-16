import 'server-only';
import { apiFetch } from './client';
import { isApiError } from './errors';

export type SiteRequestInput = {
  preset: string;
  business: {
    name: string;
    kind: string;
    city: string;
    address?: string;
    phone?: string;
    whatsapp?: string;
    email?: string;
    hours?: string;
    services?: string;
    about?: string;
  };
  domain?: { name: string; owned: boolean };
  name: string;
  email: string;
  locale: 'en' | 'es';
};

/** The public basic-website request → a lead that keeps it. */
export function createSiteRequest(input: SiteRequestInput) {
  return apiFetch<{ id: string; previewUrl?: string }>('/site-requests', {
    method: 'POST',
    body: input,
    forwardClientIp: true,
  });
}

export type PreviewStatus = 'BUILDING' | 'READY' | 'FAILED' | 'REMOVED';

/** Whether a request's preview is online yet; null when there is no such preview. */
export async function getPreviewStatus(
  slug: string,
): Promise<{ status: PreviewStatus; url: string } | null> {
  try {
    return await apiFetch<{ status: PreviewStatus; url: string }>(
      `/site-requests/previews/${encodeURIComponent(slug)}`,
      { forwardClientIp: true },
    );
  } catch (error) {
    if (isApiError(error) && error.status === 404) return null;
    throw error;
  }
}
