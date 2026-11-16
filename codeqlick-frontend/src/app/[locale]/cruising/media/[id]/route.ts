import { fetchCruisingFile } from '@/lib/api/cruising';
import { isMediaId } from '@/lib/cruising-media';

/**
 * A member's photo or video for the signed-in member (`GET /cruising/media/:id/file`). The API
 * decides who may see it; the browser never calls the API (BFF). The `Range` header goes along, so
 * a video can seek. Never cached, never indexed.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isMediaId(id)) return new Response(null, { status: 404 });
  return fetchCruisingFile(`/cruising/media/${id}/file`, request);
}
