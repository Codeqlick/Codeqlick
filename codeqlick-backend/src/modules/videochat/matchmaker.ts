/**
 * The video chat's random pairing, in memory (one API instance; architecture 4.7). Pure: no I/O,
 * so it is unit tested on its own. The gateway owns the sockets and calls it.
 */

export type Gender = 'WOMAN' | 'MAN' | 'NONBINARY';

/** What a person is and looks for (their public profile and filters; architecture 4.7). */
export interface MatchPrefs {
  gender: Gender | null;
  /** Empty: anyone. */
  seeking: Gender[];
  country: string | null;
  language: string | null;
  sameCountryOnly: boolean;
  sameLanguageOnly: boolean;
}

export interface Participant {
  /** One per WebSocket. */
  id: string;
  userId: string;
  /** Users this person blocked or was blocked by (both directions). */
  blocked: Set<string>;
  /** The person they talked to last: not matched again with them until `until` (ms). */
  lastPartner?: { userId: string; until: number };
  /** Filters; none: anyone, and fits anyone's filters that ask for nothing. */
  prefs?: MatchPrefs;
  /** This wait ignores the person's own filters (never the other person's). */
  widened?: boolean;
  /** Interests from the fixed list: people sharing more meet first. */
  interests?: readonly string[];
  /** Accounts talked to in the last 24 hours: people not in it meet first. */
  recent?: { has(userId: string): boolean };
}

/** Whether the person's filters narrow who they meet. */
export function hasFilters(prefs: MatchPrefs | undefined): boolean {
  return !!prefs && (prefs.seeking.length > 0 || prefs.sameCountryOnly || prefs.sameLanguageOnly);
}

/** Interests two people share. */
export function sharedInterests(a: Participant, b: Participant): string[] {
  const theirs = new Set(b.interests ?? []);
  return (a.interests ?? []).filter((interest) => theirs.has(interest));
}

/** How many of the best-ranked candidates the pick is random among. */
const PICK_AMONG = 3;

/** Whether `a`'s filters accept `b` (one direction). */
export function accepts(a: MatchPrefs | undefined, b: MatchPrefs | undefined): boolean {
  if (!a) return true;
  if (a.seeking.length > 0 && !(b?.gender && a.seeking.includes(b.gender))) return false;
  if (a.sameCountryOnly && !(a.country && b?.country === a.country)) return false;
  if (a.sameLanguageOnly && !(a.language && b?.language === a.language)) return false;
  return true;
}

export type JoinResult = { status: 'waiting' } | { status: 'matched'; partner: Participant };

export class Matchmaker {
  /** People waiting, oldest first. */
  private readonly queue: Participant[] = [];
  /** Live calls: participant id → partner. */
  private readonly pairs = new Map<string, Participant>();

  /** Whether two people may be paired. */
  static compatible(a: Participant, b: Participant, now: number = Date.now()): boolean {
    if (a.id === b.id || a.userId === b.userId) return false;
    if (a.blocked.has(b.userId) || b.blocked.has(a.userId)) return false;
    const recent = (p: Participant, other: Participant) =>
      p.lastPartner?.userId === other.userId && p.lastPartner.until > now;
    if (recent(a, b) || recent(b, a)) return false;
    // Filters hold both ways: each one fits what the other is looking for (a widened wait skips
    // only that person's own filters).
    return (a.widened || accepts(a.prefs, b.prefs)) && (b.widened || accepts(b.prefs, a.prefs));
  }

  /**
   * The candidates `participant` should meet now: those tied for best on, in order, not having
   * met in the last 24 hours and most interests in common; at most three, who waited longest.
   */
  static best(participant: Participant, candidates: Participant[]): Participant[] {
    const met = (other: Participant) =>
      participant.recent?.has(other.userId) || other.recent?.has(participant.userId) ? 1 : 0;
    const ranked = candidates
      .map((other, index) => ({
        other,
        index,
        met: met(other),
        shared: sharedInterests(participant, other).length,
      }))
      .sort((x, y) => x.met - y.met || y.shared - x.shared || x.index - y.index);
    const top = ranked[0];
    if (!top) return [];
    return ranked
      .filter((entry) => entry.met === top.met && entry.shared === top.shared)
      .slice(0, PICK_AMONG)
      .map((entry) => entry.other);
  }

  /**
   * Puts someone in the queue, or pairs them with someone waiting: at random among the best
   * compatible people (see `best`).
   */
  join(
    participant: Participant,
    random: () => number = Math.random,
    now: number = Date.now(),
  ): JoinResult {
    this.remove(participant.id);
    const candidates = this.queue.filter((other) => Matchmaker.compatible(participant, other, now));
    if (candidates.length === 0) {
      this.queue.push(participant);
      return { status: 'waiting' };
    }
    const pool = Matchmaker.best(participant, candidates);
    const partner = pool[Math.floor(random() * pool.length)] as Participant;
    this.queue.splice(this.queue.indexOf(partner), 1);
    this.pairs.set(participant.id, partner);
    this.pairs.set(partner.id, participant);
    return { status: 'matched', partner };
  }

  /**
   * Pairs people already waiting who may meet now (a rematch cooldown ran out). Oldest first;
   * in each pair the first one waited longer.
   */
  pairWaiting(now: number = Date.now()): Array<[Participant, Participant]> {
    const pairs: Array<[Participant, Participant]> = [];
    for (let i = 0; i < this.queue.length; i++) {
      const older = this.queue[i] as Participant;
      const j = this.queue.findIndex(
        (other, index) => index > i && Matchmaker.compatible(older, other, now),
      );
      if (j === -1) continue;
      const newer = this.queue[j] as Participant;
      this.queue.splice(j, 1);
      this.queue.splice(i, 1);
      i--;
      this.pairs.set(older.id, newer);
      this.pairs.set(newer.id, older);
      pairs.push([older, newer]);
    }
    return pairs;
  }

  /** Puts two people in a call directly (a call between contacts), out of the queue. */
  pair(a: Participant, b: Participant): void {
    this.remove(a.id);
    this.remove(b.id);
    this.pairs.set(a.id, b);
    this.pairs.set(b.id, a);
  }

  /** Everyone waiting, oldest first. */
  get waiting(): readonly Participant[] {
    return this.queue;
  }

  partnerOf(participantId: string): Participant | undefined {
    return this.pairs.get(participantId);
  }

  isWaiting(participantId: string): boolean {
    return this.queue.some((p) => p.id === participantId);
  }

  /**
   * Ends whatever the participant is in (queue or call). Returns the partner of the call it
   * ended, if any.
   */
  remove(participantId: string): Participant | undefined {
    const index = this.queue.findIndex((p) => p.id === participantId);
    if (index !== -1) this.queue.splice(index, 1);
    const partner = this.pairs.get(participantId);
    if (!partner) return undefined;
    this.pairs.delete(participantId);
    this.pairs.delete(partner.id);
    return partner;
  }

  get waitingCount(): number {
    return this.queue.length;
  }

  get callCount(): number {
    return this.pairs.size / 2;
  }
}

/** Fixed-window counter: at most `limit` events per `windowMs`. */
export class WindowLimiter {
  private windowStart = 0;
  private count = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Records an event; false when it is over the limit. */
  take(now: number = Date.now()): boolean {
    if (now - this.windowStart >= this.windowMs) {
      this.windowStart = now;
      this.count = 0;
    }
    this.count += 1;
    return this.count <= this.limit;
  }
}
