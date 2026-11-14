import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { downloadCloudBuildLog, listCloudProjects } from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import { redirectTo } from '@/lib/redirect';

type Params = { locale: string; team: string; project: string; number: string };

/**
 * A build's whole log as a text file (architecture 4.13, Download log), through the BFF: the
 * browser never calls the API. The API's body is piped to the browser without being buffered.
 */
export async function GET(_request: Request, { params }: { params: Promise<Params> }) {
  const { locale, team, project: slug, number: rawNumber } = await params;
  const number = Number(rawNumber);
  if (!hasLocale(routing.locales, locale) || !Number.isInteger(number) || number < 1) {
    return new Response('Not found', { status: 404 });
  }
  const signIn = () => redirectTo(`/${locale}/login`);

  let response: Response | undefined;
  try {
    const project = (await listCloudProjects(team)).items.find((item) => item.slug === slug);
    if (!project) return new Response('Not found', { status: 404 });
    response = await downloadCloudBuildLog(project.id, number);
  } catch (error) {
    if (isApiError(error) && error.status === 401) return signIn();
    if (isApiError(error) && (error.status === 403 || error.status === 404)) {
      return new Response('Not found', { status: 404 });
    }
    return new Response('The download failed. Please try again.', { status: 502 });
  }
  if (!response) return signIn();
  if (!response.ok || !response.body) {
    // Error bodies are small problem+json documents; reading them frees the connection.
    await response.text().catch(() => undefined);
    if (response.status === 401) return signIn();
    if (response.status === 403 || response.status === 404) {
      return new Response('Not found', { status: 404 });
    }
    return new Response('The download failed. Please try again.', { status: 502 });
  }

  return new Response(response.body, {
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'text/plain; charset=utf-8',
      'Content-Disposition':
        response.headers.get('content-disposition') ??
        `attachment; filename="${slug}-build-${number}.log"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
