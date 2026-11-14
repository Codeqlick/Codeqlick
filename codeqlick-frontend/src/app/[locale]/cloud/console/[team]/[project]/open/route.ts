import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { getCloudProtectionTicket, listCloudProjects } from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import { isAddressHost } from '@/lib/cloud';
import { redirectTo } from '@/lib/redirect';

type Params = { locale: string; team: string; project: string };

const notFound = () => new Response('Not found', { status: 404 });

/**
 * Opens one of the project's addresses (`?host=`) for a team member (architecture 4.13, Password
 * protection): the API gives a one-use ticket link when the address asks for the password, or the
 * plain address when it doesn't, and this redirects there.
 */
export async function GET(request: Request, { params }: { params: Promise<Params> }) {
  const { locale, team, project: slug } = await params;
  const host = (new URL(request.url).searchParams.get('host') ?? '').toLowerCase();
  if (!hasLocale(routing.locales, locale) || !isAddressHost(host)) return notFound();
  let url: string;
  try {
    const project = (await listCloudProjects(team)).items.find((item) => item.slug === slug);
    if (!project) return notFound();
    url = (await getCloudProtectionTicket(project.id, host)).url;
  } catch (error) {
    if (isApiError(error) && error.status === 401) return redirectTo(`/${locale}/login`);
    if (isApiError(error) && (error.status === 400 || error.status === 404)) return notFound();
    return new Response("The address couldn't be opened. Please try again.", { status: 502 });
  }
  // Only ever to the address that was asked for, over HTTPS.
  if (!url.startsWith(`https://${host}/`)) return notFound();
  return new Response(null, {
    status: 302,
    headers: { Location: url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}
