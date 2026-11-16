import { Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import { AppConfigService } from '../../config/app-config.service.js';
import { pushPayload, type PushKind } from './cruising.rules.js';
import { CruisingRepository } from './cruising.repository.js';

/** A device to notify. */
export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Cruising's Web Push (architecture 4.15, decision 85), with the video chat's VAPID keys: off
 * without them. The texts name neither a spot nor a person.
 */
@Injectable()
export class CruisingPushService {
  private readonly logger = new Logger(CruisingPushService.name);

  constructor(
    private readonly repository: CruisingRepository,
    private readonly config: AppConfigService,
  ) {}

  /** The VAPID public key browsers subscribe with; null while notifications are off. */
  get publicKey(): string | null {
    return this.config.vapid?.publicKey ?? null;
  }

  get enabled(): boolean {
    return this.config.vapid !== undefined;
  }

  /**
   * Notifies every device of the given members, each in their account's language; returns how many
   * notifications the push services accepted. A subscription they say is gone is deleted.
   */
  async notify(
    kind: PushKind,
    members: { userId: string; locale: 'en' | 'es' }[],
  ): Promise<number> {
    // A check-in lasts hours, a safety alert a few more; the rest is worth telling for a day.
    return this.notifyWith((locale) => pushPayload(kind, locale), members, {
      ttl: kind === 'favorite' ? 60 * 60 : kind === 'safety' ? 6 * 60 * 60 : 24 * 60 * 60,
    });
  }

  /**
   * Notifies every device of the given members with the payload `payloadFor` builds in each one's
   * language (phase 5's own notifications); returns how many the push services accepted.
   */
  async notifyWith(
    payloadFor: (locale: 'en' | 'es') => object,
    members: { userId: string; locale: 'en' | 'es' }[],
    { ttl, urgency = 'normal' }: { ttl: number; urgency?: 'normal' | 'high' },
  ): Promise<number> {
    const vapid = this.config.vapid;
    if (!vapid || members.length === 0) return 0;
    const locales = new Map(members.map((member) => [member.userId, member.locale]));
    const devices = await this.repository.pushSubscriptions([...locales.keys()]);
    const options = { vapidDetails: vapid, TTL: ttl, urgency };
    const results = await Promise.all(
      devices.map((device) =>
        this.deliver(
          device,
          JSON.stringify(payloadFor(locales.get(device.userId) ?? 'en')),
          options,
        ),
      ),
    );
    return results.filter(Boolean).length;
  }

  /** Whether any of a member's devices can be notified. */
  async hasDevice(userId: string): Promise<boolean> {
    if (!this.enabled) return false;
    return (await this.repository.pushSubscriptions([userId])).length > 0;
  }

  /** Sends one notification (the only network call; tests replace it). */
  send(target: PushTarget, payload: string, options: webpush.RequestOptions): Promise<unknown> {
    return webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      payload,
      options,
    );
  }

  private async deliver(
    target: PushTarget,
    payload: string,
    options: webpush.RequestOptions,
  ): Promise<boolean> {
    try {
      await this.send(target, payload, options);
      return true;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await this.repository.deletePushSubscription(target.endpoint).catch(() => undefined);
      } else {
        this.logger.warn(`Cruising push failed (${status ?? 'network'})`);
      }
      return false;
    }
  }
}
