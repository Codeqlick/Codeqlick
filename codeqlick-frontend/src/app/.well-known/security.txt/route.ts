import { absoluteUrl } from '@/lib/seo';
import { requestedUrl, securityTxt } from '@/lib/security-txt';
import { CONTACT_EMAIL } from '@/lib/site';

const PATH = '/.well-known/security.txt';

/**
 * security.txt (RFC 9116) on every web host: where to report a vulnerability (architecture 6.2).
 * Its path has a dot, so the proxy leaves it alone on the apps' hosts too; `Canonical` names the
 * host that was asked.
 */
export function GET(request: Request): Response {
  const body = securityTxt({
    contact: CONTACT_EMAIL,
    canonical: requestedUrl(request.headers, PATH) ?? absoluteUrl(PATH),
    policy: absoluteUrl('/en/security'),
  });
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
