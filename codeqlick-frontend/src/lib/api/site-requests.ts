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
    wishes?: string;
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

/** Buying the preview online (architecture 8.2, decision 20); null while it is off. */
export type PurchaseOffer = {
  /** Before VAT. */
  priceCents: number;
  vatPercent: number;
  /** What is charged, VAT included. */
  totalCents: number;
  currency: 'eur';
  available: boolean;
};

export type PreviewInfo = {
  status: PreviewStatus;
  url: string;
  business: string | null;
  purchase: PurchaseOffer | null;
};

/** Whether a request's preview is online yet; null when there is no such preview. */
export async function getPreviewStatus(slug: string): Promise<PreviewInfo | null> {
  try {
    return await apiFetch<PreviewInfo>(`/site-requests/previews/${encodeURIComponent(slug)}`, {
      forwardClientIp: true,
    });
  } catch (error) {
    if (isApiError(error) && error.status === 404) return null;
    throw error;
  }
}

/** The Stripe Checkout address to pay the preview's website. */
export function createCheckout(slug: string, locale: 'en' | 'es') {
  return apiFetch<{ url: string }>(`/site-requests/previews/${encodeURIComponent(slug)}/checkout`, {
    method: 'POST',
    body: { locale, accept: true },
    forwardClientIp: true,
  });
}

export type PurchaseProgress = {
  status: 'PENDING' | 'PAID' | 'EXPIRED';
  business: string | null;
  siteUrl: string | null;
  /** Paid, but the team is finishing the website. */
  delayed: boolean;
};

/** How a purchase is going (the page Stripe returns to); null when unknown. */
export async function getPurchase(sessionId: string): Promise<PurchaseProgress | null> {
  try {
    return await apiFetch<PurchaseProgress>(
      `/site-requests/purchases/${encodeURIComponent(sessionId)}`,
      { forwardClientIp: true },
    );
  } catch (error) {
    if (isApiError(error) && error.status === 404) return null;
    throw error;
  }
}
