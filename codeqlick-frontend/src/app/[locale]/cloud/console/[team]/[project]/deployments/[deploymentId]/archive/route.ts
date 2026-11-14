import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { downloadCloudDeployment, listCloudProjects } from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import { redirectTo } from '@/lib/redirect';

type Params = { locale: string; team: string; project: string; deploymentId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A deployment's files as `tar.gz` (architecture 4.13, Download), through the BFF. The API builds
 * the archive while it sends it, so its body is piped to the browser without being buffered.
 */
export async function GET(_request: Request, { params }: { params: Promise<Params> }) {
  const { locale, team, project: slug, deploymentId } = await params;
  if (!hasLocale(routing.locales, locale) || !UUID.test(deploymentId)) {
    return new Response('Not found', { status: 404 });
  }
  const signIn = () => redirectTo(`/${locale}/login`);

  let response: Response | undefined;
  try {
    const project = (await listCloudProjects(team)).items.find((item) => item.slug === slug);
    if (!project) return new Response('Not found', { status: 404 });
    response = await downloadCloudDeployment(project.id, deploymentId);
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
    if (response.status === 429) {
      return new Response('Too many downloads. Please try again in an hour.', { status: 429 });
    }
    return new Response('The download failed. Please try again.', { status: 502 });
  }

  return new Response(response.body, {
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'application/gzip',
      'Content-Disposition':
        response.headers.get('content-disposition') ?? `attachment; filename="${slug}.tar.gz"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
