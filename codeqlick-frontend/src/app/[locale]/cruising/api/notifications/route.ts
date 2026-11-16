import { NextResponse } from 'next/server';
import { listCruisingNotifications } from '@/lib/api/cruising-notifications';
import { isApiError } from '@/lib/api/errors';

const PRIVATE = { 'Cache-Control': 'private, no-store' };

/**
 * The unread count of my notification centre (decision 98), for the bell in the app's header (a
 * BFF: the browser never calls the API). Only the count leaves: the bell needs nothing more.
 */
export async function GET() {
  try {
    const { unread } = await listCruisingNotifications();
    return NextResponse.json({ unread }, { headers: PRIVATE });
  } catch (error) {
    const status = isApiError(error) && [401, 403, 429].includes(error.status) ? error.status : 502;
    return NextResponse.json({ error: 'unavailable' }, { status, headers: PRIVATE });
  }
}
