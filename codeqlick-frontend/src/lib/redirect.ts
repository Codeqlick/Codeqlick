/**
 * Redirect from a route handler to a path on this site. The Location stays relative: behind the
 * container, `request.url` carries the server's own address (http://0.0.0.0:3000), not the
 * public one, so an absolute URL built from it would send the visitor nowhere.
 */
export function redirectTo(path: string, status: 303 | 307 = 307): Response {
  return new Response(null, { status, headers: { Location: path, 'Cache-Control': 'no-store' } });
}
