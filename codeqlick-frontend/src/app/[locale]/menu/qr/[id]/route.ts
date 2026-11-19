import { type NextRequest } from 'next/server';
import { isApiError } from '@/lib/api/errors';
import { fetchMenuQr } from '@/lib/api/menus';

/**
 * The owner's QR code as an SVG, drawn by the API and passed through here: the browser never
 * calls the API. `?download=1` saves it as a file.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let svg: string | null;
  try {
    svg = await fetchMenuQr(id);
  } catch (error) {
    const status = isApiError(error) && [401, 403].includes(error.status) ? error.status : 502;
    return new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!svg) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const headers: Record<string, string> = {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    // An SVG opened on its own runs no script.
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
  };
  if (request.nextUrl.searchParams.get('download') === '1') {
    headers['Content-Disposition'] = 'attachment; filename="menu-qr.svg"';
  }
  return new Response(svg, { headers });
}
