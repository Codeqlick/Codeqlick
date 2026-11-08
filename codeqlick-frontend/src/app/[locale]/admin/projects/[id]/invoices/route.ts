import { hasLocale } from 'next-intl';
import { revalidatePath } from 'next/cache';
import { routing } from '@/i18n/routing';
import { adminUploadInvoice, MAX_INVOICE_BYTES } from '@/lib/api/invoices';
import { redirectTo } from '@/lib/redirect';

/** What the page shows after the upload (`?invoices=`). */
export type InvoiceUploadOutcome =
  'uploaded' | 'tooLarge' | 'notPdf' | 'numberTaken' | 'invalid' | 'failed';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Room for the multipart boundaries, headers and the other fields around the PDF. */
const MULTIPART_OVERHEAD = 64 * 1024;

/**
 * Uploads a team invoice (the PDF and its number, dates and amount) from a plain form, streaming
 * it to `POST /v1/admin/projects/:id/invoices`, then goes back to the project's invoices.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ locale: string; id: string }> },
) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale) || !UUID.test(id)) {
    return new Response('Not found', { status: 404 });
  }
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!origin || !host || new URL(origin).host !== host) {
    return new Response('Forbidden', { status: 403 });
  }

  const page = `/${locale}/admin/projects/${id}`;
  const reply = (outcome: InvoiceUploadOutcome) => {
    if (outcome === 'uploaded') revalidatePath(page);
    return redirectTo(`${page}?invoices=${outcome}#invoices`, 303);
  };

  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_INVOICE_BYTES + MULTIPART_OVERHEAD) return reply('tooLarge');
  const contentType = request.headers.get('content-type') ?? '';
  if (!request.body || !contentType.startsWith('multipart/form-data')) return reply('failed');

  let response: Response | undefined;
  try {
    response = await adminUploadInvoice(id, request.body, contentType);
  } catch {
    return reply('failed');
  }
  if (!response) return redirectTo(`/${locale}/login?next=${encodeURIComponent(page)}`, 303);
  const problem = (await response.json().catch(() => ({}))) as { detail?: unknown };

  if (response.ok) return reply('uploaded');
  if (response.status === 401 || response.status === 403) {
    return redirectTo(`/${locale}/login?next=${encodeURIComponent(page)}`, 303);
  }
  if (response.status === 413) return reply('tooLarge');
  if (response.status === 409) return reply('numberTaken');
  if (response.status === 400) {
    return reply(problem.detail === 'The invoice must be a PDF' ? 'notPdf' : 'invalid');
  }
  return reply('failed');
}
