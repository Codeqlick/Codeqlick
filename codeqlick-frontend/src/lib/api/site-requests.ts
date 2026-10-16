import 'server-only';
import { apiFetch } from './client';

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
