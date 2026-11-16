import { streamCruisingUpload } from '@/lib/api/cruising';
import { MAX_VIDEO_BYTES, sameOrigin } from '@/lib/cruising-media';

export const dynamic = 'force-dynamic';

/** Room for the multipart envelope and the consent field around a 100 MB video. */
const MAX_BODY_BYTES = MAX_VIDEO_BYTES + 1024 * 1024;

/**
 * A video upload (`POST /cruising/media`), streamed to the API as it arrives: the body is never
 * held in memory. The browser calls this route by its own address (`/{locale}/cruising/api/media`);
 * `src/proxy.ts` leaves it out of its matcher because it would buffer, and cut, a body this big.
 * With no proxy in front, the route checks that the request comes from this site (the API checks
 * the session by the token). Nginx needs `client_max_body_size 100m` for this path.
 */
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  const host =
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || request.headers.get('host');
  if (!sameOrigin(request.headers.get('origin'), host)) {
    return Response.json({ error: 'forbidden' }, { status: 403, headers });
  }
  if (!(request.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
    return Response.json({ error: 'invalid' }, { status: 400, headers });
  }
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    return Response.json({ error: 'too large' }, { status: 413, headers });
  }
  return streamCruisingUpload(request);
}
