import { NextResponse } from 'next/server';
import { searchCruising } from '@/lib/api/cruising';
import { isApiError } from '@/lib/api/errors';
import { searchText } from '@/lib/cruising';

/**
 * The map's search box: cities and spots by text (a BFF: the browser never calls the API).
 * Public, no session. Only the text is sent, never where the person is or looks.
 */
export async function GET(request: Request) {
  const text = searchText(new URL(request.url).searchParams.get('q'));
  if (!text) return NextResponse.json({ error: 'invalid q' }, { status: 400 });
  try {
    const result = await searchCruising(text);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'public, max-age=60' } });
  } catch (error) {
    const status = isApiError(error) && error.status === 429 ? 429 : 502;
    return NextResponse.json({ error: 'unavailable' }, { status });
  }
}
