import { type NextRequest } from 'next/server';
import { getPublicMenu } from '@/lib/api/menus';
import { menuLocale } from '@/lib/menu';

/**
 * The short link a printed QR carries (`menu.codeqlick.com/<slug>`, the proxy sends it here): a
 * redirect to the page in the menu's own language, never the visitor's, so a code shows the same
 * thing to everyone. A renamed menu goes on to its new short link; a missing one lands on the
 * page's neutral 404, in the browser's language.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const go = (status: number, location: string) =>
    new Response(null, { status, headers: { Location: location, 'Cache-Control': 'no-store' } });
  try {
    const result = await getPublicMenu(slug);
    if (result.status === 'found') {
      return go(302, `/${menuLocale(result.menu.language)}/${encodeURIComponent(slug)}`);
    }
    if (result.status === 'moved') return go(308, `/${encodeURIComponent(result.slug)}`);
  } catch {
    // The API is down: the page itself says so.
  }
  const accepted = request.headers.get('accept-language')?.toLowerCase() ?? '';
  return go(302, `/${accepted.startsWith('es') ? 'es' : 'en'}/${encodeURIComponent(slug)}`);
}
