import 'server-only';
import { env } from '@/lib/env';
import { apiFetch } from './client';
import { authHeader } from './projects';

export type InvoiceStatus = 'PAID' | 'DUE' | 'OVERDUE';

/** A team invoice (an uploaded PDF) or one Stripe issued for a website bought online. */
export interface Invoice {
  id: string;
  source: 'team' | 'stripe';
  number: string | null;
  issuedOn: string;
  dueOn: string | null;
  amountCents: number;
  currency: string;
  status: InvoiceStatus;
  paidAt: string | null;
  project: { id: string; name: string } | null;
}

/** Largest invoice PDF the API takes. */
export const MAX_INVOICE_BYTES = 10 * 1024 * 1024;

/* Portal. */

export async function listMyInvoices(): Promise<Invoice[]> {
  return (await apiFetch<{ items: Invoice[] }>('/portal/invoices', { auth: 'required' })).items;
}

/** The API's download response for a team invoice's PDF. */
export async function downloadInvoice(id: string): Promise<Response | undefined> {
  const authorization = await authHeader();
  if (!authorization) return undefined;
  return fetch(`${env.API_URL}/portal/invoices/${encodeURIComponent(id)}/file`, {
    headers: { Authorization: authorization },
    cache: 'no-store',
  });
}

/** Where Stripe serves the PDF of a purchase's invoice, asked for at that moment. */
export function stripeInvoicePdf(purchaseId: string) {
  return apiFetch<{ url: string }>(`/portal/invoices/stripe/${encodeURIComponent(purchaseId)}`, {
    auth: 'required',
  });
}

/* Admin. */

export function adminListInvoices(projectId: string) {
  return apiFetch<Invoice[]>(`/admin/projects/${encodeURIComponent(projectId)}/invoices`, {
    auth: 'required',
  });
}

/** Streams the upload form (PDF and fields) to the API; `undefined` when signed out. */
export async function adminUploadInvoice(
  projectId: string,
  body: ReadableStream<Uint8Array>,
  contentType: string,
): Promise<Response | undefined> {
  const authorization = await authHeader();
  if (!authorization) return undefined;
  return fetch(`${env.API_URL}/admin/projects/${encodeURIComponent(projectId)}/invoices`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': contentType,
      Accept: 'application/json, application/problem+json',
    },
    body,
    // Required by Node's fetch for a streamed request body.
    duplex: 'half',
    cache: 'no-store',
    signal: AbortSignal.timeout(5 * 60_000),
  } as RequestInit);
}

export function adminSetInvoicePaid(id: string, paid: boolean) {
  return apiFetch<Invoice>(`/admin/invoices/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { paid },
    auth: 'required',
  });
}

export function adminDeleteInvoice(id: string) {
  return apiFetch<void>(`/admin/invoices/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}
