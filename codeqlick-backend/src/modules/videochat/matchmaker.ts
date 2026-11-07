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
}

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
    // Filters hold both ways: each one fits what the other is looking for.
    return accepts(a.prefs, b.prefs) && accepts(b.prefs, a.prefs);
  }

  /**
   * Puts someone in the queue, or pairs them with someone waiting (picked at random among the
   * compatible ones; only the five oldest are candidates, so nobody waits forever).
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
    const pool = candidates.slice(0, 5);
    const partner = pool[Math.floor(random() * pool.length)] as Participant;
    this.queue.splice(this.queue.indexOf(partner), 1);
    this.pairs.set(participant.id, partner);
    this.pairs.set(partner.id, participant);
    return { status: 'matched', partner };
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
