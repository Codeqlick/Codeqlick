import { hasLocale } from 'next-intl';
import { SITE_LOCALES } from '@/i18n/routing';
import { createCloudCommentSession, listCloudProjects } from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import { isCommentPath, isDeploymentId } from '@/lib/cloud';
import { redirectTo } from '@/lib/redirect';

type Params = { locale: string; team: string; project: string };

const notFound = () => new Response('Not found', { status: 404 });

/**
 * Opens a deployment's comments page (`?deployment=<id>&path=</page>`) for the signed-in member
 * (architecture 4.13 "Preview comments"): the API answers the page's address with a 2-hour token
 * in its fragment (through the members' ticket when previews are protected), and this redirects
 * there. The console links it with `target="_blank"`, so it opens in a new tab; the session stays
 * in the console's httpOnly cookies and only that address reaches the browser.
 */
export async function GET(request: Request, { params }: { params: Promise<Params> }) {
  const { locale, team, project: slug } = await params;
  const query = new URL(request.url).searchParams;
  const deploymentId = query.get('deployment') ?? '';
  const path = query.get('path') ?? '';
  if (!hasLocale(SITE_LOCALES, locale) || !isDeploymentId(deploymentId)) return notFound();
  if (path && !isCommentPath(path)) return notFound();
  let url: string;
  try {
    const project = (await listCloudProjects(team)).items.find((item) => item.slug === slug);
    if (!project) return notFound();
    url = (await createCloudCommentSession(project.id, { deploymentId, ...(path ? { path } : {}) }))
      .url;
  } catch (error) {
    if (isApiError(error) && error.status === 401) return redirectTo(`/${locale}/login`);
    if (isApiError(error) && (error.status === 400 || error.status === 404)) return notFound();
    if (isApiError(error) && error.status === 403) {
      return new Response("Comments can't be opened for this project.", { status: 403 });
    }
    return new Response("The comments couldn't be opened. Please try again.", { status: 502 });
  }
  // Only ever to a hosting address over HTTPS.
  if (!/^https:\/\/[a-z0-9.-]+\/__codeqlick\//.test(url)) return notFound();
  return new Response(null, {
    status: 302,
    headers: { Location: url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}
