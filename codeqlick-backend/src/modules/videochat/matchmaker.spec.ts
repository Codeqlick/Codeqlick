import { describe, expect, it } from 'vitest';
import { Matchmaker, WindowLimiter, type Participant } from './matchmaker.js';

function person(id: string, userId = `user-${id}`, blocked: string[] = []): Participant {
  return { id, userId, blocked: new Set(blocked) };
}

describe('Matchmaker', () => {
  it('queues the first person and pairs the second with them', () => {
    const mm = new Matchmaker();
    const a = person('a');
    const b = person('b');
    expect(mm.join(a)).toEqual({ status: 'waiting' });
    expect(mm.join(b)).toEqual({ status: 'matched', partner: a });
    expect(mm.partnerOf('a')).toBe(b);
    expect(mm.partnerOf('b')).toBe(a);
    expect(mm.waitingCount).toBe(0);
    expect(mm.callCount).toBe(1);
  });

  it('never pairs people who blocked each other, in either direction', () => {
    const mm = new Matchmaker();
    mm.join(person('a', 'ua', ['ub']));
    expect(mm.join(person('b', 'ub'))).toEqual({ status: 'waiting' });
    expect(mm.waitingCount).toBe(2);
  });

  it('never pairs two sockets of the same account', () => {
    const mm = new Matchmaker();
    mm.join(person('a', 'same'));
    expect(mm.join(person('b', 'same'))).toEqual({ status: 'waiting' });
  });

  it('keeps the last partner apart only until the cooldown ends', () => {
    const now = 1_000_000;
    const a = { ...person('a', 'ua'), lastPartner: { userId: 'ub', until: now + 60_000 } };
    const b = person('b', 'ub');
    expect(Matchmaker.compatible(a, b, now)).toBe(false);
    expect(Matchmaker.compatible(b, a, now)).toBe(false);
    expect(Matchmaker.compatible(a, b, now + 60_001)).toBe(true);
  });

  it('picks among the five who waited longest', () => {
    const mm = new Matchmaker();
    // One account in eight tabs: they never pair with each other, so all eight wait.
    for (let i = 0; i < 8; i += 1) mm.join(person(`w${i}`, 'waiter'));
    const result = mm.join(person('new'), () => 0.99);
    expect(result).toEqual({ status: 'matched', partner: expect.objectContaining({ id: 'w4' }) });
  });

  it('remove ends a call and returns the partner; ends a wait silently', () => {
    const mm = new Matchmaker();
    const a = person('a');
    const b = person('b');
    mm.join(a);
    mm.join(b);
    expect(mm.remove('a')).toBe(b);
    expect(mm.partnerOf('b')).toBeUndefined();
    expect(mm.callCount).toBe(0);
    mm.join(person('c'));
    expect(mm.remove('c')).toBeUndefined();
    expect(mm.waitingCount).toBe(0);
  });

  it('joining again first leaves the current call', () => {
    const mm = new Matchmaker();
    const a = person('a');
    const b = person('b');
    mm.join(a);
    mm.join(b);
    expect(mm.join(a)).toEqual({ status: 'waiting' });
    expect(mm.partnerOf('b')).toBeUndefined();
  });
});

describe('WindowLimiter', () => {
  it('allows `limit` events per window', () => {
    const limiter = new WindowLimiter(2, 1_000);
    expect(limiter.take(0)).toBe(true);
    expect(limiter.take(10)).toBe(true);
    expect(limiter.take(20)).toBe(false);
    expect(limiter.take(1_000)).toBe(true);
  });
});
