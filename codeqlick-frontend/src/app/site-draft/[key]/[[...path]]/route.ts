import { env } from '@/lib/env';

/**
 * A draft's preview for the website editor (architecture 8.2), streamed from the public
 * `GET /v1/site-drafts/:key/*` (the key is the secret). Sandboxed: the preview's scripts run in an
 * opaque origin, so they can't reach the portal; they only talk to it through postMessage.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string; path?: string[] }> },
) {
  const { key, path = [] } = await params;
  if (!/^[\w-]{16,64}$/.test(key)) return new Response('Not found', { status: 404 });
  let response: Response;
  try {
    response = await fetch(
      `${env.API_URL}/site-drafts/${key}/${path.map(encodeURIComponent).join('/')}`,
      { cache: 'no-store' },
    );
  } catch {
    return new Response('The preview is not available', { status: 502 });
  }
  if (!response.ok || !response.body) {
    await response.text().catch(() => undefined);
    return new Response('Not found', { status: 404 });
  }
  return new Response(response.body, {
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': 'sandbox allow-scripts',
      'X-Robots-Tag': 'noindex',
      // Its fonts and module scripts are CORS requests from the sandbox's opaque origin.
      'Access-Control-Allow-Origin': '*',
    },
  });
}
