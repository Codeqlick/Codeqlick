import { fetchSwipeImage } from '@/lib/api/swipe';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Images for Swipe's moderation: a photo, or a member's verification photo (admins only, API-side). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;
  if (!UUID.test(id)) return new Response(null, { status: 404 });
  if (kind === 'photo') return fetchSwipeImage(`/swipe/photos/${id}/file`);
  if (kind === 'verification') return fetchSwipeImage(`/admin/swipe/verifications/${id}/file`);
  return new Response(null, { status: 404 });
}
