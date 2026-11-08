import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { downloadInvoice } from '@/lib/api/invoices';
import { redirectTo } from '@/lib/redirect';

/**
 * Downloads a team invoice's PDF, streamed from `GET /v1/portal/invoices/:id/file`. The API
 * decides who may read it (the project's client, or an admin).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; id: string }> },
) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) return new Response('Not found', { status: 404 });

  const signIn = () =>
    redirectTo(`/${locale}/login?next=${encodeURIComponent(`/${locale}/portal/invoices`)}`);

  let response: Response | undefined;
  try {
    response = await downloadInvoice(id);
  } catch {
    return new Response('The download failed. Please try again.', { status: 502 });
  }
  if (!response) return signIn();
  if (!response.ok || !response.body) {
    await response.text().catch(() => undefined);
    if (response.status === 401 || response.status === 403) return signIn();
    if (response.status === 400 || response.status === 404) {
      return new Response('Not found', { status: 404 });
    }
    return new Response('The download failed. Please try again.', { status: 502 });
  }

  const headers = new Headers({
    'Content-Type': 'application/pdf',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  for (const name of ['content-disposition', 'content-length']) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(response.body, { headers });
}
