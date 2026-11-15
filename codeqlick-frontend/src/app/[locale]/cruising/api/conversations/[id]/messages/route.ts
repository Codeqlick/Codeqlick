import { NextResponse } from 'next/server';
import { listCruisingMessages } from '@/lib/api/cruising';
import { isApiError } from '@/lib/api/errors';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The messages of a conversation newer than `?after=` (an ISO time), for the open chat, which asks
 * every 4 seconds (a BFF: the browser never calls the API). Private: the API decides whether the
 * conversation is the signed-in member's, and asking marks the messages read.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const after = new URL(request.url).searchParams.get('after');
  if (after !== null && Number.isNaN(Date.parse(after))) {
    return NextResponse.json({ error: 'invalid after' }, { status: 400 });
  }
  try {
    const items = await listCruisingMessages(id, after ?? undefined);
    return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status =
      isApiError(error) && [401, 403, 404, 429].includes(error.status) ? error.status : 502;
    return NextResponse.json(
      { error: 'unavailable' },
      { status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
