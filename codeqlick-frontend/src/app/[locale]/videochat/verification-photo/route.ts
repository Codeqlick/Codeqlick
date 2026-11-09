import { fetchSwipeImage } from '@/lib/api/swipe';

/** My verification photo while it waits for review (the API checks who asks; BFF). */
export async function GET() {
  return fetchSwipeImage('/videochat/verification/file');
}
