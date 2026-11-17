import { fetchCruisingFile } from '@/lib/api/cruising';
import { isMediaId } from '@/lib/cruising-media';

/**
 * Files for Cruising's moderation (admins only, API-side): a photo or video, its poster, or a
 * member's verification photo. Like the members' route: streamed, `Range` forwarded, not cached.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;
  if (!isMediaId(id)) return new Response(null, { status: 404 });
  if (kind === 'file') return fetchCruisingFile(`/cruising/media/${id}/file`, request);
  if (kind === 'poster') return fetchCruisingFile(`/cruising/media/${id}/poster`, request);
  if (kind === 'verification') {
    return fetchCruisingFile(`/admin/adult/verifications/${id}/file`, request);
  }
  return new Response(null, { status: 404 });
}
