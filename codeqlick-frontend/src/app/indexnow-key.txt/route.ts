import { getIndexNowKey } from '@/lib/api/indexnow';

/**
 * The IndexNow key file (architecture 6, 4.1 IndexNow): the key as plain text, named as
 * `keyLocation` in the API's submissions. 404 while the API has IndexNow off or can't be reached.
 */
export async function GET(): Promise<Response> {
  const key = await getIndexNowKey().catch(() => null);
  if (!key) {
    return new Response('Not found\n', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  return new Response(`${key}\n`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
