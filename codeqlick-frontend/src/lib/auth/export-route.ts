import 'server-only';
import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { exportMyData } from '@/lib/api/auth';
import { isApiError } from '@/lib/api/errors';
import { redirectTo } from '@/lib/redirect';

/**
 * "Download my data" (GDPR): the API's JSON export of the signed-in person, as a file. Served
 * under /portal and /admin so the proxy has refreshed the session first.
 */
export async function exportMyDataRoute(
  _request: Request,
  { params }: { params: Promise<{ locale: string }> },
): Promise<Response> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return new Response('Not found', { status: 404 });
  let json: string;
  try {
    json = await exportMyData();
  } catch (error) {
    if (isApiError(error) && error.status === 401) return redirectTo(`/${locale}/login`);
    if (isApiError(error) && error.status === 429) {
      return new Response('Too many downloads: try again in an hour.', { status: 429 });
    }
    return new Response('The download failed. Please try again.', { status: 502 });
  }
  const date = new Date().toISOString().slice(0, 10);
  return new Response(json, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="codeqlick-my-data-${date}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
