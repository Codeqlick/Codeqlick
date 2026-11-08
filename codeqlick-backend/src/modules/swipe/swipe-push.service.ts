import { ConflictException, Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import { AppConfigService } from '../../config/app-config.service.js';
import { SwipeRepository } from './swipe.repository.js';
import { SWIPE_TERMS_VERSION, type PushSubscriptionInput } from './swipe.schemas.js';

export type SwipePushKind = 'match' | 'message' | 'loved';

/** Discreet on a lock screen: no nickname, no photo, no message text. */
const TEXT = {
  es: {
    match: 'Tienes un match nuevo',
    message: 'Tienes un mensaje nuevo',
    loved: 'A alguien le encanta una de tus fotos',
  },
  en: {
    match: 'You have a new match',
    message: 'You have a new message',
    loved: 'Someone loves one of your photos',
  },
} as const;

const PATHS: Record<SwipePushKind, string> = {
  match: '/matches',
  message: '/matches',
  loved: '/deck',
};

/** Swipe's Web Push notifications (architecture 4.10). Off without VAPID keys. */
@Injectable()
export class SwipePushService {
  private readonly logger = new Logger(SwipePushService.name);

  constructor(
    private readonly repository: SwipeRepository,
    private readonly config: AppConfigService,
  ) {}

  /** The VAPID public key browsers subscribe with; null while notifications are off. */
  get publicKey(): string | null {
    return this.config.vapid?.publicKey ?? null;
  }

  async subscribe(userId: string, input: PushSubscriptionInput): Promise<void> {
    if (!this.config.vapid) throw new ConflictException('Notifications are not available');
    const profile = await this.repository.findProfile(userId);
    if (profile?.termsVersion !== SWIPE_TERMS_VERSION) {
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

  /** Tells every browser of `userId` about `kind`; never throws. */
  async notify(userId: string, kind: SwipePushKind): Promise<void> {
    const vapid = this.config.vapid;
    if (!vapid) return;
    try {
      const rows = await this.repository.pushSubscriptionsOf(userId);
      await Promise.all(
        rows.map(async (row) => {
          const locale = row.locale === 'es' ? 'es' : 'en';
          const payload = JSON.stringify({
            title: 'Swipe',
            body: TEXT[locale][kind],
            url: `/${locale}${PATHS[kind]}`,
            tag: `swipe-${kind}`,
          });
          try {
            await webpush.sendNotification(
              { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
              payload,
              { vapidDetails: vapid, TTL: 6 * 60 * 60, urgency: 'normal' },
            );
          } catch (error) {
            const status = (error as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
              await this.repository.deletePushSubscription(row.endpoint);
            } else {
              this.logger.warn(`Swipe push failed (${status ?? 'network'})`);
            }
          }
        }),
      );
    } catch (error) {
      this.logger.error(`Swipe push not sent: ${String(error)}`);
    }
  }
}
