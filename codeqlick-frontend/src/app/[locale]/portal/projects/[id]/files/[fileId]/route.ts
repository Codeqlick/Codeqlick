import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { downloadProjectFile } from '@/lib/api/projects';
import { redirectTo } from '@/lib/redirect';

/**
 * Downloads a project file, streamed from `GET /v1/portal/projects/:id/files/:fileId`. The API
 * decides who may read it (the project's client, or an admin) and always sends an attachment.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; id: string; fileId: string }> },
) {
  const { locale, id, fileId } = await params;
  if (!hasLocale(routing.locales, locale)) return new Response('Not found', { status: 404 });

  const signIn = () =>
    redirectTo(`/${locale}/login?next=${encodeURIComponent(`/${locale}/portal/projects/${id}`)}`);

  let response: Response | undefined;
  try {
    response = await downloadProjectFile(id, fileId);
  } catch {
    return new Response('The download failed. Please try again.', { status: 502 });
  }
  if (!response) return signIn();
  if (!response.ok || !response.body) {
    // Error bodies are small problem+json documents; reading them frees the connection.
    await response.text().catch(() => undefined);
    if (response.status === 401 || response.status === 403) return signIn();
    if (response.status === 400 || response.status === 404) {
      return new Response('Not found', { status: 404 });
    }
    return new Response('The download failed. Please try again.', { status: 502 });
  }

  const headers = new Headers({
    'Content-Type': 'application/octet-stream',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  for (const name of ['content-disposition', 'content-length']) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(response.body, { headers });
}
