import { hasLocale } from 'next-intl';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { routing } from '@/i18n/routing';
import { MAX_TICKET_FILE_BYTES, uploadTicketFile } from '@/lib/api/support';
import { redirectTo } from '@/lib/redirect';

/** What the upload form gets back: JSON for the script, `?files=` on the page without one. */
type UploadOutcome = 'uploaded' | 'tooLarge' | 'failed' | 'signedOut';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Room for the multipart boundaries and headers around the file itself. */
const MULTIPART_OVERHEAD = 64 * 1024;

/**
 * Adds a file to a support request, streamed to `POST /v1/portal/tickets/:id/files` (see the
 * project files route for why it isn't a Server Action). The API lets the request's client and
 * admins in; `?from=admin` sends a browser without JavaScript back to the admin page.
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

  const page =
    new URL(request.url).searchParams.get('from') === 'admin'
      ? `/${locale}/admin/support/${id}`
      : `/${locale}/portal/support/${id}`;
  const wantsJson = request.headers.get('accept')?.includes('application/json') ?? false;
  const reply = (outcome: UploadOutcome, status: number) => {
    if (outcome === 'uploaded') {
      revalidatePath(`/${locale}/portal/support/${id}`);
      revalidatePath(`/${locale}/admin/support/${id}`);
    }
    if (wantsJson) return NextResponse.json({ outcome }, { status });
    const target =
      outcome === 'signedOut'
        ? `/${locale}/login?next=${encodeURIComponent(page)}`
        : `${page}?files=${outcome}#files`;
    // 303: the browser follows it with a GET.
    return redirectTo(target, 303);
  };

  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_TICKET_FILE_BYTES + MULTIPART_OVERHEAD) return reply('tooLarge', 413);

  const contentType = request.headers.get('content-type') ?? '';
  if (!request.body || !contentType.startsWith('multipart/form-data')) return reply('failed', 400);

  let response: Response | undefined;
  try {
    response = await uploadTicketFile(id, request.body, contentType);
  } catch {
    return reply('failed', 502);
  }
  if (!response) return reply('signedOut', 401);
  // Reading the small JSON answer frees the connection.
  await response.text().catch(() => undefined);

  if (response.ok) return reply('uploaded', 201);
  if (response.status === 413) return reply('tooLarge', 413);
  if (response.status === 401 || response.status === 403) return reply('signedOut', 401);
  return reply('failed', response.status >= 500 ? 502 : response.status);
}
