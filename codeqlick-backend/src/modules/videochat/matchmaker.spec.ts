import { describe, expect, it } from 'vitest';
import { Matchmaker, WindowLimiter, type MatchPrefs, type Participant } from './matchmaker.js';

function person(id: string, userId = `user-${id}`, blocked: string[] = []): Participant {
  return { id, userId, blocked: new Set(blocked) };
}

function prefs(overrides: Partial<MatchPrefs>): MatchPrefs {
  return {
    gender: null,
    seeking: [],
    country: null,
    language: null,
    sameCountryOnly: false,
    sameLanguageOnly: false,
    ...overrides,
  };
}

describe('Matchmaker', () => {
  it('applies the filters both ways', () => {
    const woman = { ...person('w'), prefs: prefs({ gender: 'WOMAN', seeking: ['MAN'] }) };
    const man = { ...person('m'), prefs: prefs({ gender: 'MAN' }) };
    const otherWoman = { ...person('o'), prefs: prefs({ gender: 'WOMAN' }) };
    const unset = person('u');
    expect(Matchmaker.compatible(woman, man)).toBe(true);
    // She only wants men; the other woman takes anyone, but the filter holds both ways.
    expect(Matchmaker.compatible(woman, otherWoman)).toBe(false);
    expect(Matchmaker.compatible(otherWoman, woman)).toBe(false);
    // Without a gender, only people who take anyone.
    expect(Matchmaker.compatible(woman, unset)).toBe(false);
    expect(Matchmaker.compatible(man, unset)).toBe(true);
  });

  it('keeps "same country" and "same language" to people who share them', () => {
    const es = { ...person('a'), prefs: prefs({ country: 'ES', sameCountryOnly: true }) };
    const es2 = { ...person('b'), prefs: prefs({ country: 'ES' }) };
    const mx = { ...person('c'), prefs: prefs({ country: 'MX' }) };
    const none = person('d');
    expect(Matchmaker.compatible(es, es2)).toBe(true);
    expect(Matchmaker.compatible(es, mx)).toBe(false);
    expect(Matchmaker.compatible(none, es)).toBe(false);
    const en = { ...person('e'), prefs: prefs({ language: 'en', sameLanguageOnly: true }) };
    const en2 = { ...person('f'), prefs: prefs({ language: 'en' }) };
    expect(Matchmaker.compatible(en, en2)).toBe(true);
    expect(Matchmaker.compatible(en, mx)).toBe(false);
    // Asking for the same country without having one matches nobody.
    const lost = { ...person('g'), prefs: prefs({ sameCountryOnly: true }) };
    expect(Matchmaker.compatible(lost, es2)).toBe(false);
  });

  it('skips waiting people the filters rule out and pairs with a later one', () => {
    const mm = new Matchmaker();
    const man = { ...person('m'), prefs: prefs({ gender: 'MAN', seeking: ['MAN'] }) };
    const woman = { ...person('w'), prefs: prefs({ gender: 'WOMAN' }) };
    expect(mm.join(man)).toEqual({ status: 'waiting' });
    // The waiting man only wants men, so the woman waits too.
    expect(mm.join(woman)).toEqual({ status: 'waiting' });
    const seeker = { ...person('s'), prefs: prefs({ gender: 'MAN', seeking: ['WOMAN'] }) };
    // Skips the first in line (he wants men) and takes the woman.
    expect(mm.join(seeker)).toEqual({ status: 'matched', partner: woman });
    expect(mm.waitingCount).toBe(1);
  });

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

  it('pairs people left waiting once their cooldown runs out', () => {
    const matchmaker = new Matchmaker();
    const ana = { ...person('a'), lastPartner: { userId: 'user-b', until: 1_000 } };
    const ben = { ...person('b'), lastPartner: { userId: 'user-a', until: 1_000 } };
    const cai = person('c', 'user-c', ['user-a', 'user-b']);
    matchmaker.join(ana, () => 0, 0);
    matchmaker.join(ben, () => 0, 0);
    matchmaker.join(cai, () => 0, 0);
    expect(matchmaker.waitingCount).toBe(3);
    expect(matchmaker.pairWaiting(999)).toEqual([]);

    expect(matchmaker.pairWaiting(1_000)).toEqual([[ana, ben]]);
    expect(matchmaker.partnerOf('a')).toBe(ben);
    expect(matchmaker.waiting).toEqual([cai]);
  });

  it('picks among the three who waited longest when nothing else tells them apart', () => {
    const mm = new Matchmaker();
    // One account in eight tabs: they never pair with each other, so all eight wait.
    for (let i = 0; i < 8; i += 1) mm.join(person(`w${i}`, 'waiter'));
    const result = mm.join(person('new'), () => 0.99);
    expect(result).toEqual({ status: 'matched', partner: expect.objectContaining({ id: 'w2' }) });
  });

  it('prefers someone not met today, then more interests in common', () => {
    const mm = new Matchmaker();
    const met = { ...person('met'), interests: ['music', 'travel'] };
    const one = { ...person('one'), interests: ['music'] };
    const two = { ...person('two'), interests: ['music', 'travel', 'books'] };
    for (const p of [met, one, two]) mm.join(p);
    const me = {
      ...person('me'),
      interests: ['music', 'travel'],
      recent: new Set(['user-met']),
    };
    expect(mm.join(me, () => 0)).toEqual({ status: 'matched', partner: two });
    // Only someone already met is left: they still meet.
    mm.remove('me');
    mm.join(one);
    const again = { ...person('me2', 'user-me'), recent: new Set(['user-met', 'user-one']) };
    expect(Matchmaker.best(again, [met, one])).toEqual([met, one]);
  });

  it('a widened wait skips only its own filters', () => {
    const picky = { ...person('p'), prefs: prefs({ gender: 'MAN', seeking: ['WOMAN'] }) };
    const man = { ...person('m'), prefs: prefs({ gender: 'MAN' }) };
    const choosy = { ...person('c'), prefs: prefs({ gender: 'MAN', seeking: ['WOMAN'] }) };
    expect(Matchmaker.compatible(picky, man)).toBe(false);
    expect(Matchmaker.compatible({ ...picky, widened: true }, man)).toBe(true);
    // The other person's filters still hold.
    expect(Matchmaker.compatible({ ...picky, widened: true }, choosy)).toBe(false);
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
