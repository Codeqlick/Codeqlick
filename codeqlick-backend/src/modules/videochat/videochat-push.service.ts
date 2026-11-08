import { ConflictException, Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import { AppConfigService } from '../../config/app-config.service.js';
import { accepts, type MatchPrefs } from './matchmaker.js';
import { STATS_TIME_ZONE, VideochatStatsRepository } from './videochat-stats.repository.js';
import { VideochatRepository } from './videochat.repository.js';
import { VIDEOCHAT_TERMS_VERSION, type PushSubscriptionInput } from './videochat.schemas.js';

/** An account is notified at most once in this time. */
export const PUSH_COOLDOWN_MS = 6 * 60 * 60 * 1000;
/** At most this many accounts per notification round… */
export const PUSH_MAX_ACCOUNTS = 20;
/** …and at most one round in this time. */
export const PUSH_ROUND_MS = 60_000;

/** Peak time: at least this many people connected now… */
export const PEAK_MIN_ONLINE = 5;
/** …in one of the busiest hours (most calls over the last PEAK_DAYS days, at least PEAK_MIN_CALLS). */
export const PEAK_TOP_HOURS = 3;
export const PEAK_MIN_CALLS = 3;
export const PEAK_DAYS = 14;
/** An account gets at most one peak time alert in this time… */
export const PEAK_COOLDOWN_MS = 20 * 60 * 60 * 1000;
/** …and at most this many accounts are alerted per round. */
export const PEAK_MAX_SUBSCRIPTIONS = 500;
/** The busiest hours are computed again after this long. */
const PEAK_HOURS_TTL_MS = 60 * 60 * 1000;

const PEAK_TEXT = {
  en: (count: number) => ({
    title: 'Codeqlick Videochat',
    body: `It's peak time in the video chat: ${count} people are online now.`,
  }),
  es: (count: number) => ({
    title: 'Codeqlick Videochat',
    body: `Es hora punta en el videochat: hay ${count} personas conectadas ahora.`,
  }),
} as const;

/** The busiest hours of the day (0–23): the top PEAK_TOP_HOURS with at least PEAK_MIN_CALLS calls. */
export function peakHours(rows: Array<{ hour: number; total: number }>): Set<number> {
  return new Set(
    rows
      .filter((row) => row.total >= PEAK_MIN_CALLS && row.hour >= 0 && row.hour < 24)
      .toSorted((a, b) => b.total - a.total || a.hour - b.hour)
      .slice(0, PEAK_TOP_HOURS)
      .map((row) => row.hour),
  );
}

/** The hour of the day (0–23) of `date` in Europe/Madrid. */
export function madridHour(date: Date): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: STATS_TIME_ZONE,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  return Number(hour) % 24;
}

const TEXT = {
  en: { title: 'Codeqlick Videochat', body: 'Someone is waiting in the video chat. Come say hi!' },
  es: {
    title: 'Codeqlick Videochat',
    body: 'Hay alguien esperando en el videochat. ¡Entra a saludar!',
  },
} as const;

/** The person waiting: who they are, whom they blocked (either way) and their filters. */
export interface Waiter {
  userId: string;
  blocked: ReadonlySet<string>;
  prefs?: MatchPrefs;
}

export interface PushCandidate {
  userId: string;
  prefs?: MatchPrefs;
}

/**
 * The accounts to notify about `waiter`: no block between them, filters that match both ways,
 * at most `max` accounts (in the given order, newest subscriptions first).
 */
export function pickRecipients(waiter: Waiter, candidates: PushCandidate[], max: number): string[] {
  const picked: string[] = [];
  for (const candidate of candidates) {
    if (picked.length >= max) break;
    if (candidate.userId === waiter.userId || picked.includes(candidate.userId)) continue;
    if (waiter.blocked.has(candidate.userId)) continue;
    if (!accepts(waiter.prefs, candidate.prefs) || !accepts(candidate.prefs, waiter.prefs))
      continue;
    picked.push(candidate.userId);
  }
  return picked;
}

/** "Someone is waiting" Web Push notifications (architecture 4.7). Off without VAPID keys. */
@Injectable()
export class VideochatPushService {
  private readonly logger = new Logger(VideochatPushService.name);
  private lastRound = 0;
  private busiest?: { hours: Set<number>; at: number };

  constructor(
    private readonly repository: VideochatRepository,
    private readonly stats: VideochatStatsRepository,
    private readonly config: AppConfigService,
  ) {}

  /** The VAPID public key browsers subscribe with; null while notifications are off. */
  get publicKey(): string | null {
    return this.config.vapid?.publicKey ?? null;
  }

  get enabled(): boolean {
    return this.config.vapid !== undefined;
  }

  async subscribe(userId: string, input: PushSubscriptionInput): Promise<void> {
    if (!this.enabled) throw new ConflictException('Notifications are not available');
    const profile = await this.repository.findProfile(userId);
    if (profile?.termsVersion !== VIDEOCHAT_TERMS_VERSION) {
      throw new ConflictException('Confirm your age and accept the rules first');
    }
    await this.repository.savePushSubscription(userId, {
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      locale: input.locale,
    });
  }

  /** Peak time alerts for the account (on any of its subscribed browsers). */
  async setPeakAlerts(userId: string, on: boolean): Promise<{ on: boolean }> {
    const profile = await this.repository.findProfile(userId);
    if (profile?.termsVersion !== VIDEOCHAT_TERMS_VERSION) {
      throw new ConflictException('Confirm your age and accept the rules first');
    }
    await this.repository.setPeakAlerts(userId, on);
    return { on };
  }

  /** Whether `now` is peak time with `online` people connected (the busiest hours are cached). */
  async isPeak(online: number, now: Date = new Date()): Promise<boolean> {
    if (online < PEAK_MIN_ONLINE) return false;
    if (!this.busiest || now.getTime() - this.busiest.at >= PEAK_HOURS_TTL_MS) {
      const since = new Date(now.getTime() - PEAK_DAYS * 24 * 60 * 60 * 1000);
      this.busiest = { hours: peakHours(await this.stats.callsByHour(since)), at: now.getTime() };
    }
    return this.busiest.hours.has(madridHour(now));
  }

  /**
   * At peak time, alerts the accounts that asked for it and aren't connected (`onlineUserIds`),
   * at most once every 20 hours each. Returns how many accounts were alerted.
   */
  async peakTime(online: number, onlineUserIds: string[], now: Date = new Date()): Promise<number> {
    const vapid = this.config.vapid;
    if (!vapid || !(await this.isPeak(online, now))) return 0;
    const rows = await this.repository.peakCandidates({
      termsVersion: VIDEOCHAT_TERMS_VERSION,
      notifiedBefore: new Date(now.getTime() - PEAK_COOLDOWN_MS),
      now,
      excludeUserIds: onlineUserIds,
      take: PEAK_MAX_SUBSCRIPTIONS,
    });
    const accounts = [...new Set(rows.map((row) => row.userId))];
    if (accounts.length === 0) return 0;
    await this.repository.markPeakNotified(accounts, now);
    const options = { vapidDetails: vapid, TTL: 30 * 60, urgency: 'normal' as const };
    await Promise.all(
      rows.map((row) => {
        const text = (row.locale === 'es' ? PEAK_TEXT.es : PEAK_TEXT.en)(online);
        return this.deliver(row, JSON.stringify({ ...text, url: `/${row.locale}/room` }), options);
      }),
    );
    return accounts.length;
  }

  /** Sends one notification; a subscription the push service says is gone is deleted. */
  private async deliver(
    row: { endpoint: string; p256dh: string; auth: string },
    payload: string,
    options: webpush.RequestOptions,
  ): Promise<void> {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        payload,
        options,
      );
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await this.repository.deletePushSubscription(row.endpoint);
      } else {
        this.logger.warn(`Push notification failed (${status ?? 'network'})`);
      }
    }
  }

  unsubscribe(userId: string, endpoint: string): Promise<void> {
    return this.repository.deletePushSubscription(endpoint, userId);
  }

  /**
   * Someone has been waiting alone: tell up to 20 matching accounts that aren't connected
   * (`onlineUserIds`). Returns how many accounts were notified.
   */
  async someoneWaiting(
    waiter: Waiter,
    onlineUserIds: Iterable<string>,
    now: Date = new Date(),
  ): Promise<number> {
    const vapid = this.config.vapid;
    if (!vapid) return 0;
    if (now.getTime() - this.lastRound < PUSH_ROUND_MS) return 0;
    this.lastRound = now.getTime();

    const rows = await this.repository.pushCandidates({
      termsVersion: VIDEOCHAT_TERMS_VERSION,
      notifiedBefore: new Date(now.getTime() - PUSH_COOLDOWN_MS),
      now,
      excludeUserIds: [waiter.userId, ...onlineUserIds],
      take: 500,
    });
    const recipients = new Set(
      pickRecipients(
        waiter,
        rows.map((row) => ({
          userId: row.userId,
          prefs: row.user.videochatProfile ?? undefined,
        })),
        PUSH_MAX_ACCOUNTS,
      ),
    );
    if (recipients.size === 0) return 0;
    await this.repository.markPushNotified([...recipients], now);

    const options = {
      vapidDetails: vapid,
      TTL: 15 * 60,
      urgency: 'normal' as const,
    };
    await Promise.all(
      rows
        .filter((row) => recipients.has(row.userId))
        .map(async (row) => {
          const text = row.locale === 'es' ? TEXT.es : TEXT.en;
          const payload = JSON.stringify({ ...text, url: `/${row.locale}/room` });
          await this.deliver(row, payload, options);
        }),
    );
    return recipients.size;
  }
}
