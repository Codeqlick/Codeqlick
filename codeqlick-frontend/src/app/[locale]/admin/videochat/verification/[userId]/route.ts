import { fetchSwipeImage } from '@/lib/api/swipe';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A video chat member's verification photo, for the team (admins only, API-side). */
export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!UUID.test(userId)) return new Response(null, { status: 404 });
  return fetchSwipeImage(`/admin/videochat/verifications/${userId}/file`);
}
