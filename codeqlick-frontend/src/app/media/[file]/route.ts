import { MEDIA_FILENAME } from '@/lib/api/media';
import { env } from '@/lib/env';

/**
 * Serves images uploaded from the admin panel at /media/<file>. The files live in the API; the
 * browser never calls it (BFF), so this handler fetches them server-side and passes them on.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!MEDIA_FILENAME.test(file)) return new Response('Not found', { status: 404 });

  let upstream: Response;
  try {
    upstream = await fetch(`${env.API_URL}/media/${file}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return new Response('Image temporarily unavailable', { status: 503 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response('Not found', { status: upstream.status === 404 ? 404 : 502 });
  }

  const headers = new Headers({
    'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
    // File names are random and never reused.
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
  const length = upstream.headers.get('content-length');
  if (length) headers.set('Content-Length', length);
  return new Response(upstream.body, { headers });
}
