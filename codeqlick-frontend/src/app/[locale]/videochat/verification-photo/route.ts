import { fetchSwipeImage } from '@/lib/api/swipe';

/** My own verification photo, the one shared by the 18+ apps (the API checks who asks; BFF). */
export async function GET() {
  return fetchSwipeImage('/adult/verification/file');
}
