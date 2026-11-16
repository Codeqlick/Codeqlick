import { NextResponse } from 'next/server';
import { getCruisingRoom } from '@/lib/api/cruising-rooms';
import { isApiError } from '@/lib/api/errors';
import { isRoomPath, roomProxiedStatus } from '@/lib/cruising-rooms';

/** How far back each poll looks again, so no message falls between two polls. */
const OVERLAP_MS = 5000;

/**
 * The messages of a city room newer than `?after=` (an ISO time) and my posting state, for the
 * open room, which asks every 5 seconds (a BFF: the browser never calls the API). Private: the
 * API decides whether the member may read the room.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ country: string; city: string }> },
) {
  const { country, city } = await params;
  if (!isRoomPath(country, city)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const after = new URL(request.url).searchParams.get('after');
  if (after !== null && Number.isNaN(Date.parse(after))) {
    return NextResponse.json({ error: 'invalid after' }, { status: 400 });
  }
  // Ask a few seconds back; the room drops the messages it already has (by id).
  const since = after === null ? undefined : new Date(Date.parse(after) - OVERLAP_MS).toISOString();
  try {
    const snapshot = await getCruisingRoom(country.toUpperCase(), city, since);
    return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = isApiError(error) ? roomProxiedStatus(error.status) : 502;
    return NextResponse.json(
      { error: 'unavailable' },
      { status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
