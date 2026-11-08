import { ConflictException, Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import { AppConfigService } from '../../config/app-config.service.js';
import { accepts, type MatchPrefs } from './matchmaker.js';
import { VideochatRepository } from './videochat.repository.js';
import { VIDEOCHAT_TERMS_VERSION, type PushSubscriptionInput } from './videochat.schemas.js';

/** An account is notified at most once in this time. */
export const PUSH_COOLDOWN_MS = 6 * 60 * 60 * 1000;
/** At most this many accounts per notification round… */
export const PUSH_MAX_ACCOUNTS = 20;
/** …and at most one round in this time. */
export const PUSH_ROUND_MS = 60_000;

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

  constructor(
    private readonly repository: VideochatRepository,
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
        }),
    );
    return recipients.size;
  }
}
