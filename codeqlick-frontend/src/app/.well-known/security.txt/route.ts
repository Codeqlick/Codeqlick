import { absoluteUrl } from '@/lib/seo';
import { CONTACT_EMAIL } from '@/lib/site';

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * security.txt (RFC 9116) on every web host: where to report a vulnerability. `Expires` is always a
 * year ahead, so the file never goes stale; `Canonical` names the host that was asked.
 */
export function GET(request: Request): Response {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  const canonical = host
    ? `${proto}://${host}/.well-known/security.txt`
    : absoluteUrl('/.well-known/security.txt');
  const body = [
    `Contact: mailto:${CONTACT_EMAIL}`,
    `Expires: ${new Date(Date.now() + YEAR_MS).toISOString().replace(/\.\d{3}Z$/, 'Z')}`,
    'Preferred-Languages: es, en',
    `Canonical: ${canonical}`,
    `Policy: ${absoluteUrl('/es/security')}`,
    '',
  ].join('\n');
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
