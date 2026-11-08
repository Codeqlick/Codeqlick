import type { SwipeCard, SwipeMessage } from '@/lib/api/swipe';

// The deck's and the chat's pure helpers, kept apart from React so they can be unit tested.

/** Pixels a card must be dragged sideways to count as a like or a skip. */
export const SWIPE_THRESHOLD = 100;

/** Which way a drag of `dx` pixels votes: like (right), skip (left), or not yet. */
export function dragVote(dx: number): 'like' | 'skip' | null {
  if (dx >= SWIPE_THRESHOLD) return 'like';
  if (dx <= -SWIPE_THRESHOLD) return 'skip';
  return null;
}

/** Adds the cards not already in `current` (the deck asks for more while showing some). */
export function mergeCards(
  current: SwipeCard[],
  more: SwipeCard[],
  seen: Set<string>,
): SwipeCard[] {
  const known = new Set([...current.map((card) => card.id), ...seen]);
  return [...current, ...more.filter((card) => !known.has(card.id))];
}

/** How often the chat asks for new messages while it is open and visible. */
export const POLL_MS = 4000;

/** Adds messages not already listed, in time order. */
export function mergeMessages(current: SwipeMessage[], more: SwipeMessage[]): SwipeMessage[] {
  const known = new Set(current.map((message) => message.id));
  return [...current, ...more.filter((message) => !known.has(message.id))].toSorted((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
}
