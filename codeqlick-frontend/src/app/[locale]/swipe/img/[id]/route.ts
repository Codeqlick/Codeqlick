import { fetchSwipeImage } from '@/lib/api/swipe';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A Swipe photo for the signed-in person (`verification`: their own verification photo). The API
 * decides who may see it; the browser never calls the API (BFF).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id === 'verification') return fetchSwipeImage('/swipe/verification/file');
  if (!UUID.test(id)) return new Response(null, { status: 404 });
  return fetchSwipeImage(`/swipe/photos/${id}/file`);
}
