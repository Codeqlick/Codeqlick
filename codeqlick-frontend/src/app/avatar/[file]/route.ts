import { env } from '@/lib/env';
import { AVATAR_FILE } from '@/lib/avatar';

/**
 * Serves profile photos at /avatar/<file> on every host (architecture 6, "One profile"). The files
 * live in the API; the browser never calls it (BFF), so this handler fetches them server-side.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!AVATAR_FILE.test(file)) return new Response('Not found', { status: 404 });

  let upstream: Response;
  try {
    upstream = await fetch(`${env.API_URL}/avatars/${file}`, {
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
    'Content-Type': 'image/webp',
    // File names are random and never reused: a new photo gets a new name.
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
  const length = upstream.headers.get('content-length');
  if (length) headers.set('Content-Length', length);
  return new Response(upstream.body, { headers });
}
