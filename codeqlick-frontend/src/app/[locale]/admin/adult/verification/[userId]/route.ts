import { fetchSwipeImage } from '@/lib/api/swipe';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A person's shared 18+ verification photo (pending, or the kept approved one), for the team
 * (admins only, API-side). The browser never calls the API: this is the BFF.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!UUID.test(userId)) return new Response(null, { status: 404 });
  return fetchSwipeImage(`/admin/adult/verifications/${userId}/file`);
}
