import { NextResponse } from 'next/server';
import { listCruisingSpots } from '@/lib/api/cruising';
import { isApiError } from '@/lib/api/errors';
import { parseBbox, parseMinRating, spotTypeFilter } from '@/lib/cruising';

/**
 * The spots in the map's view, for the map (a BFF: the browser never calls the API). Public, no
 * session; the box is checked here and again by the API. The device's position is never part of
 * this request: the map only asks for the area it shows.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const box = parseBbox(searchParams.get('bbox'));
  if (!box) return NextResponse.json({ error: 'invalid bbox' }, { status: 400 });
  try {
    const result = await listCruisingSpots(
      box,
      spotTypeFilter(searchParams.get('type')),
      parseMinRating(searchParams.get('minRating')),
    );
    return NextResponse.json(result, { headers: { 'Cache-Control': 'public, max-age=60' } });
  } catch (error) {
    const status = isApiError(error) && error.status === 429 ? 429 : 502;
    return NextResponse.json({ error: 'unavailable' }, { status });
  }
}
