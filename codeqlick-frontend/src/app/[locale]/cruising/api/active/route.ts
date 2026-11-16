import { NextResponse } from 'next/server';
import { listCruisingActive } from '@/lib/api/cruising';
import { isApiError } from '@/lib/api/errors';
import { isGridBbox, parseBbox } from '@/lib/cruising';

const PRIVATE = { 'Cache-Control': 'private, no-store' };

/**
 * The spots of a box of the map with someone there now (a BFF: the browser never calls the API).
 * Private: the API answers only members who have entered. Only whole cells of the map's 0.25° grid
 * are accepted, so no request says where the member is looking from (decision 86).
 */
export async function GET(request: Request) {
  const box = parseBbox(new URL(request.url).searchParams.get('bbox'));
  if (!box || !isGridBbox(box)) {
    return NextResponse.json({ error: 'invalid bbox' }, { status: 400, headers: PRIVATE });
  }
  try {
    const items = await listCruisingActive(box);
    return NextResponse.json({ items }, { headers: PRIVATE });
  } catch (error) {
    const status = isApiError(error) && [401, 403, 429].includes(error.status) ? error.status : 502;
    return NextResponse.json({ error: 'unavailable' }, { status, headers: PRIVATE });
  }
}
