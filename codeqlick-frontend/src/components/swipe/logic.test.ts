import { describe, expect, it } from 'vitest';
import type { SwipeCard, SwipeMessage } from '@/lib/api/swipe';
import { fitWithin } from './compress';
import { dragVote, mergeCards, mergeMessages, SWIPE_THRESHOLD } from './logic';

function card(id: string): SwipeCard {
  return {
    id,
    ref: id.toUpperCase(),
    width: 600,
    height: 800,
    nickname: 'Ana',
    gender: null,
    interests: [],
    bio: null,
    lovesYou: false,
  };
}

function message(id: string, createdAt: string): SwipeMessage {
  return { id, mine: false, text: id, createdAt };
}

describe('swipe deck', () => {
  it('votes only once the card is dragged far enough', () => {
    expect(dragVote(SWIPE_THRESHOLD)).toBe('like');
    expect(dragVote(-SWIPE_THRESHOLD - 20)).toBe('skip');
    expect(dragVote(SWIPE_THRESHOLD - 1)).toBeNull();
    expect(dragVote(0)).toBeNull();
  });

  it('adds new cards without repeating shown or voted ones', () => {
    const merged = mergeCards(
      [card('a'), card('b')],
      [card('b'), card('c'), card('d')],
      new Set(['d']),
    );
    expect(merged.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('swipe chat', () => {
  it('adds new messages once, in time order', () => {
    const current = [
      message('1', '2026-11-08T10:00:00.000Z'),
      message('3', '2026-11-08T10:02:00.000Z'),
    ];
    const merged = mergeMessages(current, [
      message('3', '2026-11-08T10:02:00.000Z'),
      message('2', '2026-11-08T10:01:00.000Z'),
    ]);
    expect(merged.map((item) => item.id)).toEqual(['1', '2', '3']);
  });
});

describe('photo compression', () => {
  it('shrinks the longest side and keeps the shape', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(1080, 1920, 1600)).toEqual({ width: 900, height: 1600 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});
