import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { exportCloudEvents } from '@/lib/api/cloud';
import { cloudEventFilters } from '@/lib/cloud';
import { redirectTo } from '@/lib/redirect';

type Params = { locale: string; team: string };

/**
 * A team's events as CSV (architecture 4.13, Exporting events), streamed through the BFF from
 * `GET /v1/cloud/teams/:team/events.csv` with the Events page's filters. The API checks the role.
 */
export async function GET(request: Request, { params }: { params: Promise<Params> }) {
  const { locale, team } = await params;
  if (!hasLocale(routing.locales, locale)) return new Response('Not found', { status: 404 });

  const filters = cloudEventFilters(Object.fromEntries(new URL(request.url).searchParams));
  const signIn = () =>
    redirectTo(
      `/${locale}/login?next=${encodeURIComponent(`/${locale}/cloud/console/${team}/events`)}`,
    );

  let response: Response | undefined;
  try {
    response = await exportCloudEvents(team, filters, request.headers);
  } catch {
    return new Response('The export failed. Please try again.', { status: 502 });
  }
  if (!response) return signIn();
  if (!response.ok || !response.body) {
    // Error bodies are small problem+json documents; reading them frees the connection.
    await response.text().catch(() => undefined);
    if (response.status === 401) return signIn();
    if (response.status === 400) {
      return new Response(
        'The filters are not valid: dates at most 365 days apart, and an action such as domain.added.',
        {
          status: 400,
          headers: { 'Cache-Control': 'private, no-store' },
        },
      );
    }
    if (response.status === 403 || response.status === 404) {
      return new Response('Not found', { status: 404 });
    }
    if (response.status === 429) {
      return new Response('Too many exports. Please try again in an hour.', {
        status: 429,
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }
    return new Response('The export failed. Please try again.', { status: 502 });
  }

  const headers = new Headers({
    'Content-Type': response.headers.get('content-type') ?? 'text/csv; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  const disposition = response.headers.get('content-disposition');
  const fallback = `attachment; filename="${team.replace(/[^a-z0-9-]/g, '')}-events.csv"`;
  headers.set('Content-Disposition', disposition ?? fallback);
  return new Response(response.body, { headers });
}
