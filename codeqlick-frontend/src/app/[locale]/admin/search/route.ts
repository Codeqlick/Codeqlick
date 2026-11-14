import { hasLocale } from 'next-intl';
import { NextResponse } from 'next/server';
import { routing } from '@/i18n/routing';
import { adminSearchQuery } from '@/lib/admin-search';
import { isApiError } from '@/lib/api/errors';
import { adminSearch } from '@/lib/api/search';

/** Search results belong to one admin at one moment: never stored by the browser or a proxy. */
const NO_STORE = { 'Cache-Control': 'no-store' };

function failure(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

/**
 * The admin search's BFF route (architecture 6.2, "Admin search"): `GET /<locale>/admin/search?q=`
 * answers the API's `AdminSearch`, or `{ error }` with 400, 401 (session gone), 429 or 502. The
 * proxy has already refreshed the session for this /admin path; the API checks the ADMIN role.
 * The request's signal reaches the API call, so a search the browser aborts stops there too.
 */
export async function GET(request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return new Response('Not found', { status: 404 });

  const q = adminSearchQuery(new URL(request.url).searchParams.get('q'));
  if (q === null) return failure('invalid_query', 400);

  try {
    const result = await adminSearch(q, locale, request.signal);
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    if (isApiError(error)) {
      if (error.status === 401 || error.status === 403) return failure('unauthorized', 401);
      if (error.status === 429) return failure('rate_limited', 429);
    }
    return failure('failed', 502);
  }
}
