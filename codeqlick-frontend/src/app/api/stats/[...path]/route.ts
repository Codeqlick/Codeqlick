import { env } from '@/lib/env';

/*
 * Same-origin proxy to Umami, so the tracker needs no third-party origin (the CSP allows
 * scripts and connections from the site only) and Umami itself stays private. Only the two
 * paths the tracker uses get through.
 */

const PATHS: Record<string, 'GET' | 'POST'> = { 'script.js': 'GET', 'api/send': 'POST' };

type Context = { params: Promise<{ path: string[] }> };

async function forward(request: Request, { params }: Context): Promise<Response> {
  const path = (await params).path.join('/');
  if (!env.UMAMI_URL || PATHS[path] !== request.method) return new Response(null, { status: 404 });

  const headers = new Headers();
  for (const name of ['user-agent', 'accept-language', 'content-type']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Umami counts unique visitors and countries from the visitor's IP (Nginx sets X-Real-IP).
  const ip = request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for');
  if (ip) headers.set('x-forwarded-for', ip);

  let response: Response;
  try {
    response = await fetch(`${env.UMAMI_URL}/${path}`, {
      method: request.method,
      headers,
      body: request.method === 'POST' ? await request.text() : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Analytics must never break a page: an unreachable Umami is just no data.
    return new Response(null, { status: 204 });
  }

  const out = new Headers({ 'Content-Type': response.headers.get('content-type') ?? 'text/plain' });
  out.set('Cache-Control', path === 'script.js' ? 'public, max-age=3600' : 'no-store');
  return new Response(response.body, { status: response.status, headers: out });
}

export const GET = forward;
export const POST = forward;
