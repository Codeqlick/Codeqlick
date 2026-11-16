import { fetchCruisingFile } from '@/lib/api/cruising';
import { isMediaId } from '@/lib/cruising-media';

/** A video's poster (a still image), for the signed-in member (`GET /cruising/media/:id/poster`). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isMediaId(id)) return new Response(null, { status: 404 });
  return fetchCruisingFile(`/cruising/media/${id}/poster`, request);
}
