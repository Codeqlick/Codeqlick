import { hasLocale } from 'next-intl';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { routing } from '@/i18n/routing';
import { adminUploadProjectFile, MAX_PROJECT_FILE_BYTES } from '@/lib/api/projects';
import { redirectTo } from '@/lib/redirect';

/** What the upload form gets back: JSON for the script, `?files=` on the page without one. */
type UploadOutcome = 'uploaded' | 'tooLarge' | 'failed' | 'signedOut';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Room for the multipart boundaries and headers around the file itself. */
const MULTIPART_OVERHEAD = 64 * 1024;

/**
 * Uploads one project file. A route handler rather than a Server Action because those buffer the
 * whole body (and cap it at 6 MB); here the body is streamed to `POST /v1/admin/projects/:id/files`,
 * where the API checks the ADMIN role and the 25 MB limit.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ locale: string; id: string }> },
) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale) || !UUID.test(id)) {
    return new Response('Not found', { status: 404 });
  }

  // The session cookies are SameSite=Lax, which already keeps other sites' forms out; checking
  // the origin as well costs nothing.
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!origin || !host || new URL(origin).host !== host) {
    return new Response('Forbidden', { status: 403 });
  }

  const wantsJson = request.headers.get('accept')?.includes('application/json') ?? false;
  const reply = (outcome: UploadOutcome, status: number) => {
    if (outcome === 'uploaded') revalidatePath(`/${locale}/admin/projects/${id}`);
    if (wantsJson) return NextResponse.json({ outcome }, { status });
    const target =
      outcome === 'signedOut'
        ? `/${locale}/login?next=${encodeURIComponent(`/${locale}/admin/projects/${id}`)}`
        : `/${locale}/admin/projects/${id}?files=${outcome}#files`;
    // 303: the browser follows it with a GET.
    return redirectTo(target, 303);
  };

  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_PROJECT_FILE_BYTES + MULTIPART_OVERHEAD) return reply('tooLarge', 413);

  const contentType = request.headers.get('content-type') ?? '';
  if (!request.body || !contentType.startsWith('multipart/form-data')) return reply('failed', 400);

  let response: Response | undefined;
  try {
    response = await adminUploadProjectFile(id, request.body, contentType);
  } catch {
    return reply('failed', 502);
  }
  if (!response) return reply('signedOut', 401);
  // The API answers with a small JSON document; reading it frees the connection (cancelling the
  // stream instead can leave the request hanging).
  await response.text().catch(() => undefined);

  if (response.ok) return reply('uploaded', 201);
  if (response.status === 413) return reply('tooLarge', 413);
  if (response.status === 401 || response.status === 403) return reply('signedOut', 401);
  return reply('failed', response.status >= 500 ? 502 : response.status);
}
